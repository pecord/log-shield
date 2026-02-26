/**
 * Next.js Instrumentation — runs once on server startup.
 *
 * Two recovery mechanisms:
 * 1. **Startup recovery**: immediately resumes uploads stuck in ANALYZING
 *    (interrupted by a deploy or process crash).
 * 2. **Stall detector**: periodic interval that catches analyses that silently
 *    hang during normal operation (e.g., agent timeout, network partition).
 *    Uploads stuck in ANALYZING for longer than STALL_THRESHOLD_MS are resumed.
 */

const STALL_CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
const STALL_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes = stalled

export async function register() {
  // Only run on the Node.js server, not in Edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await recoverStuckAnalyses();
    startStallDetector();
  }
}

async function recoverStuckAnalyses() {
  try {
    const { prisma } = await import("@/lib/prisma");
    const { resumeAnalysisPipeline } = await import("@/analysis/pipeline");

    const stuckUploads = await prisma.upload.findMany({
      where: { status: "ANALYZING" },
      include: {
        analysisResult: {
          select: {
            ruleBasedCompleted: true,
          },
        },
      },
    });

    if (stuckUploads.length === 0) return;

    console.log(
      `[Recovery] Found ${stuckUploads.length} stuck upload(s), resuming...`
    );

    for (const upload of stuckUploads) {
      console.log(`[Recovery] Resuming "${upload.fileName}"`);
      resumeAnalysisPipeline(upload.id).catch((err) => {
        console.error(`[Recovery] Failed to resume ${upload.id}:`, err);
      });
    }
  } catch (error) {
    console.error("[Recovery] Failed to recover stuck analyses:", error);
  }
}

function startStallDetector() {
  setInterval(async () => {
    try {
      const { prisma } = await import("@/lib/prisma");
      const { resumeAnalysisPipeline } = await import("@/analysis/pipeline");

      const stalledUploads = await prisma.upload.findMany({
        where: {
          status: "ANALYZING",
          updatedAt: { lt: new Date(Date.now() - STALL_THRESHOLD_MS) },
        },
      });

      if (stalledUploads.length === 0) return;

      console.log(
        `[StallDetector] Found ${stalledUploads.length} stalled upload(s)`
      );

      for (const upload of stalledUploads) {
        console.log(
          `[StallDetector] Resuming stalled "${upload.fileName}" (stuck since ${upload.updatedAt.toISOString()})`
        );
        resumeAnalysisPipeline(upload.id).catch((err) => {
          console.error(`[StallDetector] Failed to resume ${upload.id}:`, err);
        });
      }
    } catch (error) {
      console.error("[StallDetector] Check failed:", error);
    }
  }, STALL_CHECK_INTERVAL_MS);
}
