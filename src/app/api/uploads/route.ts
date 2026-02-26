import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateFileExtension, sanitizeFileName } from "@/lib/validations/upload";
import { MAX_FILE_SIZE, MAX_PAGE_SIZE, ALLOWED_EXTENSIONS } from "@/lib/constants";
import { getStorageProviderForUser } from "@/lib/storage";
import { resolveUserSettings } from "@/lib/user-settings";
import { createRateLimiter } from "@/lib/rate-limit";
import { join } from "path";
import { Readable, Transform } from "stream";
import crypto from "crypto";

const uploadLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed, retryAfterMs } = uploadLimiter.check(`upload:${session.user.id}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!validateFileExtension(file.name)) {
      return NextResponse.json(
        { error: `Invalid file type. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 413 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "File is empty." },
        { status: 400 }
      );
    }

    const uniqueId = crypto.randomUUID().slice(0, 8);
    const safeName = sanitizeFileName(file.name);
    const storageName = `${uniqueId}_${safeName}`;
    const storagePath = join("uploads", session.user.id, storageName);

    const userSettings = await resolveUserSettings(session.user.id);
    const storage = getStorageProviderForUser(userSettings.s3Config);

    // Stream the file to storage while counting newlines in a single pass.
    // The Transform passes bytes through to storage untouched, counting
    // 0x0A bytes as they flow — no full-file buffer needed.
    let lineCount = 1;
    const LF = 0x0a;
    const lineCounter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] === LF) lineCount++;
        }
        callback(null, chunk);
      },
    });

    const nodeStream = Readable.fromWeb(file.stream() as import("stream/web").ReadableStream);
    await storage.writeStream(storagePath, nodeStream.pipe(lineCounter));

    const upload = await prisma.upload.create({
      data: {
        userId: session.user.id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "text/plain",
        storagePath,
        storageType: userSettings.s3Config ? "s3" : "local",
        lineCount,
        status: "PENDING",
      },
    });

    return NextResponse.json(upload, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("limit") || "20") || 20));
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {
    userId: session.user.id,
  };
  if (status) {
    where.status = status;
  }
  if (search) {
    where.fileName = { contains: search, mode: "insensitive" };
  }

  const [uploads, total] = await Promise.all([
    prisma.upload.findMany({
      where,
      include: {
        analysisResult: {
          select: {
            id: true,
            status: true,
            totalFindings: true,
            criticalCount: true,
            highCount: true,
            mediumCount: true,
            lowCount: true,
            infoCount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.upload.count({ where }),
  ]);

  return NextResponse.json({
    uploads,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
