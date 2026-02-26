import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: { findMany: vi.fn(), updateMany: vi.fn() },
    analysisResult: { delete: vi.fn() },
  },
}));

vi.mock("@/analysis/pipeline", () => ({
  runAnalysisPipeline: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/lib/auth";
import { POST } from "../uploads/reanalyze-all/route";

// ── Tests ────────────────────────────────────────────────
describe("POST /api/uploads/reanalyze-all", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 when no completed uploads exist", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findMany as any).mockResolvedValue([]);

    const res = await POST();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.message).toContain("No completed uploads");
  });

  it("returns 202 and starts reanalysis for completed uploads", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findMany as any).mockResolvedValue([
      { id: "u1", analysisResult: { id: "ar-1" } },
    ]);
    (prisma.upload.updateMany as any).mockResolvedValue({ count: 1 });

    const res = await POST();
    expect(res.status).toBe(202);

    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.message).toContain("Re-analysis started");
  });
});
