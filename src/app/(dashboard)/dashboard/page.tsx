"use client";

import { useEffect, useState } from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { SeverityChart } from "@/components/dashboard/severity-chart";
import { ThreatTypeChart } from "@/components/dashboard/threat-type-chart";
import { TimelineChart } from "@/components/dashboard/timeline-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/constants";
import { WelcomeCard } from "@/components/dashboard/welcome-card";

interface DashboardStats {
  totalUploads: number;
  totalFindings: number;
  severityDistribution: { severity: string; count: number }[];
  categoryDistribution: { category: string; count: number }[];
  recentUploads: {
    id: string;
    fileName: string;
    status: string;
    createdAt: string;
    analysisResult?: {
      totalFindings: number;
      criticalCount: number;
      highCount: number;
    };
  }[];
  topThreats: {
    title: string;
    severity: string;
    category: string;
    uploadFileName: string;
  }[];
  timeline: { date: string; findings: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  if (stats.totalUploads === 0) {
    return <WelcomeCard />;
  }

  const criticalCount =
    stats.severityDistribution.find((d) => d.severity === "CRITICAL")?.count || 0;
  const highCount =
    stats.severityDistribution.find((d) => d.severity === "HIGH")?.count || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your log analysis activity
        </p>
      </div>

      <StatsCards
        totalUploads={stats.totalUploads}
        totalFindings={stats.totalFindings}
        criticalCount={criticalCount}
        highCount={highCount}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SeverityChart data={stats.severityDistribution} />
        <ThreatTypeChart data={stats.categoryDistribution} />
      </div>

      <TimelineChart data={stats.timeline} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Uploads */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Uploads
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentUploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No uploads yet.{" "}
                <Link href="/uploads" className="text-primary underline">
                  Upload your first log file
                </Link>
              </p>
            ) : (
              <div className="space-y-3">
                {stats.recentUploads.map((upload) => (
                  <Link
                    key={upload.id}
                    href={`/uploads/${upload.id}`}
                    className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-muted"
                  >
                    <div>
                      <p className="text-sm font-medium">{upload.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(upload.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        upload.status === "COMPLETED"
                          ? "default"
                          : upload.status === "FAILED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {upload.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Threats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Threats</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topThreats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No threats detected yet.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.topThreats.map((threat, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-2 rounded-lg p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {threat.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {CATEGORY_LABELS[threat.category] || threat.category} &middot;{" "}
                        {threat.uploadFileName}
                      </p>
                    </div>
                    <Badge
                      variant={
                        threat.severity === "CRITICAL"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {threat.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
