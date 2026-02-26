/**
 * Agentic LLM analysis using the GitHub Copilot SDK.
 *
 * Instead of dumb-chunking the log file, this creates an intelligent agent
 * that receives rule-based findings, then uses the SDK's built-in tools
 * (file reading, grep, etc.) to explore the log file — validating flagged
 * lines, examining context, and searching for patterns the rules missed.
 *
 * Key features:
 *   - BYOK: Per-user API keys via provider config (Anthropic or OpenAI)
 *   - Skills: Domain-specific instructions loaded from skills/ directory
 *   - Session persistence: Deterministic sessionId for crash recovery
 *   - File attachment: The log file is attached so the agent can read it
 *     with its built-in tools (no custom MCP tools needed)
 *   - submit_analysis tool: Forces structured JSON output via tool call
 *     instead of parsing free-text responses
 */
import { join } from "path";
import { createHash } from "crypto";
import { CopilotClient, defineTool, approveAll } from "@github/copilot-sdk";
import type { SessionConfig } from "@github/copilot-sdk";
import type { RawFinding, Severity, ThreatCategory } from "@/analysis/types";
import { buildAgentPrompt } from "./prompt";

// ── Constants ──────────────────────────────────────────────────

const VALID_SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const VALID_CATEGORIES: ThreatCategory[] = [
  "SQL_INJECTION", "XSS", "BRUTE_FORCE", "DIRECTORY_TRAVERSAL",
  "COMMAND_INJECTION", "SUSPICIOUS_STATUS_CODE", "MALICIOUS_USER_AGENT",
  "RATE_ANOMALY", "PRIVILEGE_ESCALATION", "DATA_EXFILTRATION",
  "RECONNAISSANCE", "OTHER",
];

/** Agent timeout: 5 minutes for thorough analysis */
const AGENT_TIMEOUT_MS = 300_000;

// ── Types ──────────────────────────────────────────────────────

export interface AgenticAnalysisOptions {
  filePath: string;
  totalLines: number;
  logFormat: string;
  ruleFindings: RawFinding[];
  provider: "anthropic" | "openai";
  apiKey: string;
  analysisResultId: string;
  onTurnComplete?: (turn: number) => void;
}

export interface AgenticAnalysisResult {
  findings: RawFinding[];
  summary: string;
  falsePositiveLineNumbers: number[];
}

// ── Provider config helpers ────────────────────────────────────

function getProviderConfig(provider: "anthropic" | "openai", apiKey: string): NonNullable<SessionConfig["provider"]> {
  if (provider === "anthropic") {
    return { type: "anthropic", baseUrl: "https://api.anthropic.com", apiKey };
  }
  return { type: "openai", baseUrl: "https://api.openai.com/v1", apiKey };
}

function getModel(provider: "anthropic" | "openai"): string {
  return provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o-mini";
}

// ── Finding normalization ─────────────────────────────────────

interface AgentFindingRaw {
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

function computeFingerprint(category: string, lineNumber: number | null, title: string): string {
  const normalized = (title || "").trim().substring(0, 200);
  const raw = `${category}:${lineNumber ?? "N/A"}:${normalized}`;
  return createHash("sha256").update(raw).digest("hex").substring(0, 16);
}

function normalizeFindings(rawFindings: AgentFindingRaw[]): RawFinding[] {
  return rawFindings
    .filter((f) => f.title && f.description && f.severity && f.category)
    .map((f) => {
      const severity = VALID_SEVERITIES.includes(f.severity as Severity)
        ? (f.severity as Severity)
        : "MEDIUM";
      const category = VALID_CATEGORIES.includes(f.category as ThreatCategory)
        ? (f.category as ThreatCategory)
        : "OTHER";
      const lineNumber = typeof f.lineNumber === "number" ? f.lineNumber : null;
      const confidence = typeof f.confidence === "number"
        ? Math.max(0, Math.min(1, f.confidence))
        : 0.7;

      return {
        severity,
        category,
        title: String(f.title).substring(0, 500),
        description: String(f.description).substring(0, 2000),
        lineNumber,
        lineContent: null, // Populated by caller from file content
        matchedPattern: null,
        source: "LLM" as const,
        fingerprint: computeFingerprint(category, lineNumber, f.title || ""),
        recommendation: f.recommendation ? String(f.recommendation).substring(0, 1000) : null,
        confidence,
        mitreTactic: f.mitreTactic ? String(f.mitreTactic) : null,
        mitreTechnique: f.mitreTechnique ? String(f.mitreTechnique) : null,
      };
    });
}

// ── Response parsing (fallback for text responses) ────────────

/**
 * Extract and parse the JSON analysis from the agent's final message.
 * Handles JSON in markdown code blocks or as raw JSON in the response.
 * Used as a fallback when the agent doesn't call submit_analysis.
 * Handles multiple naming conventions the agent may use.
 */
export function parseAgentResponse(content: string): AgenticAnalysisResult {
  let jsonStr = content;

  // Try markdown code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // Try to find a JSON object directly
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  const parsed: Record<string, unknown> = JSON.parse(jsonStr);

  // Handle multiple naming conventions the agent may use
  const rawFindings: AgentFindingRaw[] = (
    parsed.findings ||
    parsed.additional_threats_discovered ||
    parsed.threats ||
    []
  ) as AgentFindingRaw[];

  const summary: string = (
    parsed.summary ||
    parsed.analysis_summary ||
    parsed.executive_summary ||
    ""
  ) as string;

  const falsePositives: number[] = (
    parsed.false_positive_line_numbers ||
    parsed.false_positives ||
    []
  ) as number[];

  return {
    findings: normalizeFindings(rawFindings),
    summary: typeof summary === "string" ? summary : "",
    falsePositiveLineNumbers: Array.isArray(falsePositives)
      ? falsePositives.filter((n) => typeof n === "number")
      : [],
  };
}

// ── submit_analysis tool ──────────────────────────────────────

/**
 * Create the submit_analysis tool that captures structured output.
 * The agent calls this tool to submit its analysis results, which
 * guarantees the output matches our expected schema.
 */
function createSubmitAnalysisTool(capturedResult: { value: AgenticAnalysisResult | null }) {
  return defineTool("submit_analysis", {
    description: "Submit your completed security analysis. You MUST call this tool when your analysis is complete. Pass all findings, a summary, and any false positive line numbers.",
    parameters: {
      type: "object",
      properties: {
        findings: {
          type: "array",
          description: "Array of security findings discovered during analysis",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Concise threat description" },
              description: { type: "string", description: "Detailed explanation with evidence from log lines" },
              severity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] },
              category: {
                type: "string",
                enum: [
                  "SQL_INJECTION", "XSS", "BRUTE_FORCE", "DIRECTORY_TRAVERSAL",
                  "COMMAND_INJECTION", "SUSPICIOUS_STATUS_CODE", "MALICIOUS_USER_AGENT",
                  "RATE_ANOMALY", "PRIVILEGE_ESCALATION", "DATA_EXFILTRATION",
                  "RECONNAISSANCE", "OTHER",
                ],
              },
              lineNumber: { type: ["number", "null"], description: "Line number in the log file, or null if spanning multiple lines" },
              recommendation: { type: "string", description: "Specific remediation advice" },
              confidence: { type: "number", description: "Confidence score from 0.0 to 1.0" },
              mitreTactic: { type: ["string", "null"], description: "MITRE ATT&CK tactic if applicable" },
              mitreTechnique: { type: ["string", "null"], description: "MITRE ATT&CK technique ID if applicable" },
            },
            required: ["title", "description", "severity", "category"],
          },
        },
        summary: {
          type: "string",
          description: "2-3 paragraph executive summary of the security analysis, referencing specific lines and patterns investigated",
        },
        false_positive_line_numbers: {
          type: "array",
          description: "Line numbers of rule-based findings you determined to be false positives",
          items: { type: "number" },
        },
      },
      required: ["findings", "summary", "false_positive_line_numbers"],
    } as Record<string, unknown>,
    handler: async (args: any) => {
      const rawFindings = Array.isArray(args.findings) ? args.findings : [];
      capturedResult.value = {
        findings: normalizeFindings(rawFindings),
        summary: typeof args.summary === "string" ? args.summary : "",
        falsePositiveLineNumbers: Array.isArray(args.false_positive_line_numbers)
          ? args.false_positive_line_numbers.filter((n: unknown) => typeof n === "number")
          : [],
      };

      console.log(`[Agent] submit_analysis called: ${capturedResult.value.findings.length} findings, ${capturedResult.value.falsePositiveLineNumbers.length} false positives`);

      return `Analysis submitted successfully: ${capturedResult.value.findings.length} findings recorded.`;
    },
  });
}

// ── Main agent runner ──────────────────────────────────────────

export async function runAgenticAnalysis(
  options: AgenticAnalysisOptions,
): Promise<AgenticAnalysisResult> {
  const client = new CopilotClient({ logLevel: "warning" });

  // Mutable ref to capture the tool call result
  const capturedResult: { value: AgenticAnalysisResult | null } = { value: null };
  const submitTool = createSubmitAnalysisTool(capturedResult);

  try {
    await client.start();

    const sessionId = `analysis-${options.analysisResultId}`;
    const providerConfig = getProviderConfig(options.provider, options.apiKey);
    const model = getModel(options.provider);

    console.log(`[Agent] Creating session ${sessionId} with ${options.provider} (${model})`);

    let turnCount = 0;
    const abortController = new AbortController();

    const session = await client.createSession({
      sessionId,
      model,
      provider: providerConfig,
      systemMessage: { content: buildAgentPrompt(options.totalLines, options.logFormat, options.ruleFindings) },
      onPermissionRequest: approveAll,
      tools: [submitTool],
      skillDirectories: [join(process.cwd(), "skills")],
      infiniteSessions: { enabled: false },
      hooks: {
        onPostToolUse: async (input: any) => {
          turnCount++;
          options.onTurnComplete?.(turnCount);

          const argsPreview = JSON.stringify(input.toolArgs || {}).substring(0, 200);
          const resultPreview = JSON.stringify(input.toolResult || "").substring(0, 300);
          console.log(`[Agent] Tool #${turnCount}: ${input.toolName}`);
          console.log(`[Agent]   Args: ${argsPreview}`);
          console.log(`[Agent]   Result: ${resultPreview}`);

          // Workaround: the CLI has a bug where defineTool handlers never execute
          // ("External tool invocation missing toolCallId"). Capture submit_analysis
          // args here in the hook instead — the hook always fires with the full args.
          if (input.toolName === "submit_analysis" && input.toolArgs && !capturedResult.value) {
            const args = input.toolArgs;
            const rawFindings = Array.isArray(args.findings) ? args.findings : [];
            capturedResult.value = {
              findings: normalizeFindings(rawFindings),
              summary: typeof args.summary === "string" ? args.summary : "",
              falsePositiveLineNumbers: Array.isArray(args.false_positive_line_numbers)
                ? args.false_positive_line_numbers.filter((n: unknown) => typeof n === "number")
                : [],
            };
            console.log(`[Agent] submit_analysis captured via hook: ${capturedResult.value.findings.length} findings, summary=${capturedResult.value.summary.length} chars`);
            // Kill the session — the SDK bug causes the agent to retry submit_analysis
            // endlessly because the handler never returns success. Abort immediately
            // since we already have the data.
            console.log(`[Agent] Aborting session (data captured, preventing retry loop)`);
            abortController.abort();
          }

          return undefined;
        },
      },
    });

    console.log(`[Agent] Sending analysis prompt with file attachment: ${options.filePath}`);

    let result: any;
    try {
      result = await session.sendAndWait(
        {
          prompt: `Analyze the attached log file for security threats. Validate each rule-based finding listed in the system context, then search for threats the rules missed.

CRITICAL INSTRUCTION: When your analysis is complete, you MUST call the submit_analysis tool to submit your results. This is the ONLY way to return findings. Do NOT write JSON to the chat — use the submit_analysis tool. If you do not call submit_analysis, your findings will be lost.`,
          attachments: [{ type: "file" as const, path: options.filePath }],
        },
        AGENT_TIMEOUT_MS,
      );
    } catch (err: any) {
      // Expected when we abort after capturing submit_analysis
      if (capturedResult.value) {
        console.log(`[Agent] Session ended after abort (data already captured)`);
      } else {
        throw err;
      }
    }

    await session.destroy().catch(() => {});

    // Prefer the captured tool call result
    if (capturedResult.value) {
      console.log(`[Agent] Analysis complete after ${turnCount} tool calls (via submit_analysis tool)`);
      return capturedResult.value;
    }

    // Fallback: try to parse the text response
    if (result?.data?.content) {
      console.log(`[Agent] Analysis complete after ${turnCount} tool calls (fallback to text parsing)`);
      console.log(`[Agent] Response preview: ${result.data.content.substring(0, 300)}`);
      try {
        return parseAgentResponse(result.data.content);
      } catch {
        console.warn(`[Agent] Failed to parse text response as JSON`);
      }
    }

    console.warn(`[Agent] No results captured — agent did not call submit_analysis or return parseable JSON`);
    return { findings: [], summary: "", falsePositiveLineNumbers: [] };
  } finally {
    await client.stop().catch(() => {});
  }
}

// ── Resume interrupted analysis ────────────────────────────────

export async function resumeAgenticAnalysis(
  options: AgenticAnalysisOptions,
): Promise<AgenticAnalysisResult> {
  const client = new CopilotClient({ logLevel: "warning" });

  const capturedResult: { value: AgenticAnalysisResult | null } = { value: null };
  const submitTool = createSubmitAnalysisTool(capturedResult);

  try {
    await client.start();

    const sessionId = `analysis-${options.analysisResultId}`;
    const providerConfig = getProviderConfig(options.provider, options.apiKey);

    console.log(`[Agent] Resuming session ${sessionId}`);

    let turnCount = 0;
    const abortController = new AbortController();

    const session = await client.resumeSession(sessionId, {
      provider: providerConfig,
      onPermissionRequest: approveAll,
      tools: [submitTool],
      skillDirectories: [join(process.cwd(), "skills")],
      hooks: {
        onPostToolUse: async (input: any) => {
          turnCount++;
          options.onTurnComplete?.(turnCount);

          const argsPreview = JSON.stringify(input.toolArgs || {}).substring(0, 200);
          const resultPreview = JSON.stringify(input.toolResult || "").substring(0, 300);
          console.log(`[Agent] Tool #${turnCount}: ${input.toolName}`);
          console.log(`[Agent]   Args: ${argsPreview}`);
          console.log(`[Agent]   Result: ${resultPreview}`);

          if (input.toolName === "submit_analysis" && input.toolArgs && !capturedResult.value) {
            const args = input.toolArgs;
            const rawFindings = Array.isArray(args.findings) ? args.findings : [];
            capturedResult.value = {
              findings: normalizeFindings(rawFindings),
              summary: typeof args.summary === "string" ? args.summary : "",
              falsePositiveLineNumbers: Array.isArray(args.false_positive_line_numbers)
                ? args.false_positive_line_numbers.filter((n: unknown) => typeof n === "number")
                : [],
            };
            console.log(`[Agent] submit_analysis captured via hook: ${capturedResult.value.findings.length} findings, summary=${capturedResult.value.summary.length} chars`);
            console.log(`[Agent] Aborting session (data captured, preventing retry loop)`);
            abortController.abort();
          }

          return undefined;
        },
      },
    });

    let result: any;
    try {
      result = await session.sendAndWait(
        { prompt: "Continue your security analysis from where you left off. When done, call the submit_analysis tool with your results." },
        AGENT_TIMEOUT_MS,
      );
    } catch (err: any) {
      if (capturedResult.value) {
        console.log(`[Agent] Session ended after abort (data already captured)`);
      } else {
        throw err;
      }
    }

    await session.destroy().catch(() => {});

    if (capturedResult.value) {
      console.log(`[Agent] Resumed analysis complete after ${turnCount} tool calls (via submit_analysis tool)`);
      return capturedResult.value;
    }

    if (result?.data?.content) {
      console.log(`[Agent] Resumed analysis complete after ${turnCount} tool calls (fallback to text parsing)`);
      try {
        return parseAgentResponse(result.data.content);
      } catch {
        console.warn(`[Agent] Failed to parse resumed response as JSON`);
      }
    }

    return { findings: [], summary: "", falsePositiveLineNumbers: [] };
  } finally {
    await client.stop().catch(() => {});
  }
}
