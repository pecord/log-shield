/**
 * LLM analysis orchestrator.
 *
 * Routes to the Copilot SDK agentic analysis which uses built-in tools
 * (file reading, grep, etc.) to intelligently explore the log file rather
 * than blindly chunking it. Supports both Anthropic and OpenAI via BYOK.
 *
 * When no API key is configured, returns llmAvailable=false and the
 * pipeline runs rule-based analysis only.
 */
import { readFile } from "fs/promises";
import type { RawFinding } from "@/analysis/types";
import type { LLMOverride } from "./client";
import { runAgenticAnalysis, resumeAgenticAnalysis } from "./agent";

export interface LLMAnalysisResult {
  findings: RawFinding[];
  overallSummary: string | null;
  llmAvailable: boolean;
  llmCompleted: boolean;
  /** Line numbers the agent identified as rule-engine false positives */
  falsePositiveLineNumbers?: number[];
}

export interface LLMProgressCallback {
  /** Called with findings so the pipeline can persist them immediately */
  onBatchFindings?(findings: RawFinding[]): Promise<void>;
}

/**
 * Resolve the provider and API key from user override or env vars.
 */
function resolveProvider(llmOverride?: LLMOverride): {
  provider: "anthropic" | "openai";
  apiKey: string;
} | null {
  if (llmOverride) {
    return { provider: llmOverride.provider, apiKey: llmOverride.apiKey };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  }
  return null;
}

/**
 * Run LLM analysis on a log file using the Copilot SDK agent.
 *
 * The agent receives the file as an attachment and uses built-in tools
 * to explore it — validating rule findings and searching for missed threats.
 * No chunking needed; the agent decides what to investigate.
 */
export async function runLLMAnalysis(
  filePath: string,
  ruleFindings: RawFinding[],
  llmOverride?: LLMOverride,
  progress?: LLMProgressCallback,
  logFormat?: string,
  analysisResultId?: string,
): Promise<LLMAnalysisResult> {
  const resolved = resolveProvider(llmOverride);

  if (!resolved) {
    return {
      findings: [],
      overallSummary: null,
      llmAvailable: false,
      llmCompleted: false,
    };
  }

  console.log(`[LLM] Starting agentic analysis with ${resolved.provider}`);

  try {
    // Read file to count lines and populate lineContent for findings
    const fileContent = await readFile(filePath, "utf-8");
    const fileLines = fileContent.split("\n");

    const result = await runAgenticAnalysis({
      filePath,
      totalLines: fileLines.length,
      logFormat: logFormat || "plain",
      ruleFindings,
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      analysisResultId: analysisResultId || "unknown",
      onTurnComplete: (turn) => {
        console.log(`[Agent] Tool call ${turn} complete`);
      },
    });

    // Populate lineContent from file for findings with line numbers
    for (const finding of result.findings) {
      if (finding.lineNumber !== null && !finding.lineContent) {
        const idx = finding.lineNumber - 1;
        if (idx >= 0 && idx < fileLines.length) {
          finding.lineContent = fileLines[idx];
        }
      }
    }

    // Persist findings via progress callback
    if (progress?.onBatchFindings && result.findings.length > 0) {
      await progress.onBatchFindings(result.findings);
    }

    console.log(`[LLM] Agent analysis complete: ${result.findings.length} findings`);

    return {
      findings: result.findings,
      overallSummary: result.summary || null,
      llmAvailable: true,
      llmCompleted: true,
      falsePositiveLineNumbers: result.falsePositiveLineNumbers,
    };
  } catch (error) {
    console.error("[LLM] Agentic analysis failed:", error);
    return {
      findings: [],
      overallSummary: null,
      llmAvailable: true,
      llmCompleted: false,
    };
  }
}

/**
 * Resume an interrupted agentic analysis session.
 * Re-provides the API key (not persisted) and continues from where the agent left off.
 */
export async function resumeLLMAnalysis(
  filePath: string,
  ruleFindings: RawFinding[],
  llmOverride?: LLMOverride,
  progress?: LLMProgressCallback,
  logFormat?: string,
  analysisResultId?: string,
): Promise<LLMAnalysisResult> {
  const resolved = resolveProvider(llmOverride);

  if (!resolved) {
    return {
      findings: [],
      overallSummary: null,
      llmAvailable: false,
      llmCompleted: false,
    };
  }

  console.log(`[LLM] Resuming agentic analysis with ${resolved.provider}`);

  try {
    const fileContent = await readFile(filePath, "utf-8");
    const fileLines = fileContent.split("\n");

    const result = await resumeAgenticAnalysis({
      filePath,
      totalLines: fileLines.length,
      logFormat: logFormat || "plain",
      ruleFindings,
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      analysisResultId: analysisResultId || "unknown",
      onTurnComplete: (turn) => {
        console.log(`[Agent] Tool call ${turn} complete (resumed)`);
      },
    });

    for (const finding of result.findings) {
      if (finding.lineNumber !== null && !finding.lineContent) {
        const idx = finding.lineNumber - 1;
        if (idx >= 0 && idx < fileLines.length) {
          finding.lineContent = fileLines[idx];
        }
      }
    }

    if (progress?.onBatchFindings && result.findings.length > 0) {
      await progress.onBatchFindings(result.findings);
    }

    return {
      findings: result.findings,
      overallSummary: result.summary || null,
      llmAvailable: true,
      llmCompleted: true,
      falsePositiveLineNumbers: result.falsePositiveLineNumbers,
    };
  } catch (error) {
    console.error("[LLM] Resumed analysis failed, falling back to fresh run:", error);
    // Session may be corrupted — fall back to fresh analysis
    return runLLMAnalysis(filePath, ruleFindings, llmOverride, progress, logFormat, analysisResultId);
  }
}
