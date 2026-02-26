import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, maskApiKey } from "@/lib/encryption";
import { getS3ConfigFromEnv } from "@/lib/user-settings";
import { z } from "zod/v4";

/** Fields safe to return to the client (never return encrypted blobs). */
function safeShape(settings: Record<string, unknown> | null) {
  return {
    llm: {
      provider: settings?.llmProvider ?? null,
      apiKeyHint: settings?.llmApiKeyHint ?? null,
      hasEnvFallback: !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY),
    },
    s3: {
      endpoint: settings?.s3Endpoint ?? null,
      region: settings?.s3Region ?? null,
      bucket: settings?.s3Bucket ?? null,
      accessKeyHint: settings?.s3AccessKeyHint ?? null,
      secretKeyHint: settings?.s3SecretKeyHint ?? null,
      pathPrefix: settings?.s3PathPrefix ?? null,
      forcePathStyle: settings?.s3ForcePathStyle ?? false,
      hasEnvFallback: !!getS3ConfigFromEnv(),
    },
  };
}

// ---------------------------------------------------------------------------
// GET  /api/settings
// ---------------------------------------------------------------------------
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(safeShape(settings as Record<string, unknown> | null));
}

// ---------------------------------------------------------------------------
// PUT  /api/settings
// ---------------------------------------------------------------------------
const putSchema = z.object({
  llm: z.object({
    provider: z.enum(["anthropic", "openai"]).nullable().optional(),
    apiKey: z.string().min(1).optional(),
  }).optional(),
  s3: z.object({
    endpoint: z.string().url().nullable().optional(),
    region: z.string().max(50).nullable().optional(),
    bucket: z.string().max(255).nullable().optional(),
    accessKey: z.string().min(1).optional(),
    secretKey: z.string().min(1).optional(),
    pathPrefix: z.string().max(500).nullable().optional(),
    forcePathStyle: z.boolean().optional(),
  }).optional(),
});

export async function PUT(request: NextRequest) {
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

  const result = z.safeParse(putSchema, body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 422 },
    );
  }

  const { llm, s3 } = result.data;

  // Build the update payload — only include fields that were sent.
  const update: Record<string, unknown> = {};

  if (llm?.provider !== undefined) update.llmProvider = llm.provider;
  if (s3?.endpoint !== undefined) update.s3Endpoint = s3.endpoint;
  if (s3?.region !== undefined) update.s3Region = s3.region;
  if (s3?.bucket !== undefined) update.s3Bucket = s3.bucket;
  if (s3?.pathPrefix !== undefined) update.s3PathPrefix = s3.pathPrefix;
  if (s3?.forcePathStyle !== undefined) update.s3ForcePathStyle = s3.forcePathStyle;

  // Write-only key fields: encrypt + store hint
  if (llm?.apiKey !== undefined) {
    update.llmApiKeyEncrypted = encrypt(llm.apiKey);
    update.llmApiKeyHint = maskApiKey(llm.apiKey);
  }
  if (s3?.accessKey !== undefined) {
    update.s3AccessKeyEncrypted = encrypt(s3.accessKey);
    update.s3AccessKeyHint = maskApiKey(s3.accessKey);
  }
  if (s3?.secretKey !== undefined) {
    update.s3SecretKeyEncrypted = encrypt(s3.secretKey);
    update.s3SecretKeyHint = maskApiKey(s3.secretKey);
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...update },
    update,
  });

  return NextResponse.json(safeShape(settings as unknown as Record<string, unknown>));
}
