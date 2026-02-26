import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((val: string) => `encrypted_${val}`),
  maskApiKey: vi.fn((val: string) => `${val.slice(0, 3)}...${val.slice(-3)}`),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET, PUT } from "../settings/route";
import { NextRequest } from "next/server";

// ── Helpers ──────────────────────────────────────────────
function makeRequest(method: string, body?: object) {
  const init: Record<string, unknown> = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest("http://localhost:3000/api/settings", init as any);
}

// ── Tests ────────────────────────────────────────────────
describe("GET /api/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns empty defaults when no settings exist", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });
    (prisma.userSettings.findUnique as any).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.llm.provider).toBeNull();
    expect(body.llm.apiKeyHint).toBeNull();
    expect(body.s3.endpoint).toBeNull();
    expect(body.s3.bucket).toBeNull();
  });

  it("returns masked hints, never encrypted values", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });
    (prisma.userSettings.findUnique as any).mockResolvedValue({
      llmProvider: "anthropic",
      llmApiKeyEncrypted: "encrypted_sk-test-key",
      llmApiKeyHint: "sk-...key",
      s3Endpoint: "https://s3.amazonaws.com",
      s3Region: "us-east-1",
      s3Bucket: "my-bucket",
      s3AccessKeyEncrypted: "encrypted_AKIAIOSFODNN7",
      s3AccessKeyHint: "AKI...NN7",
      s3SecretKeyEncrypted: "encrypted_wJalrXUtnFEMI",
      s3SecretKeyHint: "wJa...EMI",
      s3PathPrefix: "logs/",
      s3ForcePathStyle: true,
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    const raw = JSON.stringify(body);

    // Hints are present (nested)
    expect(body.llm.apiKeyHint).toBe("sk-...key");
    expect(body.s3.accessKeyHint).toBe("AKI...NN7");
    expect(body.s3.secretKeyHint).toBe("wJa...EMI");

    // Plain-text settings are present (nested)
    expect(body.llm.provider).toBe("anthropic");
    expect(body.s3.endpoint).toBe("https://s3.amazonaws.com");
    expect(body.s3.region).toBe("us-east-1");
    expect(body.s3.bucket).toBe("my-bucket");
    expect(body.s3.pathPrefix).toBe("logs/");
    expect(body.s3.forcePathStyle).toBe(true);

    // Encrypted blobs are NEVER exposed
    expect(raw).not.toContain("Encrypted");
  });
});

describe("PUT /api/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (auth as any).mockResolvedValue(null);

    const res = await PUT(makeRequest("PUT", { llm: { provider: "anthropic" } }));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 422 for invalid body", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });

    const res = await PUT(makeRequest("PUT", { llm: { provider: "invalid" } }));
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.issues).toBeDefined();
  });

  it("upserts LLM settings", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });
    (prisma.userSettings.upsert as any).mockResolvedValue({
      llmProvider: "anthropic",
      llmApiKeyHint: "sk-...key",
      s3Endpoint: null,
      s3Region: null,
      s3Bucket: null,
      s3AccessKeyHint: null,
      s3SecretKeyHint: null,
      s3PathPrefix: null,
      s3ForcePathStyle: false,
    });

    const res = await PUT(
      makeRequest("PUT", { llm: { provider: "anthropic", apiKey: "sk-test-key" } }),
    );
    expect(res.status).toBe(200);

    const call = (prisma.userSettings.upsert as any).mock.calls[0][0];
    expect(call.update.llmProvider).toBe("anthropic");
    expect(call.update.llmApiKeyEncrypted).toBe("encrypted_sk-test-key");
    expect(call.update.llmApiKeyHint).toBe("sk-...key");
    expect(call.create.userId).toBe("user-1");
  });

  it("upserts S3 settings", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });
    (prisma.userSettings.upsert as any).mockResolvedValue({
      llmProvider: null,
      llmApiKeyHint: null,
      s3Endpoint: "https://s3.amazonaws.com",
      s3Region: "us-east-1",
      s3Bucket: "my-bucket",
      s3AccessKeyHint: "AKI...NN7",
      s3SecretKeyHint: "wJa...EMI",
      s3PathPrefix: "logs/",
      s3ForcePathStyle: true,
    });

    const res = await PUT(
      makeRequest("PUT", {
        s3: {
          endpoint: "https://s3.amazonaws.com",
          region: "us-east-1",
          bucket: "my-bucket",
          accessKey: "AKIAIOSFODNN7",
          secretKey: "wJalrXUtnFEMI",
          pathPrefix: "logs/",
          forcePathStyle: true,
        },
      }),
    );
    expect(res.status).toBe(200);

    const call = (prisma.userSettings.upsert as any).mock.calls[0][0];
    expect(call.update.s3Endpoint).toBe("https://s3.amazonaws.com");
    expect(call.update.s3Region).toBe("us-east-1");
    expect(call.update.s3Bucket).toBe("my-bucket");
    expect(call.update.s3AccessKeyEncrypted).toBe("encrypted_AKIAIOSFODNN7");
    expect(call.update.s3AccessKeyHint).toBe("AKI...NN7");
    expect(call.update.s3SecretKeyEncrypted).toBe("encrypted_wJalrXUtnFEMI");
    expect(call.update.s3SecretKeyHint).toBe("wJa...EMI");
    expect(call.update.s3PathPrefix).toBe("logs/");
    expect(call.update.s3ForcePathStyle).toBe(true);
  });

  it("preserves existing keys when not provided", async () => {
    (auth as any).mockResolvedValue({ user: { id: "user-1" } });
    (prisma.userSettings.upsert as any).mockResolvedValue({
      llmProvider: "openai",
      llmApiKeyHint: "sk-...key",
      s3Endpoint: null,
      s3Region: null,
      s3Bucket: null,
      s3AccessKeyHint: null,
      s3SecretKeyHint: null,
      s3PathPrefix: null,
      s3ForcePathStyle: false,
    });

    const res = await PUT(makeRequest("PUT", { llm: { provider: "openai" } }));
    expect(res.status).toBe(200);

    const call = (prisma.userSettings.upsert as any).mock.calls[0][0];
    expect(call.update.llmProvider).toBe("openai");
    // Key fields should NOT be present in the update payload
    expect(call.update).not.toHaveProperty("llmApiKeyEncrypted");
    expect(call.update).not.toHaveProperty("llmApiKeyHint");
  });
});
