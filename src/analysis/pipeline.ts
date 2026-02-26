import { join } from "path";
import { tmpdir } from "os";
import { writeFile, unlink } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { analysisEvents } from "@/lib/analysis-events";
import { resolveUserSettings } from "@/lib/user-settings";
import { S3StorageProvider, type S3Config } from "@/lib/storage-s3";
import { runRuleEngine } from "./rule-engine";
import { runLLMAnalysis, resumeLLMAnalysis } from "./llm";
import type { LLMOverride } from "./llm/client";
import type { LLMProgressCallback } from "./llm";
import { mergeFindingsProgressive } from "./merger";
import type { RawFinding, Severity } from "./types";
import type { LLMAnalysisResult } from "./llm";

/**
 * Main analysis pipeline orchestrator.
 * Runs rule-based detection, then LLM analysis, merges results,
 * and persists everything to the database.
 *
 * AI USAGE DOCUMENTATION:
 * - Rule-based engine: No AI used. Pure regex pattern matching and statistical analysis.
 * - LLM analysis: Uses the GitHub Copilot SDK to create an intelligent agent that
 *   explores the log file using built-in tools (file reading, grep, etc.). The agent
 *   validates rule-based findings, searches for missed threats, and produces an
 *   executive summary. Supports Anthropic and OpenAI via BYOK (bring your own key).
 *   Skills (skills/security-analysis/SKILL.md) provide domain-specific instructions.
 *
 * DURABILITY:
 *   - Rule findings are persisted immediately after the rule engine completes.
 *   - LLM findings are persisted when the agent completes its analysis.
 *   - Session persistence: deterministic sessionId enables crash recovery via
 *     resumeSession() which re-provides the API key and continues from where
 *     the agent left off.
 *   - Fire-and-forget: the pipeline runs as an async function detached from the
 *     HTTP request lifecycle. Durability is handled by instrumentation.ts:
 *     startup recovery resumes stuck uploads, and a periodic stall detector
 *     catches silently-hung analyses during normal operation.
 *   - Agent concurrency: limited to 1 at a time via semaphore to prevent OOM
 *     (each Copilot CLI subprocess uses significant memory).
 */

// ── Agent concurrency limiter ──────────────────────────────────
// The Copilot CLI subprocess is memory-heavy. Running multiple agents
// concurrently OOM-kills the container. This simple semaphore serializes
// agent runs while allowing rule-based analysis to proceed in parallel.
const agentQueue: (() => void)[] = [];
let agentRunning = false;

function acquireAgentSlot(): Promise<void> {
  if (!agentRunning) {
    agentRunning = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => agentQueue.push(resolve));
}

function releaseAgentSlot(): void {
  const next = agentQueue.shift();
  if (next) {
    next(); // hand the slot to the next waiter
  } else {
    agentRunning = false;
  }
}

/** Convert a RawFinding to the shape Prisma expects for createMany */
function toFindingData(f: RawFinding, analysisResultId: string) {
  return {
    analysisResultId,
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
    eventTimestamp: f.eventTimestamp ? new Date(f.eventTimestamp) : null,
  };
}

/** Recount severity totals from the DB and update the analysis result */
async function recountAndFinalize(analysisResultId: string) {
  const severityGroups = await prisma.finding.groupBy({
    by: ["severity"],
    where: { analysisResultId },
    _count: { severity: true },
  });
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const g of severityGroups) {
    counts[g.severity as Severity] = g._count.severity;
  }
  const totalFindings = Object.values(counts).reduce((a, b) => a + b, 0);
  return { totalFindings, ...counts };
}

/** Resolve the file path for an upload (local or S3 download to temp) */
async function resolveFilePath(
  upload: { id: string; storageType: string; storagePath: string },
  s3Config: S3Config | null,
): Promise<{ filePath: string; tempFilePath: string | null }> {
  if (upload.storageType === "s3" && s3Config) {
    const s3Provider = new S3StorageProvider(s3Config);
    const fileData = await s3Provider.read(upload.storagePath);
    const tempFilePath = join(tmpdir(), `logshield-${upload.id}-${Date.now()}`);
    await writeFile(tempFilePath, fileData);
    return { filePath: tempFilePath, tempFilePath };
  }
  return { filePath: join(process.cwd(), upload.storagePath), tempFilePath: null };
}

/** Read current upload+analysisResult from DB and emit to SSE subscribers */
async function emitProgress(uploadId: string): Promise<void> {
  try {
    const data = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: {
        analysisResult: {
          select: {
            id: true,
            status: true,
            totalLinesAnalyzed: true,
            totalFindings: true,
            criticalCount: true,
            highCount: true,
            mediumCount: true,
            lowCount: true,
            infoCount: true,
            ruleBasedCompleted: true,
            llmCompleted: true,
            llmAvailable: true,
            overallSummary: true,
            analysisStartedAt: true,
            analysisEndedAt: true,
            errorMessage: true,
            skippedLineCount: true,
            logFormat: true,
            createdAt: true,
          },
        },
      },
    });
    if (data) analysisEvents.emit(uploadId, data);
  } catch {
    // Best-effort — don't let SSE emission break the pipeline
  }
}

/**
 * Run the full analysis pipeline for a fresh upload.
 */
export async function runAnalysisPipeline(uploadId: string): Promise<void> {
  let analysisResultId: string | undefined;
  let tempFilePath: string | null = null;

  try {
    // 1. Load upload and validate
    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) throw new Error(`Upload not found: ${uploadId}`);

    // 1b. Resolve user settings for LLM + storage overrides
    const userSettings = await resolveUserSettings(upload.userId);
    const llmOverride: LLMOverride | undefined =
      userSettings.llmApiKey && userSettings.llmProvider
        ? {
            provider: userSettings.llmProvider as "anthropic" | "openai",
            apiKey: userSettings.llmApiKey,
          }
        : undefined;

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
    await emitProgress(uploadId);

    // 3b. Resolve file path
    const resolved = await resolveFilePath(upload, userSettings.s3Config);
    const filePath = resolved.filePath;
    tempFilePath = resolved.tempFilePath;

    // 4. Run rule-based analysis (always runs)
    console.log(`[Pipeline] Starting rule-based analysis for upload ${uploadId}`);
    const ruleResult = await runRuleEngine(filePath);
    console.log(
      `[Pipeline] Rule engine found ${ruleResult.findings.length} findings in ${ruleResult.totalLinesProcessed} lines`
    );

    // 4b. Persist rule findings IMMEDIATELY so the UI can show them
    if (ruleResult.findings.length > 0) {
      await prisma.finding.createMany({
        data: ruleResult.findings.map((f) => toFindingData(f, analysisResultId!)),
      });
    }

    // 4c. Compute rule-only severity counts and expose immediately
    const ruleCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of ruleResult.findings) {
      ruleCounts[f.severity]++;
    }

    await prisma.analysisResult.update({
      where: { id: analysisResultId },
      data: {
        ruleBasedCompleted: true,
        totalLinesAnalyzed: ruleResult.totalLinesProcessed,
        skippedLineCount: ruleResult.skippedLineCount,
        logFormat: ruleResult.logFormat,
        totalFindings: ruleResult.findings.length,
        criticalCount: ruleCounts.CRITICAL,
        highCount: ruleCounts.HIGH,
        mediumCount: ruleCounts.MEDIUM,
        lowCount: ruleCounts.LOW,
        infoCount: ruleCounts.INFO,
      },
    });

    await emitProgress(uploadId);

    // 5. Run LLM analysis (agentic via Copilot SDK)
    await runLLMPhase(
      uploadId,
      filePath,
      ruleResult.findings,
      analysisResultId!,
      llmOverride,
      ruleResult.logFormat,
    );

    // 6. Cleanup temp file
    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {});
    }

    console.log(`[Pipeline] Analysis completed for upload ${uploadId}`);
  } catch (error) {
    console.error(`[Pipeline] Analysis failed for upload ${uploadId}:`, error);

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
    await emitProgress(uploadId);

    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {});
    }
  }
}

/**
 * Resume an interrupted analysis pipeline.
 * Picks up from where it left off — skips rules if already done,
 * resumes the LLM agent session.
 */
export async function resumeAnalysisPipeline(uploadId: string): Promise<void> {
  let tempFilePath: string | null = null;

  try {
    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) throw new Error(`Upload not found: ${uploadId}`);

    const analysisResult = await prisma.analysisResult.findFirst({
      where: { uploadId },
      orderBy: { analysisStartedAt: "desc" },
    });
    if (!analysisResult) {
      // No analysis result — run from scratch
      console.log(`[Recovery] No analysis result for ${uploadId}, running full pipeline`);
      return runAnalysisPipeline(uploadId);
    }

    const userSettings = await resolveUserSettings(upload.userId);
    const llmOverride: LLMOverride | undefined =
      userSettings.llmApiKey && userSettings.llmProvider
        ? {
            provider: userSettings.llmProvider as "anthropic" | "openai",
            apiKey: userSettings.llmApiKey,
          }
        : undefined;

    const resolved = await resolveFilePath(upload, userSettings.s3Config);
    const filePath = resolved.filePath;
    tempFilePath = resolved.tempFilePath;

    if (!analysisResult.ruleBasedCompleted) {
      // Rules didn't finish — clean up and restart from scratch
      console.log(`[Recovery] Rules incomplete for ${uploadId}, restarting full pipeline`);
      await prisma.finding.deleteMany({ where: { analysisResultId: analysisResult.id } });
      await prisma.analysisResult.delete({ where: { id: analysisResult.id } });
      await prisma.upload.update({ where: { id: uploadId }, data: { status: "PENDING" } });
      if (tempFilePath) await unlink(tempFilePath).catch(() => {});
      return runAnalysisPipeline(uploadId);
    }

    // Rules are done — resume or restart LLM phase
    console.log(`[Recovery] Resuming LLM for "${upload.fileName}"`);

    // Re-run rule engine to get findings for LLM context (fast, milliseconds)
    const ruleResult = await runRuleEngine(filePath);

    // Clean up any LLM findings from a partial previous run
    await prisma.finding.deleteMany({
      where: { analysisResultId: analysisResult.id, source: "LLM" },
    });

    await runLLMPhase(
      uploadId,
      filePath,
      ruleResult.findings,
      analysisResult.id,
      llmOverride,
      ruleResult.logFormat,
      true, // isResume — try to resume the agent session
    );

    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {});
    }

    console.log(`[Recovery] Analysis resumed and completed for upload ${uploadId}`);
  } catch (error) {
    console.error(`[Recovery] Resume failed for upload ${uploadId}:`, error);

    // Mark as FAILED so the upload doesn't stay stuck in ANALYZING forever.
    // The user can manually re-trigger analysis from the UI if needed.
    try {
      const ar = await prisma.analysisResult.findFirst({
        where: { uploadId },
        orderBy: { analysisStartedAt: "desc" },
      });
      if (ar) {
        await prisma.analysisResult.update({
          where: { id: ar.id },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "Resume failed",
            analysisEndedAt: new Date(),
          },
        });
      }
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: "FAILED" },
      });
      await emitProgress(uploadId);
    } catch (dbError) {
      console.error(`[Recovery] Failed to mark upload ${uploadId} as FAILED:`, dbError);
    }

    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {});
    }
  }
}

/**
 * Shared LLM phase: runs agentic analysis and persists results.
 * Used by both runAnalysisPipeline and resumeAnalysisPipeline.
 */
async function runLLMPhase(
  uploadId: string,
  filePath: string,
  ruleFindings: RawFinding[],
  analysisResultId: string,
  llmOverride: LLMOverride | undefined,
  logFormat: string,
  isResume: boolean = false,
): Promise<void> {
  const progress: LLMProgressCallback = {
    onBatchFindings: async (batchLlmFindings: RawFinding[]) => {
      // Progressive merge: persist LLM findings, supersede overlapping rules
      const { llmFindings, supersededRuleFingerprints } = mergeFindingsProgressive(
        ruleFindings,
        batchLlmFindings,
      );

      if (supersededRuleFingerprints.length > 0) {
        await prisma.finding.deleteMany({
          where: {
            analysisResultId,
            fingerprint: { in: supersededRuleFingerprints },
          },
        });
      }

      if (llmFindings.length > 0) {
        await prisma.finding.createMany({
          data: llmFindings.map((f) => toFindingData(f, analysisResultId)),
        });
      }

      // Update severity counts
      const counts = await recountAndFinalize(analysisResultId);
      await prisma.analysisResult.update({
        where: { id: analysisResultId },
        data: {
          totalFindings: counts.totalFindings,
          criticalCount: counts.CRITICAL,
          highCount: counts.HIGH,
          mediumCount: counts.MEDIUM,
          lowCount: counts.LOW,
          infoCount: counts.INFO,
        },
      });
    },
  };

  console.log(`[Pipeline] Starting LLM analysis (resume=${isResume}), waiting for agent slot...`);
  await acquireAgentSlot();
  console.log(`[Pipeline] Agent slot acquired`);

  let llmResult: LLMAnalysisResult;
  try {
    // Use resume path if recovering an interrupted session
    const llmAnalyze = isResume ? resumeLLMAnalysis : runLLMAnalysis;
    llmResult = await llmAnalyze(
      filePath,
      ruleFindings,
      llmOverride,
      progress,
      logFormat,
      analysisResultId,
    );
  } finally {
    releaseAgentSlot();
  }
  console.log(
    `[Pipeline] LLM analysis: available=${llmResult.llmAvailable}, findings=${llmResult.findings.length}`
  );

  // Remove rule findings the agent identified as false positives
  if (llmResult.falsePositiveLineNumbers?.length) {
    await prisma.finding.deleteMany({
      where: {
        analysisResultId,
        source: "RULE_BASED",
        lineNumber: { in: llmResult.falsePositiveLineNumbers },
      },
    });
    console.log(
      `[Pipeline] Removed ${llmResult.falsePositiveLineNumbers.length} false-positive rule findings`
    );
  }

  // Final recount and finalize
  const finalCounts = await recountAndFinalize(analysisResultId);

  await prisma.analysisResult.update({
    where: { id: analysisResultId },
    data: {
      status: "COMPLETED",
      totalFindings: finalCounts.totalFindings,
      criticalCount: finalCounts.CRITICAL,
      highCount: finalCounts.HIGH,
      mediumCount: finalCounts.MEDIUM,
      lowCount: finalCounts.LOW,
      infoCount: finalCounts.INFO,
      llmCompleted: llmResult.llmCompleted,
      llmAvailable: llmResult.llmAvailable,
      overallSummary: llmResult.overallSummary,
      analysisEndedAt: new Date(),
    },
  });

  await prisma.upload.update({
    where: { id: uploadId },
    data: { status: "COMPLETED" },
  });
  await emitProgress(uploadId);
}
