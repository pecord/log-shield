import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("fs/promises", () => ({ unlink: vi.fn().mockResolvedValue(undefined) }));

import { auth } from "@/lib/auth";
import { GET, DELETE } from "../uploads/[id]/route";
import { NextRequest } from "next/server";

// ── Helpers ──────────────────────────────────────────────
function makeRequest(method: string) {
  return new NextRequest("http://localhost:3000/api/uploads/upload-1", { method });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── GET Tests ────────────────────────────────────────────
describe("GET /api/uploads/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), makeParams("upload-1"));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when upload not found", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue(null);

    const res = await GET(makeRequest("GET"), makeParams("upload-1"));
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Upload not found");
  });

  it("returns 403 when user does not own the upload", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue({ userId: "other-user" });

    const res = await GET(makeRequest("GET"), makeParams("upload-1"));
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with upload and analysisResult", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue({
      id: "upload-1",
      userId: "user-1",
      analysisResult: { id: "ar-1", status: "COMPLETED", totalFindings: 5 },
    });

    const res = await GET(makeRequest("GET"), makeParams("upload-1"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe("upload-1");
    expect(body.analysisResult.id).toBe("ar-1");
  });
});

// ── DELETE Tests ─────────────────────────────────────────
describe("DELETE /api/uploads/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await DELETE(makeRequest("DELETE"), makeParams("upload-1"));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when upload not found", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue(null);

    const res = await DELETE(makeRequest("DELETE"), makeParams("upload-1"));
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
      storagePath: "uploads/test.log",
    });

    const res = await DELETE(makeRequest("DELETE"), makeParams("upload-1"));
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 204 and deletes the upload", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findUnique as any).mockResolvedValue({
      id: "upload-1",
      userId: "user-1",
      storagePath: "uploads/test.log",
    });
    (prisma.upload.delete as any).mockResolvedValue(undefined);

    const res = await DELETE(makeRequest("DELETE"), makeParams("upload-1"));
    expect(res.status).toBe(204);
    expect(prisma.upload.delete).toHaveBeenCalledWith({ where: { id: "upload-1" } });
  });
});
