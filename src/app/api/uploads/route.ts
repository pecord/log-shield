import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateFileExtension, sanitizeFileName } from "@/lib/validations/upload";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!validateFileExtension(file.name)) {
      return NextResponse.json(
        { error: "Invalid file type. Only .txt and .log files are accepted." },
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const lineCount = buffer.toString("utf-8").split("\n").length;

    const uniqueId = crypto.randomUUID().slice(0, 8);
    const safeName = sanitizeFileName(file.name);
    const storageName = `${uniqueId}_${safeName}`;
    const userDir = join(process.cwd(), "uploads", session.user.id);
    const storagePath = join("uploads", session.user.id, storageName);

    await mkdir(userDir, { recursive: true });
    await writeFile(join(process.cwd(), storagePath), buffer);

    const upload = await prisma.upload.create({
      data: {
        userId: session.user.id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "text/plain",
        storagePath,
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
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const status = searchParams.get("status");

  const where = {
    userId: session.user.id,
    ...(status ? { status: status as "PENDING" | "ANALYZING" | "COMPLETED" | "FAILED" } : {}),
  };

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
