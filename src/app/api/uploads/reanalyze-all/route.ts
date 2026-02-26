import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAnalysisPipeline } from "@/analysis/pipeline";

/**
 * POST /api/uploads/reanalyze-all
 *
 * Re-analyzes all completed uploads for the current user.
 * Processes uploads sequentially (one at a time) to avoid overwhelming
 * the server and LLM API. Deletes each upload's old analysis right
 * before re-processing it, so if the process is interrupted only the
 * current upload loses its findings.
 *
 * Returns 202 immediately; analysis runs in the background.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Find all completed uploads (skip any currently analyzing)
  const uploads = await prisma.upload.findMany({
    where: {
      userId,
      status: "COMPLETED",
    },
    include: {
      analysisResult: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (uploads.length === 0) {
    return NextResponse.json(
      { message: "No completed uploads to re-analyze", total: 0 },
      { status: 200 }
    );
  }

  // Mark all eligible uploads as PENDING so the UI reflects queued state
  await prisma.upload.updateMany({
    where: {
      id: { in: uploads.map((u) => u.id) },
    },
    data: { status: "PENDING" },
  });

  // Fire-and-forget: process uploads sequentially in the background
  const uploadIds = uploads.map((u) => ({ id: u.id, analysisResultId: u.analysisResult?.id }));

  (async () => {
    let completed = 0;
    let failed = 0;

    for (const upload of uploadIds) {
      try {
        // Delete old analysis result (cascade deletes findings) right before re-analyzing
        if (upload.analysisResultId) {
          await prisma.analysisResult.delete({
            where: { id: upload.analysisResultId },
          });
        }

        // Pipeline handles PENDING → ANALYZING → COMPLETED/FAILED transitions
        await runAnalysisPipeline(upload.id);
        completed++;
      } catch (err) {
        failed++;
        console.error(
          `[ReanalyzeAll] Failed for upload ${upload.id}:`,
          err instanceof Error ? err.message : err
        );
        // Continue to next — one failure doesn't block the rest
      }
    }

    console.log(
      `[ReanalyzeAll] Finished: ${completed} completed, ${failed} failed out of ${uploadIds.length} total`
    );
  })().catch((err) =>
    console.error("[ReanalyzeAll] Unexpected batch error:", err)
  );

  return NextResponse.json(
    {
      message: `Re-analysis started for ${uploads.length} uploads`,
      total: uploads.length,
    },
    { status: 202 }
  );
}
