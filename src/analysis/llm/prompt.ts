import type { RawFinding } from "@/analysis/types";

/**
 * Build the system message content for the agentic analysis session.
 * Appended to the SDK's built-in system prompt (append mode).
 * Contains file metadata and the rule-based findings to validate.
 */
export function buildAgentPrompt(
  totalLines: number,
  logFormat: string,
  ruleFindings: RawFinding[],
): string {
  // Group rule findings by severity for a quick summary
  const severityCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const f of ruleFindings) {
    severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
  }

  const severitySummary = Object.entries(severityCounts)
    .map(([sev, count]) => `${sev}: ${count}`)
    .join(", ");

  const categorySummary = Object.entries(categoryCounts)
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(", ");

  // Detailed list of each rule finding
  let findingsList = "";
  if (ruleFindings.length > 0) {
    const lines = ruleFindings.map((f) => {
      const parts = [
        `  - Line ${f.lineNumber ?? "N/A"}`,
        `${f.category}`,
        `${f.severity}`,
        `"${f.title}"`,
      ];
      if (f.matchedPattern) parts.push(`pattern: ${f.matchedPattern}`);
      return parts.join(" | ");
    });
    findingsList = `\nDETAILED RULE FINDINGS:\n${lines.join("\n")}\n`;
  }

  return `
FILE METADATA:
- Total lines: ${totalLines}
- Detected format: ${logFormat}

RULE-BASED SCAN RESULTS (${ruleFindings.length} findings):
${ruleFindings.length > 0 ? `By severity: ${severitySummary}\nBy category: ${categorySummary}` : "No rule-based findings detected."}
${findingsList}
YOUR TASK:
1. Validate each rule-based finding above by reading the context around the flagged line
2. Mark false positives in your output (false_positive_line_numbers)
3. Search for attack patterns the rules may have missed
4. Correlate events to identify multi-stage attacks
5. When done, call the submit_analysis tool with your findings, summary, and false positive line numbers
`.trim();
}
