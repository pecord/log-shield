import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAnalysisPipeline } from "@/analysis/pipeline";

export async function POST(
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
    include: { analysisResult: { select: { id: true, status: true } } },
  });

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (upload.status === "ANALYZING") {
    return NextResponse.json(
      { error: "Analysis already in progress" },
      { status: 409 }
    );
  }

  // Check if re-analysis was explicitly requested
  const url = new URL(request.url);
  const reanalyze = url.searchParams.get("reanalyze") === "true";

  if (upload.status === "COMPLETED" && upload.analysisResult && !reanalyze) {
    return NextResponse.json(
      {
        analysisResultId: upload.analysisResult.id,
        status: upload.analysisResult.status,
        message: "Analysis already completed",
      },
      { status: 200 }
    );
  }

  // Delete previous analysis result if exists (for re-analysis or failed runs)
  if (upload.analysisResult) {
    await prisma.analysisResult.delete({
      where: { id: upload.analysisResult.id },
    });
  }

  // Fire and forget - pipeline runs in background
  runAnalysisPipeline(id).catch((err) =>
    console.error("[Analyze] Pipeline error:", err)
  );

  return NextResponse.json(
    {
      message: "Analysis started",
      status: "IN_PROGRESS",
    },
    { status: 202 }
  );
}
