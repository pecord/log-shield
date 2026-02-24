import type { RawFinding } from "./types";

/**
 * Merges and deduplicates findings from rule-based and LLM sources.
 * When both sources find the same issue (matching fingerprint):
 * - Keep the LLM finding (richer description + recommendations)
 * - Use the higher confidence score
 */
export function mergeFindings(
  ruleFindings: RawFinding[],
  llmFindings: RawFinding[]
): RawFinding[] {
  const fingerprintMap = new Map<string, RawFinding>();

  // Add rule-based findings first
  for (const finding of ruleFindings) {
    fingerprintMap.set(finding.fingerprint, finding);
  }

  // LLM findings override rule-based (richer descriptions)
  for (const finding of llmFindings) {
    const existing = fingerprintMap.get(finding.fingerprint);
    if (existing) {
      // Keep LLM finding but boost confidence
      finding.confidence = Math.max(
        finding.confidence ?? 0.7,
        existing.confidence ?? 0.8
      );
      // Preserve lineContent from rule finding if LLM doesn't have it
      if (!finding.lineContent && existing.lineContent) {
        finding.lineContent = existing.lineContent;
      }
      if (!finding.matchedPattern && existing.matchedPattern) {
        finding.matchedPattern = existing.matchedPattern;
      }
    }
    fingerprintMap.set(finding.fingerprint, finding);
  }

  // Sort by severity order, then by line number
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const merged = Array.from(fingerprintMap.values());

  merged.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (a.lineNumber ?? Infinity) - (b.lineNumber ?? Infinity);
  });

  return merged;
}
