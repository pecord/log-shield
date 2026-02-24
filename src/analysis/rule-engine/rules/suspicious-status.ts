import type { RawFinding, RuleContext, Severity } from "@/analysis/types";
import { computeFingerprint, extractIp, truncateLine } from "../utils";

/**
 * Map of HTTP status codes to their significance in threat detection.
 */
interface StatusInfo {
  code: string;
  severity: Severity;
  label: string;
  description: string;
  mitreTactic: string;
  mitreTechnique: string;
}

const STATUS_MAP: StatusInfo[] = [
  {
    code: "400",
    severity: "LOW",
    label: "400 Bad Request",
    description: "Bad request response may indicate malformed attack payloads or fuzzing activity",
    mitreTactic: "Reconnaissance",
    mitreTechnique: "T1595 - Active Scanning",
  },
  {
    code: "401",
    severity: "LOW",
    label: "401 Unauthorized",
    description: "Unauthorized response indicating failed authentication attempt",
    mitreTactic: "Credential Access",
    mitreTechnique: "T1110 - Brute Force",
  },
  {
    code: "403",
    severity: "LOW",
    label: "403 Forbidden",
    description: "Forbidden response may indicate access control bypass attempt or directory enumeration",
    mitreTactic: "Reconnaissance",
    mitreTechnique: "T1595 - Active Scanning",
  },
  {
    code: "404",
    severity: "LOW",
    label: "404 Not Found",
    description: "Not found response may indicate directory enumeration or resource discovery scanning",
    mitreTactic: "Reconnaissance",
    mitreTechnique: "T1595 - Active Scanning",
  },
  {
    code: "405",
    severity: "LOW",
    label: "405 Method Not Allowed",
    description: "Method not allowed response may indicate HTTP verb tampering attempts",
    mitreTactic: "Reconnaissance",
    mitreTechnique: "T1595 - Active Scanning",
  },
  {
    code: "500",
    severity: "MEDIUM",
    label: "500 Internal Server Error",
    description: "Internal server error that may be triggered by malicious input causing application exceptions",
    mitreTactic: "Impact",
    mitreTechnique: "T1499 - Endpoint Denial of Service",
  },
  {
    code: "502",
    severity: "MEDIUM",
    label: "502 Bad Gateway",
    description: "Bad gateway error that may indicate backend service disruption or SSRF exploitation",
    mitreTactic: "Impact",
    mitreTechnique: "T1499 - Endpoint Denial of Service",
  },
  {
    code: "503",
    severity: "MEDIUM",
    label: "503 Service Unavailable",
    description: "Service unavailable response that may indicate denial of service impact or resource exhaustion",
    mitreTactic: "Impact",
    mitreTechnique: "T1499 - Endpoint Denial of Service",
  },
];

/**
 * Regex to match HTTP status codes in common log formats.
 * Matches patterns like:
 *   - HTTP/1.1" 404
 *   - status=500
 *   - returned 403
 *   - [status: 502]
 *   - HTTP 503
 */
const STATUS_CODE_REGEX =
  /(?:HTTP\/[\d.]+["']\s+|(?:status[=:\s]+)|(?:returned\s+)|(?:HTTP\s+))(\d{3})\b/i;

/**
 * Map to track 404 counts per IP for directory enumeration detection.
 * This is separate from the RuleContext ipCounters which tracks auth failures.
 */
const notFoundCounters = new Map<string, number>();

/**
 * Threshold for flagging directory enumeration via 404s.
 */
const DIR_ENUM_404_THRESHOLD = 20;

export function checkSuspiciousStatus(
  line: string,
  lineNumber: number,
  _context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  const statusMatch = line.match(STATUS_CODE_REGEX);
  if (!statusMatch) return findings;

  const statusCode = statusMatch[1];
  const statusInfo = STATUS_MAP.find((s) => s.code === statusCode);

  if (!statusInfo) return findings;

  // Track 404s per IP for directory enumeration detection
  if (statusCode === "404") {
    const ip = extractIp(line);
    if (ip) {
      const count = (notFoundCounters.get(ip) ?? 0) + 1;
      notFoundCounters.set(ip, count);

      if (
        count === DIR_ENUM_404_THRESHOLD ||
        (count > DIR_ENUM_404_THRESHOLD && count % DIR_ENUM_404_THRESHOLD === 0)
      ) {
        findings.push({
          severity: "HIGH",
          category: "RECONNAISSANCE",
          title: `Directory Enumeration: ${count} 404 responses for IP ${ip}`,
          description: `IP address ${ip} has triggered ${count} 404 Not Found responses, which is a strong indicator of directory and file enumeration using automated tools.`,
          lineNumber,
          lineContent,
          matchedPattern: `404 x${count} from ${ip}`,
          source: "RULE_BASED",
          fingerprint: computeFingerprint(
            "RECONNAISSANCE",
            lineNumber,
            `404-enum:${ip}:${count}`
          ),
          recommendation:
            "Implement rate limiting per IP address. Deploy a WAF with bot detection capabilities. Use honeypot URLs to detect scanners. Consider blocking IPs that generate excessive 404 errors. Review web server configuration to minimize information leakage in error responses.",
          confidence: 0.85,
          mitreTactic: "Reconnaissance",
          mitreTechnique: "T1595.003 - Active Scanning: Wordlist Scanning",
        });
      }
    }
  }

  // Always emit the single status finding
  findings.push({
    severity: statusInfo.severity,
    category: "SUSPICIOUS_STATUS_CODE",
    title: `Suspicious Status Code: ${statusInfo.label}`,
    description: statusInfo.description,
    lineNumber,
    lineContent,
    matchedPattern: statusMatch[0],
    source: "RULE_BASED",
    fingerprint: computeFingerprint(
      "SUSPICIOUS_STATUS_CODE",
      lineNumber,
      statusMatch[0]
    ),
    recommendation:
      "Investigate the source IP and requested resource. Review application logs for the root cause of error responses. Ensure error pages do not leak sensitive information such as stack traces, internal paths, or version numbers.",
    confidence: 0.6,
    mitreTactic: statusInfo.mitreTactic,
    mitreTechnique: statusInfo.mitreTechnique,
  });

  return findings;
}

/**
 * Reset internal counters (useful for testing or between file analyses).
 */
export function resetSuspiciousStatusCounters(): void {
  notFoundCounters.clear();
}
