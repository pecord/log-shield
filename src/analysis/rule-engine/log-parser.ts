/**
 * Log format detection and normalization.
 *
 * Detects whether a file is JSONL, CSV, or plain text,
 * and normalizes each line into a flat text representation
 * that the rule engine's regex patterns can match against.
 */

type LogFormat = "jsonl" | "csv" | "plain";

interface ParsedLine {
  /** The normalized text representation for regex matching */
  normalized: string;
  /** The original raw line (preserved for line content in findings) */
  raw: string;
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
function flattenJsonLine(line: string): string {
  try {
    const obj = JSON.parse(line);
    if (typeof obj !== "object" || obj === null) return line;

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
    return parts.join(" ");
  } catch {
    return line;
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
 * Parse all lines of a log file into normalized form.
 * Returns an array of ParsedLine objects where .normalized
 * is suitable for regex matching and .raw is the original text.
 */
export function parseLogLines(lines: string[]): ParsedLine[] {
  const format = detectFormat(lines);

  if (format === "plain") {
    return lines.map((line) => ({ normalized: line, raw: line }));
  }

  if (format === "jsonl") {
    return lines.map((line) => ({
      normalized: line.trim().startsWith("{") ? flattenJsonLine(line) : line,
      raw: line,
    }));
  }

  // CSV: first line is header
  if (format === "csv" && lines.length > 0) {
    const headers = parseCsvHeader(lines[0]);
    return lines.map((line, i) => {
      if (i === 0) {
        // Skip the header row (return it as-is, will be skipped as non-match)
        return { normalized: line, raw: line };
      }
      return {
        normalized: line.trim() ? flattenCsvLine(line, headers) : line,
        raw: line,
      };
    });
  }

  return lines.map((line) => ({ normalized: line, raw: line }));
}
