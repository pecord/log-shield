import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_PAGE_SIZE } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("limit") || "25") || 25));
  const severity = searchParams.get("severity");
  const category = searchParams.get("category");
  const source = searchParams.get("source");
  const search = searchParams.get("search");
  const dateStart = searchParams.get("dateStart");
  const dateEnd = searchParams.get("dateEnd");

  // Build where clause — findings must belong to this user's uploads
  const where: Record<string, unknown> = {
    analysisResult: {
      upload: {
        userId: session.user.id,
      },
    },
  };

  if (severity) {
    where.severity = severity;
  }
  if (category) {
    where.category = category;
  }
  if (source) {
    where.source = source;
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }
  if (dateStart || dateEnd) {
    const tsFilter: Record<string, unknown> = {};
    if (dateStart) tsFilter.gte = new Date(`${dateStart}T00:00:00.000Z`);
    if (dateEnd) tsFilter.lte = new Date(`${dateEnd}T23:59:59.999Z`);
    where.eventTimestamp = tsFilter;
  }

  const [findings, total] = await Promise.all([
    prisma.finding.findMany({
      where,
      include: {
        analysisResult: {
          select: {
            upload: {
              select: { id: true, fileName: true },
            },
          },
        },
      },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.finding.count({ where }),
  ]);

  const flatFindings = findings.map((f) => ({
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    description: f.description,
    lineNumber: f.lineNumber,
    lineContent: f.lineContent,
    matchedPattern: f.matchedPattern,
    source: f.source,
    fingerprint: f.fingerprint,
    recommendation: f.recommendation,
    confidence: f.confidence,
    mitreTactic: f.mitreTactic,
    mitreTechnique: f.mitreTechnique,
    createdAt: f.createdAt,
    uploadId: f.analysisResult.upload.id,
    uploadFileName: f.analysisResult.upload.fileName,
  }));

  return NextResponse.json({
    findings: flatFindings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
