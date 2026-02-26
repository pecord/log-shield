import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PAGE_SIZE } from "@/lib/constants";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type ThreatCategory = "SQL_INJECTION" | "XSS" | "BRUTE_FORCE" | "DIRECTORY_TRAVERSAL" | "COMMAND_INJECTION" | "SUSPICIOUS_STATUS_CODE" | "MALICIOUS_USER_AGENT" | "RATE_ANOMALY" | "PRIVILEGE_ESCALATION" | "DATA_EXFILTRATION" | "RECONNAISSANCE" | "OTHER";
type Source = "RULE_BASED" | "LLM";

const VALID_SEVERITIES = new Set<string>(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
const VALID_CATEGORIES = new Set<string>(["SQL_INJECTION", "XSS", "BRUTE_FORCE", "DIRECTORY_TRAVERSAL", "COMMAND_INJECTION", "SUSPICIOUS_STATUS_CODE", "MALICIOUS_USER_AGENT", "RATE_ANOMALY", "PRIVILEGE_ESCALATION", "DATA_EXFILTRATION", "RECONNAISSANCE", "OTHER"]);
const VALID_SOURCES = new Set<string>(["RULE_BASED", "LLM"]);

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

  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("limit") || "50") || 50));
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

  // Build findings filter — validate enum params against allowlists
  const validSeverity = severity && VALID_SEVERITIES.has(severity) ? (severity as Severity) : undefined;
  const validCategory = category && VALID_CATEGORIES.has(category) ? (category as ThreatCategory) : undefined;
  const validSource = source && VALID_SOURCES.has(source) ? (source as Source) : undefined;

  const findingsWhere = {
    analysisResultId: id,
    ...(validSeverity ? { severity: validSeverity } : {}),
    ...(validCategory ? { category: validCategory } : {}),
    ...(validSource ? { source: validSource } : {}),
  };

  const [findings, totalFilteredFindings, categoryBreakdown] = await Promise.all([
    prisma.finding.findMany({
      where: findingsWhere,
      orderBy: [{ severity: "asc" }, { lineNumber: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.finding.count({ where: findingsWhere }),
    prisma.finding.groupBy({
      by: ["category"],
      where: { analysisResultId: id },
      _count: true,
    }),
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
    categoryBreakdown: categoryBreakdown.map((c) => ({
      category: c.category,
      _count: c._count,
    })),
    pagination: {
      page,
      limit,
      total: totalFilteredFindings,
      totalPages: Math.ceil(totalFilteredFindings / limit),
    },
  });
}
