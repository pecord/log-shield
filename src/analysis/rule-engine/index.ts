import { readFileSync } from "fs";
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
import { checkRateAnomaly } from "./rules/rate-anomaly";
import { parseLogLines } from "./log-parser";

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
];

/**
 * Run the rule-based threat detection engine against a log file.
 *
 * Process:
 *   1. Read the file and split into lines.
 *   2. Detect file format (JSONL, CSV, plain) and normalize lines.
 *   3. Initialize a shared RuleContext for stateful rules (brute-force, etc.).
 *   4. For each line, run all per-line rule functions and collect findings.
 *   5. After all lines are processed, run post-processing rules (rate-anomaly).
 *   6. Deduplicate findings by fingerprint.
 *   7. Return findings and metadata.
 *
 * @param filePath - Absolute path to the log file to analyze.
 * @returns Object containing findings array and total lines processed.
 */
export async function runRuleEngine(
  filePath: string
): Promise<{ findings: RawFinding[]; totalLinesProcessed: number }> {
  // Read the file contents
  const content = readFileSync(filePath, "utf-8");
  const rawLines = content.split(/\r?\n/);

  // Parse and normalize lines based on detected format (JSONL, CSV, plain text)
  const parsedLines = parseLogLines(rawLines);

  // Initialize shared context for stateful rules
  const context: RuleContext = {
    ipCounters: new Map<string, number>(),
    ipRequestTimes: new Map<string, number[]>(),
    totalLines: parsedLines.length,
    lineIndex: 0,
  };

  // Reset any module-level state from previous runs
  resetSuspiciousStatusCounters();

  const allFindings: RawFinding[] = [];

  // Process each line through all per-line rules
  for (let i = 0; i < parsedLines.length; i++) {
    const { normalized, raw } = parsedLines[i];

    // Skip empty lines
    if (!normalized || normalized.trim().length === 0) continue;

    // Update context with current line index (0-based internally, 1-based for findings)
    context.lineIndex = i;
    const lineNumber = i + 1; // 1-based line number for human readability

    // Run rules against normalized text, but findings store the raw line content
    for (const rule of LINE_RULES) {
      try {
        const findings = rule(normalized, lineNumber, context);
        // If the line was normalized, update lineContent to show the raw original
        if (normalized !== raw) {
          for (const finding of findings) {
            finding.lineContent = raw.length > 500 ? raw.slice(0, 500) + "..." : raw;
          }
        }
        allFindings.push(...findings);
      } catch (error) {
        // Log but don't halt on individual rule errors
        console.error(
          `Rule engine error on line ${lineNumber}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  // Run post-processing rules that need the full dataset
  // Pass normalized lines for consistent pattern matching
  const normalizedLines = parsedLines.map((p) => p.normalized);
  try {
    const rateFindings = checkRateAnomaly(normalizedLines);
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
    totalLinesProcessed: parsedLines.length,
  };
}
