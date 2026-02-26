import { createHash } from "crypto";
import type { ThreatCategory } from "@/analysis/types";

/**
 * Compute a deterministic fingerprint for a finding.
 * SHA-256 of (category + lineNumber + content), truncated to 16 hex chars.
 */
export function computeFingerprint(
  category: ThreatCategory,
  lineNumber: number | null,
  content: string | null
): string {
  const input = `${category}:${lineNumber ?? ""}:${content ?? ""}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * IPv4 regex: matches dotted-quad addresses like 192.168.1.1
 */
const IPV4_REGEX = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

/**
 * Extract the first IPv4 address found in a log line.
 * Returns null if no IP address is found.
 */
export function extractIp(line: string): string | null {
  const match = line.match(IPV4_REGEX);
  return match ? match[1] : null;
}

/**
 * Extract all IPv4 addresses found in a log line.
 */
export function extractAllIps(line: string): string[] {
  const globalRegex = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
  const ips: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = globalRegex.exec(line)) !== null) {
    ips.push(match[1]);
  }
  return ips;
}

/**
 * Try to extract a timestamp from common log formats.
 * Supports:
 *   - ISO 8601: 2023-10-10T13:55:36Z or 2023-10-10T13:55:36+00:00
 *   - Space-separated datetime: 2017-07-04 13:09:01 or 2017-07-04 13:09:01.050233
 *   - Apache/Nginx combined: [10/Oct/2023:13:55:36 +0000]
 * Returns epoch milliseconds or null if not parseable.
 */
export function extractTimestamp(line: string): number | null {
  // ISO 8601 with T separator
  const isoMatch = line.match(
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/
  );
  if (isoMatch) {
    const ts = Date.parse(isoMatch[1]);
    if (!isNaN(ts)) return ts;
  }

  // Space-separated datetime (common in CSV exports and database logs)
  const spaceMatch = line.match(
    /(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/
  );
  if (spaceMatch) {
    const ts = Date.parse(spaceMatch[1] + "T" + spaceMatch[2] + "Z");
    if (!isNaN(ts)) return ts;
  }

  // Apache/Nginx combined log format: [10/Oct/2023:13:55:36 +0000]
  const apacheMatch = line.match(
    /\[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s[+-]\d{4})\]/
  );
  if (apacheMatch) {
    const cleaned = apacheMatch[1]
      .replace(/(\d{2})\/(\w{3})\/(\d{4}):/, "$2 $1, $3 ");
    const ts = Date.parse(cleaned);
    if (!isNaN(ts)) return ts;
  }

  return null;
}

/**
 * Truncate a line for display in findings, preserving useful context.
 */
export function truncateLine(line: string, maxLength: number = 500): string {
  if (line.length <= maxLength) return line;
  return line.slice(0, maxLength) + "...";
}

/**
 * Extract a username from common log formats.
 *
 * Supports:
 *   - SSH: "Failed password for invalid user admin from ..."
 *   - SSH: "Failed password for root from ..."
 *   - Key-value: "user=admin" or "user: admin"
 *   - Generic: "Login failed for user admin"
 *
 * Returns null if no username can be extracted.
 */
export function extractUsername(line: string): string | null {
  // SSH: "Failed password for (invalid user )? <username> from"
  const sshMatch = line.match(
    /Failed password for (?:invalid user )?(\S+)\s+from/i
  );
  if (sshMatch) return sshMatch[1];

  // "Login failed for user <username>"
  const loginMatch = line.match(/Login failed for (?:user\s+)?(\S+)/i);
  if (loginMatch) return loginMatch[1];

  // Key-value: "user=<value>" or "user: <value>"
  const kvMatch = line.match(/\buser[=:\s]+(\S+)/i);
  if (kvMatch) return kvMatch[1];

  return null;
}
