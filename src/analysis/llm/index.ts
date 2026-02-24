import { readFile } from "fs/promises";
import type { RawFinding } from "@/analysis/types";
import { createLLMClient } from "./client";
import { chunkLogFile } from "./chunker";
import { SYSTEM_PROMPT, buildChunkPrompt, buildSummaryPrompt } from "./prompt";
import { parseLLMResponse } from "./parser";

export interface LLMAnalysisResult {
  findings: RawFinding[];
  overallSummary: string | null;
  llmAvailable: boolean;
  llmCompleted: boolean;
}

export async function runLLMAnalysis(
  filePath: string,
  ruleFindings: RawFinding[]
): Promise<LLMAnalysisResult> {
  const client = createLLMClient();

  if (!client.isAvailable()) {
    return {
      findings: [],
      overallSummary: null,
      llmAvailable: false,
      llmCompleted: false,
    };
  }

  console.log(`[LLM] Starting analysis with ${client.providerName()}`);

  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const chunks = chunkLogFile(lines);

  console.log(`[LLM] Split into ${chunks.length} chunks`);

  const allFindings: RawFinding[] = [];

  for (const chunk of chunks) {
    try {
      // Find rule findings relevant to this chunk
      const chunkRuleFindings = ruleFindings.filter(
        (f) =>
          f.lineNumber !== null &&
          f.lineNumber >= chunk.startLine &&
          f.lineNumber <= chunk.endLine
      );

      const userPrompt = buildChunkPrompt(
        chunk.content,
        chunk.startLine,
        chunk.endLine,
        chunkRuleFindings
      );

      const response = await client.analyze(SYSTEM_PROMPT, userPrompt);
      const findings = parseLLMResponse(response, chunk.startLine);

      // Enrich findings with line content from the original file
      for (const finding of findings) {
        if (finding.lineNumber !== null && finding.lineNumber > 0 && finding.lineNumber <= lines.length) {
          finding.lineContent = lines[finding.lineNumber - 1] || null;
        }
      }

      allFindings.push(...findings);
      console.log(`[LLM] Chunk ${chunk.id + 1}/${chunks.length}: ${findings.length} findings`);

      // Rate limiting: 1 second between API calls
      if (chunk.id < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`[LLM] Error processing chunk ${chunk.id}:`, error);
    }
  }

  // Generate overall summary
  let overallSummary: string | null = null;
  const totalFindings = ruleFindings.length + allFindings.length;

  if (totalFindings > 0) {
    try {
      const severityCounts: Record<string, number> = {};
      const categoryCounts: Record<string, number> = {};
      for (const f of [...ruleFindings, ...allFindings]) {
        severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
        categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
      }

      const summaryPrompt = buildSummaryPrompt(
        lines.length,
        totalFindings,
        severityCounts,
        categoryCounts
      );

      overallSummary = await client.analyze(
        "You are a cybersecurity analyst writing an executive summary.",
        summaryPrompt
      );
    } catch (error) {
      console.error("[LLM] Error generating summary:", error);
    }
  }

  return {
    findings: allFindings,
    overallSummary,
    llmAvailable: true,
    llmCompleted: true,
  };
}
