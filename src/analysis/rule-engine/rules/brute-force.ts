import type { RawFinding, RuleContext } from "@/analysis/types";
import {
  computeFingerprint,
  extractIp,
  extractUsername,
  truncateLine,
} from "../utils";

/**
 * Threshold: number of failed auth attempts from a single IP before flagging.
 */
const BRUTE_FORCE_THRESHOLD = 10;

/**
 * Threshold: number of distinct usernames targeted from a single IP
 * before flagging as a password spray attack.
 */
const PASSWORD_SPRAY_THRESHOLD = 5;

/**
 * Patterns that indicate failed authentication attempts.
 */
export const FAILED_AUTH_PATTERNS: RegExp[] = [
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

  // --- Password Spray Detection ---
  // Track distinct usernames per IP to detect spray attacks
  const username = extractUsername(line);
  if (username) {
    if (!context.ipDistinctUsers.has(ip)) {
      context.ipDistinctUsers.set(ip, new Set());
    }
    const users = context.ipDistinctUsers.get(ip)!;
    users.add(username.toLowerCase());

    // Flag when distinct user count reaches the spray threshold
    // Only flag once at the exact threshold to avoid noise
    if (users.size === PASSWORD_SPRAY_THRESHOLD) {
      findings.push({
        severity: "CRITICAL",
        category: "BRUTE_FORCE",
        title: `Password Spray Attack: ${users.size} distinct users targeted from ${ip}`,
        description: `IP address ${ip} has attempted authentication against ${users.size} distinct user accounts (${[...users].join(", ")}). This pattern is consistent with a password spray attack, where an attacker tries a small number of common passwords against many accounts to avoid lockout detection.`,
        lineNumber,
        lineContent,
        matchedPattern,
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "BRUTE_FORCE",
          lineNumber,
          `spray:${ip}:${users.size}`
        ),
        recommendation:
          "Implement login rate limiting across all accounts, not just per-account. Deploy anomaly detection that correlates failed logins across users from the same source IP. Use smart lockout that considers IP reputation. Enforce strong password policies and MFA to reduce spray effectiveness. Monitor for leaked credential databases.",
        confidence: 0.95,
        mitreTactic: "Credential Access",
        mitreTechnique: "T1110.003 - Password Spraying",
      });
    }
  }

  // --- Standard Brute Force Detection ---
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
