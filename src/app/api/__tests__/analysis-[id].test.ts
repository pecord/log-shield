import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analysisResult: { findUnique: vi.fn() },
    finding: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { GET } from "../analysis/[id]/route";
import { NextRequest } from "next/server";

// ── Helpers ──────────────────────────────────────────────
function makeRequest(id: string) {
  return new NextRequest(`http://localhost:3000/api/analysis/${id}`, { method: "GET" });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Tests ────────────────────────────────────────────────
describe("GET /api/analysis/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await GET(makeRequest("ar-1"), makeParams("ar-1"));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when analysis result not found", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.analysisResult.findUnique as any).mockResolvedValue(null);

    const res = await GET(makeRequest("ar-1"), makeParams("ar-1"));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Analysis not found");
  });

  it("returns 403 when user does not own the analysis", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.analysisResult.findUnique as any).mockResolvedValue({
      id: "ar-1",
      upload: { userId: "other-user", fileName: "test.log" },
    });

    const res = await GET(makeRequest("ar-1"), makeParams("ar-1"));
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with analysis and findings", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.analysisResult.findUnique as any).mockResolvedValue({
      id: "ar-1",
      status: "COMPLETED",
      totalLinesAnalyzed: 100,
      totalFindings: 3,
      criticalCount: 1,
      highCount: 1,
      mediumCount: 1,
      lowCount: 0,
      infoCount: 0,
      ruleBasedCompleted: true,
      llmCompleted: false,
      llmAvailable: false,
      overallSummary: "Test summary",
      analysisStartedAt: new Date("2024-01-01").toISOString(),
      analysisEndedAt: new Date("2024-01-01").toISOString(),
      errorMessage: null,
      upload: { userId: "user-1", fileName: "test.log" },
    });

    (prisma.finding.findMany as any).mockResolvedValue([
      {
        id: "f-1",
        severity: "CRITICAL",
        category: "SQL_INJECTION",
        title: "SQL Injection detected",
        lineNumber: 10,
      },
    ]);
    (prisma.finding.count as any).mockResolvedValue(1);
    (prisma.finding.groupBy as any).mockResolvedValue([
      { category: "SQL_INJECTION", _count: 1 },
    ]);

    const res = await GET(makeRequest("ar-1"), makeParams("ar-1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("ar-1");
    expect(body.findings).toHaveLength(1);
    expect(body.fileName).toBe("test.log");
    expect(body.pagination.total).toBe(1);
    expect(body.categoryBreakdown).toHaveLength(1);
  });
});
