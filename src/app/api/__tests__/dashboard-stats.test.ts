import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: { count: vi.fn(), findMany: vi.fn() },
    analysisResult: { findMany: vi.fn() },
    finding: { groupBy: vi.fn(), findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { GET } from "../dashboard/stats/route";

// ── Tests ────────────────────────────────────────────────
describe("GET /api/dashboard/stats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 with empty stats", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.count as any).mockResolvedValue(0);
    // upload.findMany is called twice: once for uploads (select: { id }), once for recentUploads
    (prisma.upload.findMany as any).mockResolvedValue([]);
    (prisma.analysisResult.findMany as any).mockResolvedValue([]);
    (prisma.finding.groupBy as any).mockResolvedValue([]);
    (prisma.finding.findMany as any).mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalUploads).toBe(0);
    expect(body.totalFindings).toBe(0);
    expect(body.severityDistribution).toHaveLength(5);
    expect(body.categoryDistribution).toHaveLength(0);
    expect(body.recentUploads).toHaveLength(0);
    expect(body.timeline).toHaveLength(0);
  });

  it("returns 200 with populated stats", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.count as any).mockResolvedValue(1);
    (prisma.upload.findMany as any).mockResolvedValue([
      { id: "u1" },
    ]);
    (prisma.analysisResult.findMany as any).mockResolvedValue([
      {
        totalFindings: 5,
        criticalCount: 2,
        highCount: 1,
        mediumCount: 1,
        lowCount: 1,
        infoCount: 0,
      },
    ]);
    (prisma.finding.groupBy as any).mockResolvedValue([
      { category: "SQL_INJECTION", _count: { id: 3 } },
    ]);
    (prisma.finding.findMany as any).mockResolvedValue([
      {
        severity: "CRITICAL",
        eventTimestamp: new Date("2024-01-01"),
        analysisResult: { upload: { createdAt: new Date("2024-01-01") } },
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalUploads).toBe(1);
    expect(body.totalFindings).toBe(5);
    expect(body.severityDistribution[0].count).toBe(2); // CRITICAL
    expect(body.categoryDistribution).toHaveLength(1);
    expect(body.timeline).toHaveLength(1);
  });
});
