import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analysisEvents } from "@/lib/analysis-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same select used by GET /api/uploads/[id] */
const analysisResultSelect = {
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
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;

  const upload = await prisma.upload.findUnique({
    where: { id },
    include: { analysisResult: { select: analysisResultSelect } },
  });

  if (!upload) {
    return new Response(JSON.stringify({ error: "Upload not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (upload.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isDone =
    upload.status === "COMPLETED" || upload.status === "FAILED";

  // Already finished — send one event and close
  if (isDone) {
    const body = `event: update\ndata: ${JSON.stringify(upload)}\n\n`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Stream ongoing progress
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: update\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream already closed
        }
      };

      // Send current state immediately
      send(upload);

      const listener = (payload: unknown) => {
        send(payload);

        // Close the stream when terminal status is reached
        const p = payload as { status?: string };
        if (p.status === "COMPLETED" || p.status === "FAILED") {
          cleanup();
        }
      };

      const cleanup = () => {
        analysisEvents.unsubscribe(id, listener);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      analysisEvents.subscribe(id, listener);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
