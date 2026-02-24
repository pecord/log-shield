import type { RawFinding } from "@/analysis/types";

export const SYSTEM_PROMPT = `You are a cybersecurity log analyst expert. You analyze server and application log entries to detect security threats, anomalies, and suspicious activities.

You must respond with a JSON array of findings. Each finding must have these fields:
- title: string (concise description of the threat)
- description: string (detailed explanation of what you found and why it's suspicious)
- severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
- category: one of "SQL_INJECTION" | "XSS" | "BRUTE_FORCE" | "DIRECTORY_TRAVERSAL" | "COMMAND_INJECTION" | "SUSPICIOUS_STATUS_CODE" | "MALICIOUS_USER_AGENT" | "RATE_ANOMALY" | "PRIVILEGE_ESCALATION" | "DATA_EXFILTRATION" | "RECONNAISSANCE" | "OTHER"
- lineNumber: number (the line number as shown in the log, or null if spanning multiple lines)
- recommendation: string (specific remediation advice)
- confidence: number (0.0 to 1.0)
- mitreTactic: string | null (MITRE ATT&CK tactic if applicable)
- mitreTechnique: string | null (MITRE ATT&CK technique ID if applicable)

If no threats are found, return an empty array: []
Only respond with valid JSON. Do not include any other text or markdown formatting.`;

export function buildChunkPrompt(
  chunkContent: string,
  startLine: number,
  endLine: number,
  ruleFindings?: RawFinding[]
): string {
  let ruleContext = "";
  if (ruleFindings && ruleFindings.length > 0) {
    const ruleList = ruleFindings
      .map(
        (f) =>
          `- Line ${f.lineNumber ?? "?"}: ${f.category} - ${f.title} (${f.severity})`
      )
      .join("\n");
    ruleContext = `\nThe rule-based scanner has already identified these potential threats in this section. Please validate, provide additional context, or identify threats the rules may have missed:\n${ruleList}\n`;
  }

  return `Analyze the following log entries (lines ${startLine}-${endLine}) for security threats, anomalies, and suspicious patterns. Consider the context of each entry and look for patterns that might indicate coordinated attacks.
${ruleContext}
Log entries:
---
${chunkContent}
---

Respond with a JSON array of findings.`;
}

export function buildSummaryPrompt(
  totalLines: number,
  findingsCount: number,
  severityCounts: Record<string, number>,
  categoryCounts: Record<string, number>
): string {
  const severityList = Object.entries(severityCounts)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${severity}: ${count}`)
    .join(", ");

  const categoryList = Object.entries(categoryCounts)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${category}: ${count}`)
    .join(", ");

  return `Provide a concise executive summary (2-3 paragraphs) of the security analysis results for a log file with ${totalLines} lines.

Total findings: ${findingsCount}
By severity: ${severityList}
By category: ${categoryList}

Summarize the overall security posture, highlight the most critical threats, and provide high-level recommendations. Write in a professional security analyst tone. Do not use JSON format - write plain text.`;
}
