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

  const categoryDistribution = categoryGroups.map((g) => ({
    category: g.category,
    count: g._count.id,
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

  // Get timeline (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const timelineData = uploadIds.length > 0
    ? await prisma.finding.groupBy({
        by: ["createdAt"],
        where: {
          analysisResult: { upload: { userId } },
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
      })
    : [];

  // Aggregate by date
  const timelineMap = new Map<string, number>();
  for (const entry of timelineData) {
    const date = entry.createdAt.toISOString().split("T")[0];
    timelineMap.set(date, (timelineMap.get(date) || 0) + entry._count.id);
  }

  const timeline = Array.from(timelineMap.entries())
    .map(([date, findings]) => ({ date, findings }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
