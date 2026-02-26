import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("line1\nline2\nline3\n"),
}));

vi.mock("../agent", () => ({
  runAgenticAnalysis: vi.fn(),
  resumeAgenticAnalysis: vi.fn(),
}));

import { runLLMAnalysis, resumeLLMAnalysis, type LLMProgressCallback } from "../index";
import { runAgenticAnalysis, resumeAgenticAnalysis } from "../agent";

// ── Helpers ──────────────────────────────────────────────
const mockAgentResult = {
  findings: [
    {
      severity: "HIGH" as const,
      category: "XSS" as const,
      title: "XSS Attempt",
      description: "Found XSS",
      lineNumber: 2,
      lineContent: null,
      matchedPattern: null,
      source: "LLM" as const,
      fingerprint: "fp1",
      recommendation: "Block it",
      confidence: 0.9,
      mitreTactic: null,
      mitreTechnique: null,
    },
  ],
  summary: "Executive summary here",
  falsePositiveLineNumbers: [5],
};

// ── Tests ────────────────────────────────────────────────
describe("runLLMAnalysis (agentic)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns llmAvailable=false when no API key is configured", async () => {
    // No override, no env vars
    const result = await runLLMAnalysis("/test.log", []);
    expect(result.llmAvailable).toBe(false);
    expect(result.llmCompleted).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("routes to runAgenticAnalysis with correct provider config", async () => {
    (runAgenticAnalysis as any).mockResolvedValue(mockAgentResult);

    await runLLMAnalysis(
      "/test.log",
      [],
      { provider: "anthropic", apiKey: "sk-test" },
      undefined,
      "apache",
      "ar-123",
    );

    expect(runAgenticAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: "/test.log",
        provider: "anthropic",
        apiKey: "sk-test",
        logFormat: "apache",
        analysisResultId: "ar-123",
      }),
    );
  });

  it("returns findings and summary from agent result", async () => {
    (runAgenticAnalysis as any).mockResolvedValue(mockAgentResult);

    const result = await runLLMAnalysis(
      "/test.log",
      [],
      { provider: "openai", apiKey: "sk-test" },
    );

    expect(result.llmAvailable).toBe(true);
    expect(result.llmCompleted).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toBe("XSS Attempt");
    expect(result.overallSummary).toBe("Executive summary here");
    expect(result.falsePositiveLineNumbers).toEqual([5]);
  });

  it("populates lineContent from file for findings with lineNumber", async () => {
    (runAgenticAnalysis as any).mockResolvedValue({
      ...mockAgentResult,
      findings: [
        { ...mockAgentResult.findings[0], lineNumber: 2, lineContent: null },
      ],
    });

    const result = await runLLMAnalysis(
      "/test.log",
      [],
      { provider: "anthropic", apiKey: "sk-test" },
    );

    expect(result.findings[0].lineContent).toBe("line2");
  });

  it("calls onBatchFindings with agent findings", async () => {
    (runAgenticAnalysis as any).mockResolvedValue(mockAgentResult);

    const progress: LLMProgressCallback = {
      onBatchFindings: vi.fn().mockResolvedValue(undefined),
    };

    await runLLMAnalysis(
      "/test.log",
      [],
      { provider: "anthropic", apiKey: "sk-test" },
      progress,
    );

    expect(progress.onBatchFindings).toHaveBeenCalledWith(mockAgentResult.findings);
  });

  it("returns llmCompleted=false when agent throws", async () => {
    (runAgenticAnalysis as any).mockRejectedValue(new Error("Agent timeout"));

    const result = await runLLMAnalysis(
      "/test.log",
      [],
      { provider: "anthropic", apiKey: "sk-test" },
    );

    expect(result.llmAvailable).toBe(true);
    expect(result.llmCompleted).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("does not call onBatchFindings when agent returns no findings", async () => {
    (runAgenticAnalysis as any).mockResolvedValue({
      findings: [],
      summary: "",
      falsePositiveLineNumbers: [],
    });

    const progress: LLMProgressCallback = {
      onBatchFindings: vi.fn().mockResolvedValue(undefined),
    };

    await runLLMAnalysis(
      "/test.log",
      [],
      { provider: "openai", apiKey: "sk-test" },
      progress,
    );

    expect(progress.onBatchFindings).not.toHaveBeenCalled();
  });
});

describe("resumeLLMAnalysis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes to resumeAgenticAnalysis", async () => {
    (resumeAgenticAnalysis as any).mockResolvedValue(mockAgentResult);

    await resumeLLMAnalysis(
      "/test.log",
      [],
      { provider: "anthropic", apiKey: "sk-test" },
      undefined,
      "plain",
      "ar-456",
    );

    expect(resumeAgenticAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        analysisResultId: "ar-456",
      }),
    );
  });

  it("falls back to fresh runLLMAnalysis when resume fails", async () => {
    (resumeAgenticAnalysis as any).mockRejectedValue(new Error("Session not found"));
    (runAgenticAnalysis as any).mockResolvedValue(mockAgentResult);

    const result = await resumeLLMAnalysis(
      "/test.log",
      [],
      { provider: "anthropic", apiKey: "sk-test" },
      undefined,
      "plain",
      "ar-456",
    );

    // Should have fallen back to fresh analysis
    expect(runAgenticAnalysis).toHaveBeenCalled();
    expect(result.llmCompleted).toBe(true);
  });
});
