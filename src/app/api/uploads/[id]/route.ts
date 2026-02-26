import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserSettings } from "@/lib/user-settings";
import { getStorageProviderForUser } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const upload = await prisma.upload.findUnique({
    where: { id },
    include: {
      analysisResult: {
        select: {
          id: true,
          status: true,
          totalLinesAnalyzed: true,
          totalFindings: true,
          criticalCount: true,
          highCount: true,
          mediumCount: true,
          lowCount: true,
          infoCount: true,
          ruleBasedCompleted: true,
          llmCompleted: true,
          llmAvailable: true,
          overallSummary: true,
          analysisStartedAt: true,
          analysisEndedAt: true,
          errorMessage: true,
          skippedLineCount: true,
          logFormat: true,
          createdAt: true,
        },
      },
    },
  });

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(upload);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const upload = await prisma.upload.findUnique({ where: { id } });

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete file from storage
  try {
    const userSettings = await resolveUserSettings(upload.userId);
    const storage = getStorageProviderForUser(userSettings.s3Config);
    await storage.delete(upload.storagePath);
  } catch {
    // File may already be deleted, continue
  }

  // Cascade deletes analysis result and findings
  await prisma.upload.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
