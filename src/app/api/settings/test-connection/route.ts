import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLLMClient, type LLMOverride } from "@/analysis/llm/client";
import { S3StorageProvider } from "@/lib/storage-s3";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Validation schemas — discriminated union on `type`
// ---------------------------------------------------------------------------
const llmSchema = z.object({
  type: z.literal("llm"),
  provider: z.enum(["anthropic", "openai"]),
  apiKey: z.string().min(1),
});

const s3Schema = z.object({
  type: z.literal("s3"),
  endpoint: z.string().url(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKey: z.string().min(1),
  secretKey: z.string().min(1),
  forcePathStyle: z.boolean().optional(),
});

const testConnectionSchema = z.discriminatedUnion("type", [llmSchema, s3Schema]);

// ---------------------------------------------------------------------------
// POST  /api/settings/test-connection
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = z.safeParse(testConnectionSchema, body);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join(".")).join(", ");
    return NextResponse.json(
      { error: `Missing or invalid fields: ${missing || "check your input"}` },
      { status: 422 },
    );
  }

  const data = result.data;

  try {
    if (data.type === "llm") {
      const override: LLMOverride = { provider: data.provider, apiKey: data.apiKey };
      const client = createLLMClient(override);
      await client.analyze("Reply with OK", "Test");
    } else {
      const provider = new S3StorageProvider({
        endpoint: data.endpoint,
        region: data.region,
        bucket: data.bucket,
        accessKeyId: data.accessKey,
        secretAccessKey: data.secretKey,
        forcePathStyle: data.forcePathStyle,
      });
      await provider.testConnection();
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // Sanitize error messages to avoid leaking infrastructure details
    // (internal IPs, bucket names, credential hints, etc.)
    let message = "Connection test failed";
    if (err instanceof Error) {
      const raw = err.message;
      if (/invalid.*api.key|unauthorized|authentication/i.test(raw)) {
        message = "Invalid API key";
      } else if (/timeout|ETIMEDOUT|ECONNREFUSED/i.test(raw)) {
        message = "Connection timed out — check your endpoint URL";
      } else if (/no.such.bucket|bucket.*not.*found/i.test(raw)) {
        message = "Bucket not found — check your bucket name";
      } else if (/access.denied|forbidden/i.test(raw)) {
        message = "Access denied — check your credentials and permissions";
      } else if (/ENOTFOUND|getaddrinfo/i.test(raw)) {
        message = "Endpoint not reachable — check the URL";
      } else if (/rate.limit|too.many.requests/i.test(raw)) {
        message = "Rate limited — try again in a moment";
      }
    }
    return NextResponse.json({ success: false, error: message }, { status: 422 });
  }
}
