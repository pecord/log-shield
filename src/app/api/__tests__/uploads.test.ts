import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/storage", () => ({
  getStorageProviderForUser: () => ({
    write: vi.fn().mockResolvedValue(undefined),
    writeStream: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/lib/user-settings", () => ({
  resolveUserSettings: vi.fn().mockResolvedValue({
    llmApiKey: null,
    llmProvider: null,
    s3Config: null,
  }),
}));

import { auth } from "@/lib/auth";
import { POST, GET } from "../../api/uploads/route";
import { NextRequest } from "next/server";

// ── Helpers ──────────────────────────────────────────────
function makeRequest(method: string, body?: FormData | undefined) {
  const init: Record<string, unknown> = { method };
  if (body) init.body = body;
  return new NextRequest("http://localhost:3000/api/uploads", init as any);
}

function makeLogFile(name: string, content = "line1\nline2\n") {
  return new File([content], name, { type: "text/plain" });
}

// ── Tests ────────────────────────────────────────────────
describe("POST /api/uploads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when no file is provided", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const form = new FormData();
    const res = await POST(makeRequest("POST", form));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("No file");
  });

  it("returns 400 for invalid file extension", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const form = new FormData();
    form.append("file", makeLogFile("malware.exe"));

    const res = await POST(makeRequest("POST", form));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Invalid file type");
    // Verify the error now mentions all valid extensions
    expect(body.error).toContain(".csv");
    expect(body.error).toContain(".jsonl");
  });

  it("accepts .csv files", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.create as any).mockResolvedValue({
      id: "upload-1",
      fileName: "data.csv",
      fileSize: 100,
      status: "PENDING",
    });

    const form = new FormData();
    form.append("file", makeLogFile("data.csv", "col1,col2\nval1,val2\n"));

    const res = await POST(makeRequest("POST", form));
    expect(res.status).toBe(201);
  });
});

describe("GET /api/uploads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/uploads");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns paginated uploads for authenticated user", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const { prisma } = await import("@/lib/prisma");
    (prisma.upload.findMany as any).mockResolvedValue([
      { id: "u1", fileName: "test.log", status: "COMPLETED" },
    ]);
    (prisma.upload.count as any).mockResolvedValue(1);

    const req = new NextRequest("http://localhost:3000/api/uploads?limit=10&page=1");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.uploads).toHaveLength(1);
  });
});
