import type { RawFinding } from "./types";

/**
 * Build a correlation key for cross-engine deduplication.
 * Fingerprints differ between engines (rule uses regex match, LLM uses title),
 * so we correlate by category + lineNumber instead.
 * Findings without a lineNumber (e.g., rate-anomaly summaries) are not
 * correlated — they can only dedup via fingerprint within the same engine.
 */
function correlationKey(f: RawFinding): string | null {
  if (f.lineNumber === null) return null;
  return `${f.category}:${f.lineNumber}`;
}

/**
 * Merges and deduplicates findings from rule-based and LLM sources.
 *
 * Deduplication strategy:
 *   1. Within each engine: fingerprint-based (already done before merge).
 *   2. Cross-engine: category + lineNumber correlation.
 *      When both engines flag the same category on the same line, the LLM
 *      finding wins (richer description) but inherits the best fields from
 *      the rule finding (lineContent, matchedPattern, higher confidence).
 */
export function mergeFindings(
  ruleFindings: RawFinding[],
  llmFindings: RawFinding[]
): RawFinding[] {
  // Build a correlation map from rule findings keyed by category:lineNumber
  const correlationMap = new Map<string, RawFinding>();
  // Also track all unique findings by fingerprint (handles null-lineNumber findings)
  const resultMap = new Map<string, RawFinding>();

  for (const finding of ruleFindings) {
    resultMap.set(finding.fingerprint, finding);
    const key = correlationKey(finding);
    if (key) {
      correlationMap.set(key, finding);
    }
  }

  for (const finding of llmFindings) {
    const key = correlationKey(finding);
    const correlatedRule = key ? correlationMap.get(key) : null;

    if (correlatedRule) {
      // Cross-engine match: LLM finding wins, but inherit best fields
      finding.confidence = Math.max(
        finding.confidence ?? 0.7,
        correlatedRule.confidence ?? 0.8
      );
      if (!finding.lineContent && correlatedRule.lineContent) {
        finding.lineContent = correlatedRule.lineContent;
      }
      if (!finding.matchedPattern && correlatedRule.matchedPattern) {
        finding.matchedPattern = correlatedRule.matchedPattern;
      }
      // Remove the rule finding, replace with enriched LLM finding
      resultMap.delete(correlatedRule.fingerprint);
      resultMap.set(finding.fingerprint, finding);
    } else {
      // No cross-engine match — check fingerprint dedup (unlikely but safe)
      const existing = resultMap.get(finding.fingerprint);
      if (existing) {
        finding.confidence = Math.max(
          finding.confidence ?? 0.7,
          existing.confidence ?? 0.8
        );
        if (!finding.lineContent && existing.lineContent) {
          finding.lineContent = existing.lineContent;
        }
        if (!finding.matchedPattern && existing.matchedPattern) {
          finding.matchedPattern = existing.matchedPattern;
        }
      }
      resultMap.set(finding.fingerprint, finding);
    }
  }

  // Sort by severity order, then by line number
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const merged = Array.from(resultMap.values());

  merged.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (a.lineNumber ?? Infinity) - (b.lineNumber ?? Infinity);
  });

  return merged;
}

/**
 * Progressive merge for two-phase persistence.
 *
 * Unlike `mergeFindings()` (which produces one flat list), this function is
 * designed for a pipeline that already persisted rule findings to the DB.
 * It returns:
 *   - `llmFindings`: the LLM findings to INSERT (enriched with rule data
 *     where they overlap).
 *   - `supersededRuleFingerprints`: rule finding fingerprints to DELETE
 *     because the LLM produced a richer finding for the same event.
 */
export function mergeFindingsProgressive(
  ruleFindings: RawFinding[],
  llmFindings: RawFinding[],
): {
  llmFindings: RawFinding[];
  supersededRuleFingerprints: string[];
} {
  // Build correlation map from rule findings keyed by category:lineNumber
  const correlationMap = new Map<string, RawFinding>();
  const ruleByFingerprint = new Map<string, RawFinding>();

  for (const finding of ruleFindings) {
    ruleByFingerprint.set(finding.fingerprint, finding);
    const key = correlationKey(finding);
    if (key) {
      correlationMap.set(key, finding);
    }
  }

  const supersededFingerprints: string[] = [];
  const enrichedLlm: RawFinding[] = [];

  for (const finding of llmFindings) {
    const key = correlationKey(finding);
    const correlatedRule = key ? correlationMap.get(key) : null;

    if (correlatedRule) {
      // Cross-engine match: enrich LLM finding with best fields from rule
      finding.confidence = Math.max(
        finding.confidence ?? 0.7,
        correlatedRule.confidence ?? 0.8,
      );
      if (!finding.lineContent && correlatedRule.lineContent) {
        finding.lineContent = correlatedRule.lineContent;
      }
      if (!finding.matchedPattern && correlatedRule.matchedPattern) {
        finding.matchedPattern = correlatedRule.matchedPattern;
      }
      // Mark the rule finding as superseded
      supersededFingerprints.push(correlatedRule.fingerprint);
      enrichedLlm.push(finding);
    } else {
      // Check for same-fingerprint overlap (unlikely but safe)
      const existing = ruleByFingerprint.get(finding.fingerprint);
      if (existing) {
        finding.confidence = Math.max(
          finding.confidence ?? 0.7,
          existing.confidence ?? 0.8,
        );
        if (!finding.lineContent && existing.lineContent) {
          finding.lineContent = existing.lineContent;
        }
        if (!finding.matchedPattern && existing.matchedPattern) {
          finding.matchedPattern = existing.matchedPattern;
        }
        supersededFingerprints.push(existing.fingerprint);
      }
      enrichedLlm.push(finding);
    }
  }

  return {
    llmFindings: enrichedLlm,
    supersededRuleFingerprints: supersededFingerprints,
  };
}
