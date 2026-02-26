import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: { findUnique: vi.fn(), update: vi.fn() },
    analysisResult: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    finding: { createMany: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("../rule-engine", () => ({ runRuleEngine: vi.fn() }));
vi.mock("../llm", () => ({ runLLMAnalysis: vi.fn(), resumeLLMAnalysis: vi.fn() }));
vi.mock("../merger", () => ({ mergeFindingsProgressive: vi.fn() }));
vi.mock("@/lib/analysis-events", () => ({
  analysisEvents: { emit: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
}));

vi.mock("@/lib/user-settings", () => ({
  resolveUserSettings: vi.fn().mockResolvedValue({
    llmApiKey: null,
    llmProvider: null,
    s3Config: null,
  }),
}));

vi.mock("@/lib/storage-s3", () => ({
  S3StorageProvider: vi.fn(),
}));

import { runAnalysisPipeline } from "../pipeline";
import { prisma } from "@/lib/prisma";
import { runRuleEngine } from "../rule-engine";
import { runLLMAnalysis } from "../llm";
import { mergeFindingsProgressive } from "../merger";

// ── Helpers ──────────────────────────────────────────────
const mockUpload = {
  id: "upload-1",
  userId: "user-1",
  storagePath: "uploads/u1/file.log",
  storageType: "local",
};

function setupHappyPath(opts?: {
  ruleFindings?: any[];
  llmFindings?: any[];
  supersededFingerprints?: string[];
}) {
  const {
    ruleFindings = [],
    llmFindings = [],
    supersededFingerprints = [],
  } = opts ?? {};

  (prisma.upload.findUnique as any).mockResolvedValue(mockUpload);
  (prisma.upload.update as any).mockResolvedValue({});
  (prisma.analysisResult.create as any).mockResolvedValue({ id: "ar-1" });
  (prisma.analysisResult.update as any).mockResolvedValue({});
  (prisma.analysisResult.findUnique as any).mockResolvedValue({ uploadId: "upload-1" });
  (prisma.finding.createMany as any).mockResolvedValue({});
  (prisma.finding.deleteMany as any).mockResolvedValue({});
  (prisma.finding.groupBy as any).mockResolvedValue([]);

  (runRuleEngine as any).mockResolvedValue({
    findings: ruleFindings,
    totalLinesProcessed: 100,
    skippedLineCount: 2,
    logFormat: "plain",
  });

  // Mock runLLMAnalysis — new signature: (filePath, ruleFindings, override, progress, logFormat, analysisResultId)
  (runLLMAnalysis as any).mockImplementation(
    async (_path: string, _rules: any, _override: any, progress: any) => {
      if (llmFindings.length > 0 && progress?.onBatchFindings) {
        await progress.onBatchFindings(llmFindings);
      }
      return {
        findings: llmFindings,
        llmCompleted: false,
        llmAvailable: false,
        overallSummary: null,
        falsePositiveLineNumbers: [],
      };
    },
  );

  (mergeFindingsProgressive as any).mockReturnValue({
    llmFindings,
    supersededRuleFingerprints: supersededFingerprints,
  });
}

// ── Tests ────────────────────────────────────────────────
describe("runAnalysisPipeline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("transitions upload status ANALYZING → COMPLETED on success", async () => {
    setupHappyPath();

    await runAnalysisPipeline("upload-1");

    const statusUpdates = (prisma.upload.update as any).mock.calls.map(
      (c: any) => c[0].data.status,
    ).filter(Boolean);
    expect(statusUpdates).toEqual(["ANALYZING", "COMPLETED"]);
  });

  it("creates an AnalysisResult record with IN_PROGRESS", async () => {
    setupHappyPath();

    await runAnalysisPipeline("upload-1");

    expect(prisma.analysisResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ uploadId: "upload-1", status: "IN_PROGRESS" }),
      }),
    );
  });

  it("marks upload FAILED when not found", async () => {
    (prisma.upload.findUnique as any).mockResolvedValue(null);
    (prisma.upload.update as any).mockResolvedValue({});

    await runAnalysisPipeline("missing-id");

    expect(prisma.upload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("marks analysisResult FAILED with error message when rule engine throws", async () => {
    (prisma.upload.findUnique as any).mockResolvedValue(mockUpload);
    (prisma.upload.update as any).mockResolvedValue({});
    (prisma.analysisResult.create as any).mockResolvedValue({ id: "ar-1" });
    (prisma.analysisResult.update as any).mockResolvedValue({});
    (runRuleEngine as any).mockRejectedValue(new Error("ENOENT: file not found"));

    await runAnalysisPipeline("upload-1");

    expect(prisma.analysisResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "ENOENT: file not found",
        }),
      }),
    );
  });

  it("persists skippedLineCount from rule engine result", async () => {
    setupHappyPath();

    await runAnalysisPipeline("upload-1");

    const ruleUpdate = (prisma.analysisResult.update as any).mock.calls.find(
      (c: any) => c[0].data.ruleBasedCompleted === true,
    );
    expect(ruleUpdate).toBeDefined();
    expect(ruleUpdate[0].data.skippedLineCount).toBe(2);
    expect(ruleUpdate[0].data.totalLinesAnalyzed).toBe(100);
    expect(ruleUpdate[0].data.logFormat).toBe("plain");
  });

  // ── Two-phase persistence tests ───────────────────────
  it("persists rule findings immediately via createMany before LLM runs", async () => {
    const ruleFindings = [
      {
        severity: "HIGH",
        category: "XSS",
        title: "XSS",
        description: "desc",
        lineNumber: 10,
        lineContent: "<script>",
        matchedPattern: "<script>",
        source: "RULE_BASED",
        fingerprint: "rule-fp1",
        recommendation: null,
        confidence: 0.9,
        mitreTactic: null,
        mitreTechnique: null,
        eventTimestamp: null,
      },
    ];
    setupHappyPath({ ruleFindings });

    await runAnalysisPipeline("upload-1");

    // First createMany should be rule findings
    const firstCreateMany = (prisma.finding.createMany as any).mock.calls[0];
    expect(firstCreateMany).toBeDefined();
    expect(firstCreateMany[0].data).toHaveLength(1);
    expect(firstCreateMany[0].data[0].source).toBe("RULE_BASED");
    expect(firstCreateMany[0].data[0].fingerprint).toBe("rule-fp1");
  });

  it("updates severity counts with rule-only counts immediately after rules", async () => {
    const ruleFindings = [
      { severity: "CRITICAL", category: "SQL_INJECTION", fingerprint: "fp1", source: "RULE_BASED", title: "t", description: "d", lineNumber: 1, lineContent: null, matchedPattern: null, recommendation: null, confidence: null, mitreTactic: null, mitreTechnique: null, eventTimestamp: null },
      { severity: "HIGH", category: "XSS", fingerprint: "fp2", source: "RULE_BASED", title: "t", description: "d", lineNumber: 2, lineContent: null, matchedPattern: null, recommendation: null, confidence: null, mitreTactic: null, mitreTechnique: null, eventTimestamp: null },
    ];
    setupHappyPath({ ruleFindings });

    await runAnalysisPipeline("upload-1");

    const ruleUpdate = (prisma.analysisResult.update as any).mock.calls.find(
      (c: any) => c[0].data.ruleBasedCompleted === true,
    );
    expect(ruleUpdate).toBeDefined();
    expect(ruleUpdate[0].data.totalFindings).toBe(2);
    expect(ruleUpdate[0].data.criticalCount).toBe(1);
    expect(ruleUpdate[0].data.highCount).toBe(1);
  });

  it("deletes superseded rule findings via onBatchFindings during LLM processing", async () => {
    const ruleFindings = [
      { severity: "HIGH", category: "SQL_INJECTION", fingerprint: "rule-fp1", source: "RULE_BASED", title: "t", description: "d", lineNumber: 5, lineContent: "test", matchedPattern: "UNION", recommendation: null, confidence: 0.9, mitreTactic: null, mitreTechnique: null, eventTimestamp: null },
    ];
    const llmFindings = [
      { severity: "HIGH", category: "SQL_INJECTION", fingerprint: "llm-fp1", source: "LLM", title: "t", description: "d", lineNumber: 5, lineContent: "test", matchedPattern: null, recommendation: null, confidence: 0.9, mitreTactic: null, mitreTechnique: null, eventTimestamp: null },
    ];
    setupHappyPath({
      ruleFindings,
      llmFindings,
      supersededFingerprints: ["rule-fp1"],
    });

    await runAnalysisPipeline("upload-1");

    expect(prisma.finding.deleteMany).toHaveBeenCalledWith({
      where: {
        analysisResultId: "ar-1",
        fingerprint: { in: ["rule-fp1"] },
      },
    });
  });

  it("does not call deleteMany when no superseded fingerprints", async () => {
    setupHappyPath();

    await runAnalysisPipeline("upload-1");

    expect(prisma.finding.deleteMany).not.toHaveBeenCalled();
  });

  it("recounts severity from DB via groupBy for final totals", async () => {
    setupHappyPath();
    (prisma.finding.groupBy as any).mockResolvedValue([
      { severity: "CRITICAL", _count: { severity: 2 } },
      { severity: "HIGH", _count: { severity: 3 } },
    ]);

    await runAnalysisPipeline("upload-1");

    const completedCall = (prisma.analysisResult.update as any).mock.calls.find(
      (c: any) => c[0].data.status === "COMPLETED",
    );
    expect(completedCall).toBeDefined();
    expect(completedCall[0].data.totalFindings).toBe(5);
    expect(completedCall[0].data.criticalCount).toBe(2);
    expect(completedCall[0].data.highCount).toBe(3);
    expect(completedCall[0].data.mediumCount).toBe(0);
  });

  it("passes progress callback with onBatchFindings to runLLMAnalysis", async () => {
    setupHappyPath();

    await runAnalysisPipeline("upload-1");

    const llmCall = (runLLMAnalysis as any).mock.calls[0];
    expect(llmCall).toBeDefined();
    expect(llmCall.length).toBeGreaterThanOrEqual(4);
    const progressArg = llmCall[3];
    expect(progressArg).toBeDefined();
    expect(typeof progressArg.onBatchFindings).toBe("function");
  });

  it("does not call createMany for rule findings when there are none", async () => {
    setupHappyPath({ ruleFindings: [] });

    await runAnalysisPipeline("upload-1");

    // createMany should not be called for rule findings (LLM also empty)
    expect(prisma.finding.createMany).not.toHaveBeenCalled();
  });

  it("deletes false-positive rule findings identified by the agent", async () => {
    const ruleFindings = [
      { severity: "HIGH", category: "XSS", fingerprint: "fp1", source: "RULE_BASED", title: "t", description: "d", lineNumber: 10, lineContent: null, matchedPattern: null, recommendation: null, confidence: null, mitreTactic: null, mitreTechnique: null, eventTimestamp: null },
    ];
    setupHappyPath({ ruleFindings });

    // Override LLM mock to return false positive line numbers
    (runLLMAnalysis as any).mockResolvedValue({
      findings: [],
      llmCompleted: true,
      llmAvailable: true,
      overallSummary: null,
      falsePositiveLineNumbers: [10],
    });

    await runAnalysisPipeline("upload-1");

    // Should delete rule findings at false-positive lines
    expect(prisma.finding.deleteMany).toHaveBeenCalledWith({
      where: {
        analysisResultId: "ar-1",
        source: "RULE_BASED",
        lineNumber: { in: [10] },
      },
    });
  });

  it("passes logFormat and analysisResultId to runLLMAnalysis", async () => {
    setupHappyPath();

    await runAnalysisPipeline("upload-1");

    const llmCall = (runLLMAnalysis as any).mock.calls[0];
    // args: filePath, ruleFindings, override, progress, logFormat, analysisResultId
    expect(llmCall[4]).toBe("plain"); // logFormat from rule engine
    expect(llmCall[5]).toBe("ar-1"); // analysisResultId
  });
});
