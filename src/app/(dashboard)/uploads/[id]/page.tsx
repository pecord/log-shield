"use client";

import { useEffect, useState, useMemo, useRef, useCallback, use } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortableTableHead,
  type SortDir,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { SeverityBadge } from "@/components/analysis/severity-badge";
import {
  FindingDetailDialog,
  type Finding,
} from "@/components/findings/finding-detail-dialog";
import { ArrowLeft, Loader2, Brain, Shield, RotateCcw, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABELS, SEVERITY_INDEX, SEVERITY_CHART_COLORS } from "@/lib/constants";

interface Upload {
  id: string;
  fileName: string;
  fileSize: number;
  lineCount: number | null;
  status: string;
  createdAt: string;
  analysisResult?: {
    id: string;
    status: string;
    totalLinesAnalyzed: number;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
    ruleBasedCompleted: boolean;
    llmCompleted: boolean;
    llmAvailable: boolean;
    overallSummary: string | null;
    analysisStartedAt: string | null;
    analysisEndedAt: string | null;
    errorMessage: string | null;
    skippedLineCount: number;
    logFormat: string | null;
  };
}

interface AnalysisData {
  findings: Finding[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  categoryBreakdown?: { category: string; _count: number }[];
}

/** Compute real progress percentage from analysis state */
function computeProgress(ar: Upload["analysisResult"]): { percent: number; label: string } {
  if (!ar) return { percent: 0, label: "Starting analysis..." };

  if (ar.status === "COMPLETED") return { percent: 100, label: "Analysis complete" };
  if (ar.status === "FAILED") return { percent: 100, label: "Analysis failed" };

  // Rules in progress: 0-30%
  if (!ar.ruleBasedCompleted) {
    return { percent: 15, label: "Running rule-based detection..." };
  }

  // Rules done, LLM in progress: 30-95%
  if (!ar.llmCompleted) {
    return { percent: 50, label: "Running AI analysis..." };
  }

  // LLM done, finalizing
  return { percent: 97, label: "Finalizing results..." };
}

export default function UploadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  // Track whether we've already fetched findings for early results
  const fetchedRuleFindings = useRef(false);
  const fetchedFinalFindings = useRef(false);

  // Sorting state
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : prev === "desc" ? null : "asc"));
      if (sortDir === "desc") setSortBy(null);
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const sortedFindings = useMemo(() => {
    if (!analysis?.findings || !sortBy || !sortDir) return analysis?.findings ?? [];
    return [...analysis.findings].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "severity":
          cmp = (SEVERITY_INDEX[a.severity] ?? 99) - (SEVERITY_INDEX[b.severity] ?? 99);
          break;
        case "category":
          cmp = (CATEGORY_LABELS[a.category] || a.category).localeCompare(
            CATEGORY_LABELS[b.category] || b.category
          );
          break;
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "line":
          cmp = (a.lineNumber ?? 0) - (b.lineNumber ?? 0);
          break;
        case "confidence":
          cmp = (a.confidence ?? 0) - (b.confidence ?? 0);
          break;
        default:
          return 0;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [analysis?.findings, sortBy, sortDir]);

  const fetchFindings = useCallback(async () => {
    if (!upload?.analysisResult?.id) return;
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (severityFilter !== "all") params.set("severity", severityFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);

    const res = await fetch(
      `/api/analysis/${upload.analysisResult.id}?${params}`
    );
    const data = await res.json();
    setAnalysis(data);
  }, [upload?.analysisResult?.id, page, severityFilter, categoryFilter]);

  // Fetch upload details
  useEffect(() => {
    fetch(`/api/uploads/${id}`)
      .then((res) => res.json())
      .then(setUpload)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id]);

  // Stream analysis progress via SSE + fetch findings progressively
  useEffect(() => {
    if (!upload?.analysisResult?.id) return;

    const ar = upload.analysisResult;
    const isDone = upload.status === "COMPLETED" || upload.status === "FAILED" ||
                   ar.status === "COMPLETED" || ar.status === "FAILED";

    // Fetch findings when rule-based is done (early results)
    if (ar.ruleBasedCompleted && !fetchedRuleFindings.current) {
      fetchedRuleFindings.current = true;
      fetchFindings();
    }

    // Re-fetch when fully complete (to get LLM findings + updated counts)
    if (isDone && !fetchedFinalFindings.current) {
      fetchedFinalFindings.current = true;
      fetchFindings();
      return;
    }

    if (isDone) return;

    const es = new EventSource(`/api/uploads/${id}/stream`);

    es.addEventListener("update", (e: MessageEvent) => {
      const data: Upload = JSON.parse(e.data);
      setUpload(data);

      const arData = data.analysisResult;
      if (!arData) return;

      if (arData.ruleBasedCompleted && !fetchedRuleFindings.current) {
        fetchedRuleFindings.current = true;
        fetchFindings();
      }

      if (data.status === "COMPLETED" || data.status === "FAILED") {
        fetchedFinalFindings.current = true;
        fetchFindings();
        es.close();
      }
    });

    return () => es.close();
  }, [upload?.analysisResult?.id, upload?.status, upload?.analysisResult?.ruleBasedCompleted, upload?.analysisResult?.llmCompleted, fetchFindings, id]);

  // Refetch findings when filters change (works during analysis too)
  useEffect(() => {
    const ar = upload?.analysisResult;
    if (ar?.id && (upload?.status === "COMPLETED" || ar?.ruleBasedCompleted)) {
      fetchFindings();
    }
  }, [severityFilter, categoryFilter, page, fetchFindings]);

  // Reset tracking refs when re-analyzing
  useEffect(() => {
    if (upload?.status === "ANALYZING") {
      fetchedRuleFindings.current = false;
      fetchedFinalFindings.current = false;
    }
  }, [upload?.status]);

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      const res = await fetch(`/api/uploads/${id}/analyze?reanalyze=true`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start re-analysis");
      }
      toast.success("Re-analysis started");
      setAnalysis(null);
      fetchedRuleFindings.current = false;
      fetchedFinalFindings.current = false;
      // Refresh upload to get new status
      const uploadRes = await fetch(`/api/uploads/${id}`);
      const data = await uploadRes.json();
      setUpload(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Re-analysis failed"
      );
    } finally {
      setIsReanalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!upload) {
    return <div>Upload not found</div>;
  }

  const ar = upload.analysisResult;
  const isPending = upload.status === "PENDING";
  const isAnalyzing = upload.status === "ANALYZING";
  const isCompleted = upload.status === "COMPLETED";
  const isFailed = upload.status === "FAILED";

  // Show results when completed OR when rules are done during analysis
  const showResults = isCompleted || (isAnalyzing && ar?.ruleBasedCompleted);
  const llmPending = isAnalyzing && ar?.ruleBasedCompleted && !ar?.llmCompleted;
  const progressInfo = computeProgress(ar);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/uploads">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight leading-none">
              {upload.fileName}
            </h2>
            <Badge variant="outline" className="text-xs gap-1">
              <FileText className="h-3 w-3" />
              {ar ? ar.totalLinesAnalyzed.toLocaleString() : (upload.lineCount?.toLocaleString() || "?")} lines
              {ar && ar.skippedLineCount > 0 && ` (${ar.skippedLineCount} skipped)`}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {new Date(upload.createdAt).toLocaleString()}
            </Badge>
            {ar?.logFormat && (
              <Badge variant="outline" className="text-xs">
                {ar.logFormat.toUpperCase()}
              </Badge>
            )}
            {ar && (
              <Badge variant="outline" className="text-xs gap-1">
                <Shield className="h-3 w-3" />
                Rule-Based: {ar.ruleBasedCompleted ? "Complete" : "Pending"}
              </Badge>
            )}
            {ar && (
              <Badge variant="outline" className="text-xs gap-1">
                <Brain className="h-3 w-3" />
                LLM: {ar.llmAvailable ? (ar.llmCompleted ? "Complete" : "Pending") : "Not Configured"}
              </Badge>
            )}
          </div>
        </div>
        {isCompleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReanalyze}
            disabled={isReanalyzing}
          >
            {isReanalyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Re-analyze
          </Button>
        )}
      </div>

      {/* Analysis Progress */}
      {isAnalyzing && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Analyzing log file...</p>
              <p className="text-sm text-muted-foreground">
                {progressInfo.label}
              </p>
            </div>
            <Progress value={progressInfo.percent} className="w-64" />
          </CardContent>
        </Card>
      )}

      {/* Pending State */}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Ready to analyze</p>
              <p className="text-sm text-muted-foreground">
                {upload.lineCount?.toLocaleString() || "?"} lines waiting for security analysis.
              </p>
            </div>
            <Button onClick={handleReanalyze} disabled={isReanalyzing}>
              {isReanalyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shield className="mr-2 h-4 w-4" />
              )}
              Start Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {isFailed && ar?.errorMessage && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">
              Analysis failed: {ar.errorMessage}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Analysis Results — shown as soon as rule findings are available */}
      {showResults && ar && (
        <>
          {/* Severity Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Critical", count: ar.criticalCount, color: "text-red-500" },
              { label: "High", count: ar.highCount, color: "text-orange-500" },
              { label: "Medium", count: ar.mediumCount, color: "text-yellow-500" },
              { label: "Low", count: ar.lowCount, color: "text-blue-500" },
              { label: "Info", count: ar.infoCount, color: "text-gray-400" },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="py-3 text-center">
                  <p className={`text-2xl font-bold ${item.color}`}>
                    {item.count}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* LLM Pending Indicator */}
          {llmPending && (
            <Card className="border-dashed border-primary/40">
              <CardContent className="flex items-center gap-3 py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">LLM analysis in progress</p>
                  <p className="text-xs text-muted-foreground">
                    AI-powered findings will appear when complete. Rule-based findings are shown below.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Threat Breakdown */}
          {analysis?.categoryBreakdown && analysis.categoryBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Threat Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {analysis.categoryBreakdown
                    .sort((a, b) => b._count - a._count)
                    .map((item) => (
                      <div
                        key={item.category}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <span className="text-sm">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {item._count}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Overall Summary — only shown after LLM completes */}
          {ar.overallSummary && ar.llmCompleted && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Brain className="h-4 w-4" />
                  AI Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {ar.overallSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Findings Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-medium">
                  Findings ({ar.totalFindings})
                  {llmPending && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      — AI findings pending
                    </span>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="INFO">Info</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {analysis?.findings && analysis.findings.length > 0 ? (
                <>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableTableHead sortKey="severity" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-24">
                            Severity
                          </SortableTableHead>
                          <SortableTableHead sortKey="category" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-40">
                            Category
                          </SortableTableHead>
                          <SortableTableHead sortKey="title" activeSort={sortBy} direction={sortDir} onSort={handleSort}>
                            Title
                          </SortableTableHead>
                          <SortableTableHead sortKey="confidence" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-16">
                            Conf.
                          </SortableTableHead>
                          <SortableTableHead sortKey="line" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-16">
                            Line
                          </SortableTableHead>
                          <TableHead className="w-24">Source</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedFindings.map((finding) => (
                          <TableRow
                            key={finding.id}
                            className="cursor-pointer hover:bg-muted/50"
                            style={{ borderLeft: `3px solid ${SEVERITY_CHART_COLORS[finding.severity] || "#9ca3af"}` }}
                            onClick={() => setSelectedFinding(finding)}
                          >
                            <TableCell>
                              <SeverityBadge severity={finding.severity} />
                            </TableCell>
                            <TableCell className="text-xs">
                              {CATEGORY_LABELS[finding.category] || finding.category}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm" title={finding.title}>
                              {finding.title}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {finding.confidence != null
                                ? `${Math.round(finding.confidence * 100)}%`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {finding.lineNumber || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  finding.source === "LLM"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {finding.source === "LLM" ? "AI" : "Rule"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {analysis.pagination.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {page} of {analysis.pagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === analysis.pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {analysis ? "No findings match the current filters." : "Loading findings..."}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <FindingDetailDialog
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}
