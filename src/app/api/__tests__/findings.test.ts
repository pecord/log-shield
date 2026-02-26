import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    finding: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { GET } from "../findings/route";
import { NextRequest } from "next/server";

// ── Tests ────────────────────────────────────────────────
describe("GET /api/findings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/findings");
    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 200 with paginated findings", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.finding.findMany as any).mockResolvedValue([
      {
        id: "f-1",
        severity: "HIGH",
        category: "XSS",
        title: "XSS detected",
        description: "Reflected XSS",
        lineNumber: 42,
        lineContent: "<script>alert(1)</script>",
        matchedPattern: "<script>",
        source: "RULE_BASED",
        fingerprint: "abc123",
        recommendation: "Sanitize input",
        confidence: 0.9,
        mitreTactic: "Initial Access",
        mitreTechnique: "T1189",
        createdAt: new Date("2024-01-01").toISOString(),
        analysisResult: { upload: { id: "u1", fileName: "test.log" } },
      },
    ]);
    (prisma.finding.count as any).mockResolvedValue(1);

    const req = new NextRequest("http://localhost:3000/api/findings?page=1&limit=25");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].uploadFileName).toBe("test.log");
    expect(body.findings[0].uploadId).toBe("u1");
    expect(body.pagination.total).toBe(1);
    expect(body.pagination.page).toBe(1);
  });

  it("returns 200 with severity filter applied", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.finding.findMany as any).mockResolvedValue([]);
    (prisma.finding.count as any).mockResolvedValue(0);

    const req = new NextRequest("http://localhost:3000/api/findings?severity=CRITICAL");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.findings).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });
});
