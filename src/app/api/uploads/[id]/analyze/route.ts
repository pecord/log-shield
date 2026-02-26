import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAnalysisPipeline } from "@/analysis/pipeline";
import { createRateLimiter } from "@/lib/rate-limit";

const analyzeLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { allowed, retryAfterMs } = analyzeLimiter.check(`analyze:${session.user.id}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many analysis requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
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

  // Fire and forget - pipeline runs in background.
  // TODO: In serverless environments (Vercel, Lambda), this fire-and-forget pattern
  // will be killed when the response is sent. Migrate to one of:
  //   - Next.js after() API (next@15+): import { after } from 'next/server'; after(() => runAnalysisPipeline(id))
  //   - A background job queue (BullMQ, Inngest, Trigger.dev)
  //   - Vercel Functions with maxDuration + streaming response
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
