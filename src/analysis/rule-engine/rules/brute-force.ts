import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint, extractIp, truncateLine } from "../utils";

/**
 * Threshold: number of failed auth attempts from a single IP before flagging.
 */
const BRUTE_FORCE_THRESHOLD = 10;

/**
 * Patterns that indicate failed authentication attempts.
 */
const FAILED_AUTH_PATTERNS: RegExp[] = [
  /Failed password/i,
  /authentication fail(ed|ure)/i,
  /invalid credentials/i,
  /Login failed/i,
  /Access denied/i,
  /unauthorized/i,
  /bad password/i,
  /invalid password/i,
  /failed login/i,
  /auth.*fail/i,
  /incorrect password/i,
  /account locked/i,
  /too many authentication failures/i,
  /password mismatch/i,
  /FAILED LOGIN/i,
  /\b401\b.*\b(POST|PUT)\b.*\/(login|auth|signin|session)/i,
];

export function checkBruteForce(
  line: string,
  lineNumber: number,
  context: RuleContext
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lineContent = truncateLine(line);

  // Check if the line matches any failed auth pattern
  let matchedPattern: string | null = null;
  for (const pattern of FAILED_AUTH_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      matchedPattern = match[0];
      break;
    }
  }

  if (!matchedPattern) return findings;

  // Extract IP address from the line
  const ip = extractIp(line);
  if (!ip) return findings;

  // Increment the counter for this IP
  const currentCount = (context.ipCounters.get(ip) ?? 0) + 1;
  context.ipCounters.set(ip, currentCount);

  // Track the request time
  const times = context.ipRequestTimes.get(ip) ?? [];
  times.push(Date.now());
  context.ipRequestTimes.set(ip, times);

  // Flag when threshold is reached (only flag once at the exact threshold,
  // then again at each multiple of the threshold to reduce noise)
  if (
    currentCount === BRUTE_FORCE_THRESHOLD ||
    (currentCount > BRUTE_FORCE_THRESHOLD && currentCount % BRUTE_FORCE_THRESHOLD === 0)
  ) {
    const severity = currentCount >= BRUTE_FORCE_THRESHOLD * 5 ? "CRITICAL" : "HIGH";

    findings.push({
      severity,
      category: "BRUTE_FORCE",
      title: `Brute Force Attack: ${currentCount} failed auth attempts from ${ip}`,
      description: `IP address ${ip} has generated ${currentCount} failed authentication attempts. This pattern is consistent with a brute force or credential stuffing attack targeting user accounts.`,
      lineNumber,
      lineContent,
      matchedPattern,
      source: "RULE_BASED",
      fingerprint: computeFingerprint(
        "BRUTE_FORCE",
        lineNumber,
        `${ip}:${currentCount}`
      ),
      recommendation:
        "Implement account lockout policies after repeated failed attempts. Deploy rate limiting on authentication endpoints. Use CAPTCHA challenges after a few failures. Consider IP-based blocking or temporary bans. Enable multi-factor authentication (MFA) for all accounts. Monitor for credential stuffing using leaked password databases.",
      confidence: 0.9,
      mitreTactic: "Credential Access",
      mitreTechnique: "T1110 - Brute Force",
    });
  }

  return findings;
}
