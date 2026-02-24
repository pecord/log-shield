import { createHash } from "crypto";
import type { RawFinding, Severity, ThreatCategory } from "@/analysis/types";

const VALID_SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const VALID_CATEGORIES: ThreatCategory[] = [
  "SQL_INJECTION", "XSS", "BRUTE_FORCE", "DIRECTORY_TRAVERSAL",
  "COMMAND_INJECTION", "SUSPICIOUS_STATUS_CODE", "MALICIOUS_USER_AGENT",
  "RATE_ANOMALY", "PRIVILEGE_ESCALATION", "DATA_EXFILTRATION",
  "RECONNAISSANCE", "OTHER",
];

interface LLMFindingRaw {
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
  lineNumber?: number | null;
  recommendation?: string;
  confidence?: number;
  mitreTactic?: string | null;
  mitreTechnique?: string | null;
}

function extractJSON(raw: string): string {
  // Try to extract JSON array from response (handle markdown code blocks)
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find array directly
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  return raw.trim();
}

function computeFingerprint(
  category: string,
  lineNumber: number | null,
  content: string | null
): string {
  const normalized = (content || "").trim().substring(0, 200);
  const raw = `${category}:${lineNumber ?? "N/A"}:${normalized}`;
  return createHash("sha256").update(raw).digest("hex").substring(0, 16);
}

export function parseLLMResponse(
  rawResponse: string,
  chunkStartLine: number
): RawFinding[] {
  try {
    const jsonStr = extractJSON(rawResponse);
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: LLMFindingRaw) =>
          item.title && item.description && item.severity && item.category
      )
      .map((item: LLMFindingRaw) => {
        const severity = VALID_SEVERITIES.includes(item.severity as Severity)
          ? (item.severity as Severity)
          : "MEDIUM";

        const category = VALID_CATEGORIES.includes(item.category as ThreatCategory)
          ? (item.category as ThreatCategory)
          : "OTHER";

        const lineNumber = typeof item.lineNumber === "number" ? item.lineNumber : null;
        const confidence =
          typeof item.confidence === "number"
            ? Math.max(0, Math.min(1, item.confidence))
            : 0.7;

        return {
          severity,
          category,
          title: String(item.title).substring(0, 500),
          description: String(item.description).substring(0, 2000),
          lineNumber,
          lineContent: null,
          matchedPattern: null,
          source: "LLM" as const,
          fingerprint: computeFingerprint(category, lineNumber, item.title || ""),
          recommendation: item.recommendation
            ? String(item.recommendation).substring(0, 1000)
            : null,
          confidence,
          mitreTactic: item.mitreTactic ? String(item.mitreTactic) : null,
          mitreTechnique: item.mitreTechnique ? String(item.mitreTechnique) : null,
        } satisfies RawFinding;
      });
  } catch (error) {
    console.error("Failed to parse LLM response:", error);
    return [];
  }
}
