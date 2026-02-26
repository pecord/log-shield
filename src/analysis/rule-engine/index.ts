import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { RawFinding, RuleContext } from "@/analysis/types";
import { checkSqlInjection } from "./rules/sql-injection";
import { checkXss } from "./rules/xss";
import { checkBruteForce } from "./rules/brute-force";
import { checkDirectoryTraversal } from "./rules/directory-traversal";
import { checkCommandInjection } from "./rules/command-injection";
import {
  checkSuspiciousStatus,
  resetSuspiciousStatusCounters,
} from "./rules/suspicious-status";
import { checkMaliciousAgent } from "./rules/malicious-agents";
import { checkRateAnomaly, ERROR_STATUS_REGEX } from "./rules/rate-anomaly";
import { checkPrivilegeEscalation } from "./rules/privilege-escalation";
import { checkDataExfiltration } from "./rules/data-exfiltration";
import {
  detectFormatFromSample,
  normalizeLine,
  parseCsvHeaderLine,
  type LogFormat,
} from "./log-parser";
import { extractIp, extractTimestamp } from "./utils";

/**
 * Type for a per-line rule function.
 * Each function receives a single log line, its 1-based line number,
 * and a shared context object for stateful tracking.
 */
type LineRule = (
  line: string,
  lineNumber: number,
  context: RuleContext
) => RawFinding[];

/**
 * All per-line rule functions to be executed against each log line.
 */
const LINE_RULES: LineRule[] = [
  checkSqlInjection,
  checkXss,
  checkBruteForce,
  checkDirectoryTraversal,
  checkCommandInjection,
  checkSuspiciousStatus,
  checkMaliciousAgent,
  checkPrivilegeEscalation,
  checkDataExfiltration,
];

export interface RuleEngineResult {
  findings: RawFinding[];
  totalLinesProcessed: number;
  skippedLineCount: number;
  logFormat: LogFormat;
}

/** Number of lines to sample for format detection before processing. */
const FORMAT_SAMPLE_SIZE = 10;

/**
 * Run the rule-based threat detection engine against a log file.
 *
 * True streaming implementation — processes each line individually via readline
 * without accumulating all lines into memory. Format is detected from the first
 * 10 lines, then each subsequent line is normalized and processed on-the-fly.
 *
 * Rate-anomaly stats (IP counters, error counts, timestamps) are accumulated
 * in the RuleContext during per-line processing, so the post-processing step
 * only analyzes the pre-collected data without re-scanning all lines.
 */
export async function runRuleEngine(filePath: string): Promise<RuleEngineResult> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  // Phase 1: Sample first N lines for format detection
  const sampleLines: string[] = [];
  let lineIndex = 0;
  let format: LogFormat = "plain";
  let csvHeaders: string[] | undefined;
  const skippedRef = { count: 0 };
  let totalLinesProcessed = 0;

  // Reset any module-level state from previous runs
  resetSuspiciousStatusCounters();

  const context: RuleContext = {
    ipCounters: new Map(),
    ipRequestTimes: new Map(),
    ipDistinctUsers: new Map(),
    ipRequestStats: new Map(),
    totalLines: 0,
    lineIndex: 0,
  };

  const allFindings: RawFinding[] = [];

  for await (const line of rl) {
    totalLinesProcessed++;

    // Phase 1: Collect sample for format detection
    if (lineIndex < FORMAT_SAMPLE_SIZE) {
      sampleLines.push(line);
      if (sampleLines.length === FORMAT_SAMPLE_SIZE) {
        format = detectFormatFromSample(sampleLines);
        if (format === "csv" && sampleLines.length > 0) {
          csvHeaders = parseCsvHeaderLine(sampleLines[0]);
        }
        // Process all buffered sample lines
        for (let i = 0; i < sampleLines.length; i++) {
          processLine(sampleLines[i], i, format, csvHeaders, context, allFindings, skippedRef);
        }
        lineIndex = sampleLines.length;
        continue;
      }
      lineIndex++;
      continue;
    }

    // If we had fewer than FORMAT_SAMPLE_SIZE lines and haven't detected format yet,
    // this won't happen — handled after the loop.

    // Phase 2: Stream-process each line
    processLine(line, lineIndex, format, csvHeaders, context, allFindings, skippedRef);
    lineIndex++;
  }

  // Handle files with fewer lines than FORMAT_SAMPLE_SIZE
  if (lineIndex <= FORMAT_SAMPLE_SIZE && sampleLines.length > 0 && sampleLines.length < FORMAT_SAMPLE_SIZE) {
    format = detectFormatFromSample(sampleLines);
    if (format === "csv" && sampleLines.length > 0) {
      csvHeaders = parseCsvHeaderLine(sampleLines[0]);
    }
    for (let i = 0; i < sampleLines.length; i++) {
      processLine(sampleLines[i], i, format, csvHeaders, context, allFindings, skippedRef);
    }
  }

  // Update totalLines in context for any rules that need it
  context.totalLines = totalLinesProcessed;

  // Post-processing: rate anomaly uses pre-accumulated context stats
  try {
    const rateFindings = checkRateAnomaly(context);
    allFindings.push(...rateFindings);
  } catch (error) {
    console.error(
      "Rate anomaly post-processing error:",
      error instanceof Error ? error.message : error
    );
  }

  // Deduplicate findings by fingerprint
  const seen = new Set<string>();
  const deduplicatedFindings: RawFinding[] = [];

  for (const finding of allFindings) {
    if (!seen.has(finding.fingerprint)) {
      seen.add(finding.fingerprint);
      deduplicatedFindings.push(finding);
    }
  }

  return {
    findings: deduplicatedFindings,
    totalLinesProcessed,
    skippedLineCount: skippedRef.count,
    logFormat: format,
  };
}

/**
 * Process a single line: normalize, run rules, accumulate rate-anomaly stats.
 */
function processLine(
  raw: string,
  index: number,
  format: LogFormat,
  csvHeaders: string[] | undefined,
  context: RuleContext,
  allFindings: RawFinding[],
  skippedRef: { count: number }
): void {
  // Skip CSV header row
  if (format === "csv" && index === 0) return;

  const { normalized, error } = normalizeLine(raw, format, csvHeaders);
  if (error) skippedRef.count++;

  // Skip empty lines
  if (!normalized || normalized.trim().length === 0) {
    skippedRef.count++;
    return;
  }

  context.lineIndex = index;
  const lineNumber = index + 1;

  // Extract timestamp once per line — used for rate-anomaly stats and finding enrichment
  const lineTs = extractTimestamp(normalized);

  // Accumulate rate-anomaly stats on-the-fly (avoids re-scanning)
  const ip = extractIp(normalized);
  if (ip) {
    let stats = context.ipRequestStats.get(ip);
    if (!stats) {
      stats = { total: 0, errors: 0, timestamps: [], sampleLines: [] };
      context.ipRequestStats.set(ip, stats);
    }
    stats.total++;
    if (ERROR_STATUS_REGEX.test(normalized)) {
      stats.errors++;
    }
    if (lineTs !== null) {
      stats.timestamps.push(lineTs);
    }
    if (stats.sampleLines.length < 3) {
      stats.sampleLines.push(
        raw.length > 200 ? raw.slice(0, 200) + "..." : raw
      );
    }
  }

  // Run all per-line rules
  for (const rule of LINE_RULES) {
    try {
      const findings = rule(normalized, lineNumber, context);
      for (const finding of findings) {
        if (normalized !== raw) {
          finding.lineContent = raw.length > 500 ? raw.slice(0, 500) + "..." : raw;
        }
        // Attach the log event timestamp extracted from this line
        finding.eventTimestamp = lineTs;
      }
      allFindings.push(...findings);
    } catch (error) {
      console.error(
        `Rule engine error on line ${lineNumber}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}
