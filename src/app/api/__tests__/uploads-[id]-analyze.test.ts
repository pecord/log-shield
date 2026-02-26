import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: { findUnique: vi.fn() },
    analysisResult: { delete: vi.fn() },
  },
}));

let mockRateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockImplementation(() =>
      mockRateLimitAllowed
        ? { allowed: true, remaining: 4, retryAfterMs: 0 }
        : { allowed: false, remaining: 0, retryAfterMs: 5000 }
    ),
  }),
}));

vi.mock("@/analysis/pipeline", () => ({
  runAnalysisPipeline: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/lib/auth";
import { POST } from "../uploads/[id]/analyze/route";
import { NextRequest } from "next/server";

// ── Helpers ──────────────────────────────────────────────
function makeRequest(reanalyze = false) {
  const url = reanalyze
    ? "http://localhost:3000/api/uploads/upload-1/analyze?reanalyze=true"
    : "http://localhost:3000/api/uploads/upload-1/analyze";
  return new NextRequest(url, { method: "POST" });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Tests ────────────────────────────────────────────────
describe("POST /api/uploads/[id]/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitAllowed = true;
  });

  afterEach(() => {
    mockRateLimitAllowed = true;
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams("upload-1"));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });
    mockRateLimitAllowed = false;

    const res = await POST(makeRequest(), makeParams("upload-1"));
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toContain("Too many");
  });

  it("returns 404 when upload not found", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams("upload-1"));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Upload not found");
  });

  it("returns 403 when user does not own the upload", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue({
      id: "upload-1",
      userId: "other-user",
      status: "PENDING",
      analysisResult: null,
    });

    const res = await POST(makeRequest(), makeParams("upload-1"));
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 409 when analysis already in progress", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue({
      id: "upload-1",
      userId: "user-1",
      status: "ANALYZING",
    });

    const res = await POST(makeRequest(), makeParams("upload-1"));
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toContain("already in progress");
  });

  it("returns 200 when analysis already completed and no reanalyze flag", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue({
      id: "upload-1",
      userId: "user-1",
      status: "COMPLETED",
      analysisResult: { id: "ar-1", status: "COMPLETED" },
    });

    const res = await POST(makeRequest(false), makeParams("upload-1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.analysisResultId).toBe("ar-1");
    expect(body.message).toContain("already completed");
  });

  it("returns 202 and starts analysis for pending upload", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue({
      id: "upload-1",
      userId: "user-1",
      status: "PENDING",
      analysisResult: null,
    });

    const res = await POST(makeRequest(), makeParams("upload-1"));
    expect(res.status).toBe(202);

    const body = await res.json();
    expect(body.message).toContain("Analysis started");
  });
});
