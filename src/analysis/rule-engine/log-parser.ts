/**
 * Log format detection and normalization.
 *
 * Detects whether a file is JSONL, CSV, or plain text,
 * and normalizes each line into a flat text representation
 * that the rule engine's regex patterns can match against.
 */

export type LogFormat = "jsonl" | "csv" | "plain";

interface ParsedLine {
  /** The normalized text representation for regex matching */
  normalized: string;
  /** The original raw line (preserved for line content in findings) */
  raw: string;
}

export interface ParseResult {
  lines: ParsedLine[];
  format: LogFormat;
  parseErrors: number;
}

/**
 * Detect the log file format by inspecting the first non-empty line.
 */
export function detectFormat(lines: string[]): LogFormat {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // JSONL: line starts with {
    if (trimmed.startsWith("{")) {
      try {
        JSON.parse(trimmed);
        return "jsonl";
      } catch {
        // not valid JSON, fall through
      }
    }

    // CSV: check if first line looks like a CSV header
    // (contains commas and common log field names)
    if (
      trimmed.includes(",") &&
      /^(timestamp|ts|date|time|src_ip|event|host|method|url|status|user)/i.test(trimmed)
    ) {
      return "csv";
    }

    break;
  }

  return "plain";
}

/**
 * Flatten a JSON object's values into a readable text line.
 * Produces output like: key=value key2=value2 ...
 * This format is easy for regex patterns to match against.
 */
function flattenJsonLine(line: string): { text: string; error: boolean } {
  try {
    const obj = JSON.parse(line);
    if (typeof obj !== "object" || obj === null) return { text: line, error: false };

    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      if (typeof value === "object") {
        // Flatten nested objects (e.g., anomaly: { type, reason })
        for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
          if (subVal !== null && subVal !== undefined) {
            parts.push(`${key}_${subKey}=${String(subVal)}`);
          }
        }
      } else {
        parts.push(`${key}=${String(value)}`);
      }
    }
    return { text: parts.join(" "), error: false };
  } catch {
    return { text: line, error: true };
  }
}

/**
 * Parse a CSV header line and return column names.
 */
function parseCsvHeader(headerLine: string): string[] {
  return headerLine.split(",").map((col) => col.trim().replace(/^"|"$/g, ""));
}

/**
 * Parse a CSV data line using a simple split (handles basic CSV).
 * For quoted fields containing commas, this does a proper parse.
 */
function parseCsvValues(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

/**
 * Convert a CSV row into key=value format using the header columns.
 */
function flattenCsvLine(line: string, headers: string[]): string {
  const values = parseCsvValues(line);
  const parts: string[] = [];
  for (let i = 0; i < headers.length && i < values.length; i++) {
    const val = values[i].trim();
    if (val) {
      parts.push(`${headers[i]}=${val}`);
    }
  }
  return parts.join(" ");
}

/**
 * Detect format from a small sample of lines (for streaming use).
 */
export function detectFormatFromSample(sampleLines: string[]): LogFormat {
  return detectFormat(sampleLines);
}

/**
 * Normalize a single line based on previously detected format.
 * For CSV, pass the parsed header columns.
 */
export function normalizeLine(
  line: string,
  format: LogFormat,
  csvHeaders?: string[]
): { normalized: string; error: boolean } {
  if (format === "plain") {
    return { normalized: line, error: false };
  }

  if (format === "jsonl") {
    if (line.trim().startsWith("{")) {
      const result = flattenJsonLine(line);
      return { normalized: result.text, error: result.error };
    }
    return { normalized: line, error: false };
  }

  if (format === "csv" && csvHeaders) {
    if (line.trim()) {
      return { normalized: flattenCsvLine(line, csvHeaders), error: false };
    }
    return { normalized: line, error: false };
  }

  return { normalized: line, error: false };
}

/**
 * Parse a CSV header line (exposed for streaming use).
 */
export function parseCsvHeaderLine(headerLine: string): string[] {
  return parseCsvHeader(headerLine);
}

/**
 * Parse all lines of a log file into normalized form.
 * Returns parsed lines, detected format, and count of parse errors.
 */
export function parseLogLines(lines: string[]): ParseResult {
  const format = detectFormat(lines);
  let parseErrors = 0;

  if (format === "plain") {
    return {
      lines: lines.map((line) => ({ normalized: line, raw: line })),
      format,
      parseErrors: 0,
    };
  }

  if (format === "jsonl") {
    const parsed = lines.map((line) => {
      if (line.trim().startsWith("{")) {
        const result = flattenJsonLine(line);
        if (result.error) parseErrors++;
        return { normalized: result.text, raw: line };
      }
      return { normalized: line, raw: line };
    });
    return { lines: parsed, format, parseErrors };
  }

  // CSV: first line is header
  if (format === "csv" && lines.length > 0) {
    const headers = parseCsvHeader(lines[0]);
    const parsed = lines.map((line, i) => {
      if (i === 0) {
        // Skip the header row (return it as-is, will be skipped as non-match)
        return { normalized: line, raw: line };
      }
      return {
        normalized: line.trim() ? flattenCsvLine(line, headers) : line,
        raw: line,
      };
    });
    return { lines: parsed, format, parseErrors: 0 };
  }

  return {
    lines: lines.map((line) => ({ normalized: line, raw: line })),
    format,
    parseErrors: 0,
  };
}
