import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [
    totalUploads,
    uploads,
    recentUploads,
    analysisResults,
  ] = await Promise.all([
    prisma.upload.count({ where: { userId } }),
    prisma.upload.findMany({
      where: { userId },
      select: { id: true },
    }),
    prisma.upload.findMany({
      where: { userId },
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
      take: 5,
    }),
    prisma.analysisResult.findMany({
      where: { upload: { userId } },
      select: {
        totalFindings: true,
        criticalCount: true,
        highCount: true,
        mediumCount: true,
        lowCount: true,
        infoCount: true,
      },
    }),
  ]);

  // Aggregate severity distribution
  const severityDistribution = [
    { severity: "CRITICAL", count: 0 },
    { severity: "HIGH", count: 0 },
    { severity: "MEDIUM", count: 0 },
    { severity: "LOW", count: 0 },
    { severity: "INFO", count: 0 },
  ];

  let totalFindings = 0;
  for (const ar of analysisResults) {
    totalFindings += ar.totalFindings;
    severityDistribution[0].count += ar.criticalCount;
    severityDistribution[1].count += ar.highCount;
    severityDistribution[2].count += ar.mediumCount;
    severityDistribution[3].count += ar.lowCount;
    severityDistribution[4].count += ar.infoCount;
  }

  // Get category distribution from findings
  const uploadIds = uploads.map((u) => u.id);
  const categoryGroups = uploadIds.length > 0
    ? await prisma.finding.groupBy({
        by: ["category"],
        where: {
          analysisResult: { upload: { userId } },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      })
    : [];

  // Get the highest severity per category for chart coloring
  const categorySeverityGroups = uploadIds.length > 0
    ? await prisma.finding.groupBy({
        by: ["category", "severity"],
        where: {
          analysisResult: { upload: { userId } },
        },
        _count: { id: true },
      })
    : [];

  const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const maxSeverityByCategory: Record<string, string> = {};
  for (const g of categorySeverityGroups) {
    const current = maxSeverityByCategory[g.category];
    if (!current || (SEVERITY_RANK[g.severity] ?? 5) < (SEVERITY_RANK[current] ?? 5)) {
      maxSeverityByCategory[g.category] = g.severity;
    }
  }

  const categoryDistribution = categoryGroups.map((g) => ({
    category: g.category,
    count: g._count.id,
    maxSeverity: maxSeverityByCategory[g.category] || "INFO",
  }));

  // Get top threats
  const topThreats = uploadIds.length > 0
    ? await prisma.finding.findMany({
        where: {
          analysisResult: { upload: { userId } },
          severity: { in: ["CRITICAL", "HIGH"] },
        },
        select: {
          title: true,
          severity: true,
          category: true,
          confidence: true,
          analysisResult: {
            select: {
              upload: { select: { fileName: true } },
            },
          },
        },
        orderBy: [{ severity: "asc" }, { confidence: "desc" }],
        take: 5,
      })
    : [];

  // Get timeline — grouped by the log event timestamp (extracted from the log line)
  // with severity breakdown. Falls back to upload date if no event timestamp is available.
  const timelineFindings = uploadIds.length > 0
    ? await prisma.finding.findMany({
        where: {
          analysisResult: { upload: { userId } },
        },
        select: {
          severity: true,
          eventTimestamp: true,
          analysisResult: {
            select: { upload: { select: { createdAt: true } } },
          },
        },
      })
    : [];

  // Aggregate by event date with severity breakdown
  const timelineMap = new Map<string, { critical: number; high: number; other: number }>();
  for (const f of timelineFindings) {
    // Use the actual log event timestamp if available, otherwise fall back to upload date
    const ts = f.eventTimestamp ?? f.analysisResult.upload.createdAt;
    const date = ts.toISOString().split("T")[0];
    let bucket = timelineMap.get(date);
    if (!bucket) {
      bucket = { critical: 0, high: 0, other: 0 };
      timelineMap.set(date, bucket);
    }
    if (f.severity === "CRITICAL") bucket.critical++;
    else if (f.severity === "HIGH") bucket.high++;
    else bucket.other++;
  }

  // Build timeline — only include days that actually have findings.
  // No gap-filling: log data may span years (e.g. historical CSV from 2017
  // alongside recent uploads from 2026), so filling gaps creates thousands
  // of empty entries and breaks the chart.
  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({ date, ...bucket }));

  return NextResponse.json({
    totalUploads,
    totalFindings,
    severityDistribution,
    categoryDistribution,
    recentUploads,
    topThreats: topThreats.map((t) => ({
      title: t.title,
      severity: t.severity,
      category: t.category,
      uploadFileName: t.analysisResult.upload.fileName,
    })),
    timeline,
  });
}
