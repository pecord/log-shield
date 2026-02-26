import type { RawFinding, RuleContext } from "@/analysis/types";
import { computeFingerprint } from "../utils";

/**
 * Thresholds for rate anomaly detection.
 */
const REQUEST_COUNT_THRESHOLD = 100;
const ERROR_RATE_THRESHOLD = 0.8; // 80%

/**
 * HTTP error status code pattern (4xx and 5xx).
 */
export const ERROR_STATUS_REGEX =
  /(?:HTTP\/[\d.]+["']\s+|(?:status[=:\s]+)|(?:returned\s+)|(?:HTTP\s+))([45]\d{2})\b/i;

/**
 * Post-processing rule that analyzes pre-accumulated IP stats from the streaming context.
 * Stats are collected during per-line processing in the rule engine, so this
 * function does NOT re-scan all lines — it just analyzes the already-collected data.
 *
 * It detects:
 *   1. IPs with more than REQUEST_COUNT_THRESHOLD total requests (volume anomaly)
 *   2. IPs with more than ERROR_RATE_THRESHOLD error rate (error-heavy traffic)
 *   3. IPs with burst patterns (many requests in short time windows)
 */
export function checkRateAnomaly(context: RuleContext): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const [ip, stats] of context.ipRequestStats) {
    // Use the earliest observed timestamp for this IP's aggregate findings
    const earliestTs = stats.timestamps.length > 0
      ? Math.min(...stats.timestamps)
      : null;

    // Check 1: High request volume
    if (stats.total >= REQUEST_COUNT_THRESHOLD) {
      const severity =
        stats.total >= REQUEST_COUNT_THRESHOLD * 10
          ? "CRITICAL"
          : stats.total >= REQUEST_COUNT_THRESHOLD * 5
            ? "HIGH"
            : "MEDIUM";

      // Calculate requests per second if timestamps are available
      let rateInfo = "";
      if (stats.timestamps.length >= 2) {
        stats.timestamps.sort((a, b) => a - b);
        const durationSeconds =
          (stats.timestamps[stats.timestamps.length - 1] - stats.timestamps[0]) /
          1000;
        if (durationSeconds > 0) {
          const rps = (stats.total / durationSeconds).toFixed(1);
          rateInfo = ` Average rate: ${rps} requests/second over ${Math.round(durationSeconds)}s.`;
        }
      }

      findings.push({
        severity,
        category: "RATE_ANOMALY",
        title: `High Request Volume: ${stats.total} requests from ${ip}`,
        description: `IP address ${ip} generated ${stats.total} requests across the analyzed log period, significantly exceeding the threshold of ${REQUEST_COUNT_THRESHOLD}.${rateInfo} This may indicate automated scanning, denial-of-service attack, or bot activity.`,
        lineNumber: null,
        lineContent: stats.sampleLines[0] ?? null,
        matchedPattern: `${stats.total} requests from ${ip}`,
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "RATE_ANOMALY",
          null,
          `volume:${ip}:${stats.total}`
        ),
        recommendation:
          "Implement rate limiting per IP address using a reverse proxy or WAF. Consider deploying a CDN with DDoS protection. Use progressive rate limiting that increases restrictions as request volume grows. Set up automated IP blocking for extreme cases. Review if the IP belongs to a legitimate service (search engine crawler, monitoring tool) before blocking.",
        confidence: 0.85,
        mitreTactic: "Impact",
        mitreTechnique: "T1498 - Network Denial of Service",
    eventTimestamp: earliestTs,
      });
    }

    // Check 2: High error rate
    if (
      stats.total >= 10 &&
      stats.errors / stats.total >= ERROR_RATE_THRESHOLD
    ) {
      const errorRate = (
        (stats.errors / stats.total) *
        100
      ).toFixed(1);

      findings.push({
        severity: "HIGH",
        category: "RATE_ANOMALY",
        title: `High Error Rate: ${errorRate}% errors from ${ip}`,
        description: `IP address ${ip} has a ${errorRate}% error response rate (${stats.errors} errors out of ${stats.total} requests). A high error rate typically indicates automated scanning, fuzzing, or brute-force activity where most requests hit invalid endpoints or fail authentication.`,
        lineNumber: null,
        lineContent: stats.sampleLines[0] ?? null,
        matchedPattern: `${errorRate}% error rate from ${ip}`,
        source: "RULE_BASED",
        fingerprint: computeFingerprint(
          "RATE_ANOMALY",
          null,
          `errorrate:${ip}:${errorRate}`
        ),
        recommendation:
          "Investigate the types of errors being generated (authentication failures, 404s, server errors). Consider temporarily blocking the IP. Implement CAPTCHA challenges for IPs with high error rates. Review if this is a misconfigured legitimate client.",
        confidence: 0.8,
        mitreTactic: "Reconnaissance",
        mitreTechnique: "T1595 - Active Scanning",
    eventTimestamp: earliestTs,
      });
    }

    // Check 3: Burst detection (optional, requires timestamps)
    if (stats.timestamps.length >= 20) {
      stats.timestamps.sort((a, b) => a - b);
      // Check for bursts: 20+ requests within a 5-second window
      const burstWindow = 5000; // 5 seconds
      for (let i = 0; i <= stats.timestamps.length - 20; i++) {
        if (stats.timestamps[i + 19] - stats.timestamps[i] <= burstWindow) {
          // Count total requests in this burst window
          let burstCount = 20;
          for (
            let j = i + 20;
            j < stats.timestamps.length &&
            stats.timestamps[j] - stats.timestamps[i] <= burstWindow;
            j++
          ) {
            burstCount++;
          }

          findings.push({
            severity: "HIGH",
            category: "RATE_ANOMALY",
            title: `Request Burst: ${burstCount} requests in 5s from ${ip}`,
            description: `IP address ${ip} sent ${burstCount} requests within a 5-second window, indicating an automated burst of traffic. This pattern is consistent with scripted attacks, brute-force tools, or denial-of-service attempts.`,
            lineNumber: null,
            lineContent: stats.sampleLines[0] ?? null,
            matchedPattern: `${burstCount} requests in 5s burst from ${ip}`,
            source: "RULE_BASED",
            fingerprint: computeFingerprint(
              "RATE_ANOMALY",
              null,
              `burst:${ip}:${burstCount}`
            ),
            recommendation:
              "Deploy rate limiting with short window detection (e.g., max 20 requests per 5 seconds). Use adaptive rate limiting that responds to bursts. Consider implementing request queuing or throttling. Evaluate if a CDN with burst protection would be appropriate.",
            confidence: 0.85,
            mitreTactic: "Impact",
            mitreTechnique: "T1498 - Network Denial of Service",
    eventTimestamp: earliestTs,
          });

          // Only flag one burst per IP
          break;
        }
      }
    }
  }

  return findings;
}
