import { join } from "path";
import { prisma } from "@/lib/prisma";
import { runRuleEngine } from "./rule-engine";
import { runLLMAnalysis } from "./llm";
import { mergeFindings } from "./merger";
import type { AnalysisPipelineResult } from "./types";

/**
 * Main analysis pipeline orchestrator.
 * Runs rule-based detection, then LLM analysis, merges results,
 * and persists everything to the database.
 *
 * AI USAGE DOCUMENTATION:
 * - Rule-based engine: No AI used. Pure regex pattern matching and statistical analysis.
 * - LLM analysis: Uses Anthropic Claude or OpenAI GPT to analyze log chunks for
 *   contextual threat detection. The LLM receives log lines with a system prompt
 *   instructing it to identify security threats and return structured JSON findings.
 *   This provides deeper analysis than pattern matching alone, catching sophisticated
 *   attack patterns and providing human-readable descriptions + remediation advice.
 * - Summary generation: Uses the same LLM to produce an executive summary of findings.
 */
export async function runAnalysisPipeline(uploadId: string): Promise<void> {
  let analysisResultId: string | undefined;

  try {
    // 1. Load upload and validate
    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) throw new Error(`Upload not found: ${uploadId}`);

    // 2. Update upload status
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "ANALYZING" },
    });

    // 3. Create analysis result record
    const analysisResult = await prisma.analysisResult.create({
      data: {
        uploadId,
        status: "IN_PROGRESS",
        analysisStartedAt: new Date(),
      },
    });
    analysisResultId = analysisResult.id;

    const filePath = join(process.cwd(), upload.storagePath);

    // 4. Run rule-based analysis (always runs)
    console.log(`[Pipeline] Starting rule-based analysis for upload ${uploadId}`);
    const ruleResult = await runRuleEngine(filePath);
    console.log(
      `[Pipeline] Rule engine found ${ruleResult.findings.length} findings in ${ruleResult.totalLinesProcessed} lines`
    );

    await prisma.analysisResult.update({
      where: { id: analysisResultId },
      data: {
        ruleBasedCompleted: true,
        totalLinesAnalyzed: ruleResult.totalLinesProcessed,
      },
    });

    // 5. Run LLM analysis (conditional)
    console.log(`[Pipeline] Starting LLM analysis for upload ${uploadId}`);
    const llmResult = await runLLMAnalysis(filePath, ruleResult.findings);
    console.log(
      `[Pipeline] LLM analysis: available=${llmResult.llmAvailable}, findings=${llmResult.findings.length}`
    );

    // 6. Merge and deduplicate
    const mergedFindings = mergeFindings(ruleResult.findings, llmResult.findings);
    console.log(
      `[Pipeline] Merged: ${mergedFindings.length} unique findings (from ${ruleResult.findings.length} rule + ${llmResult.findings.length} LLM)`
    );

    // 7. Compute severity counts
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of mergedFindings) {
      counts[f.severity]++;
    }

    // 8. Persist findings in batches
    if (mergedFindings.length > 0) {
      await prisma.finding.createMany({
        data: mergedFindings.map((f) => ({
          analysisResultId: analysisResultId!,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description,
          lineNumber: f.lineNumber,
          lineContent: f.lineContent,
          matchedPattern: f.matchedPattern,
          source: f.source,
          fingerprint: f.fingerprint,
          recommendation: f.recommendation,
          confidence: f.confidence,
          mitreTactic: f.mitreTactic,
          mitreTechnique: f.mitreTechnique,
        })),
      });
    }

    // 9. Finalize analysis result
    await prisma.analysisResult.update({
      where: { id: analysisResultId },
      data: {
        status: "COMPLETED",
        totalFindings: mergedFindings.length,
        criticalCount: counts.CRITICAL,
        highCount: counts.HIGH,
        mediumCount: counts.MEDIUM,
        lowCount: counts.LOW,
        infoCount: counts.INFO,
        llmCompleted: llmResult.llmCompleted,
        llmAvailable: llmResult.llmAvailable,
        overallSummary: llmResult.overallSummary,
        analysisEndedAt: new Date(),
      },
    });

    // 10. Update upload status
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "COMPLETED" },
    });

    console.log(`[Pipeline] Analysis completed for upload ${uploadId}`);
  } catch (error) {
    console.error(`[Pipeline] Analysis failed for upload ${uploadId}:`, error);

    // Update status to FAILED
    if (analysisResultId) {
      await prisma.analysisResult.update({
        where: { id: analysisResultId },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          analysisEndedAt: new Date(),
        },
      });
    }

    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "FAILED" },
    });
  }
}
