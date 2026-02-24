import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const severity = searchParams.get("severity");
  const category = searchParams.get("category");
  const source = searchParams.get("source");

  const analysisResult = await prisma.analysisResult.findUnique({
    where: { id },
    include: {
      upload: { select: { userId: true, fileName: true } },
    },
  });

  if (!analysisResult) {
    return NextResponse.json(
      { error: "Analysis not found" },
      { status: 404 }
    );
  }

  if (analysisResult.upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build findings filter
  const findingsWhere = {
    analysisResultId: id,
    ...(severity ? { severity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" } : {}),
    ...(category ? { category: category as "SQL_INJECTION" | "XSS" | "BRUTE_FORCE" | "DIRECTORY_TRAVERSAL" | "COMMAND_INJECTION" | "SUSPICIOUS_STATUS_CODE" | "MALICIOUS_USER_AGENT" | "RATE_ANOMALY" | "PRIVILEGE_ESCALATION" | "DATA_EXFILTRATION" | "RECONNAISSANCE" | "OTHER" } : {}),
    ...(source ? { source: source as "RULE_BASED" | "LLM" } : {}),
  };

  const [findings, totalFilteredFindings] = await Promise.all([
    prisma.finding.findMany({
      where: findingsWhere,
      orderBy: [{ severity: "asc" }, { lineNumber: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.finding.count({ where: findingsWhere }),
  ]);

  return NextResponse.json({
    id: analysisResult.id,
    status: analysisResult.status,
    totalLinesAnalyzed: analysisResult.totalLinesAnalyzed,
    totalFindings: analysisResult.totalFindings,
    criticalCount: analysisResult.criticalCount,
    highCount: analysisResult.highCount,
    mediumCount: analysisResult.mediumCount,
    lowCount: analysisResult.lowCount,
    infoCount: analysisResult.infoCount,
    ruleBasedCompleted: analysisResult.ruleBasedCompleted,
    llmCompleted: analysisResult.llmCompleted,
    llmAvailable: analysisResult.llmAvailable,
    overallSummary: analysisResult.overallSummary,
    analysisStartedAt: analysisResult.analysisStartedAt,
    analysisEndedAt: analysisResult.analysisEndedAt,
    errorMessage: analysisResult.errorMessage,
    fileName: analysisResult.upload.fileName,
    findings,
    pagination: {
      page,
      limit,
      total: totalFilteredFindings,
      totalPages: Math.ceil(totalFilteredFindings / limit),
    },
  });
}
