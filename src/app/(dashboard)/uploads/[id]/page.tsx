"use client";

import { useEffect, useState, use } from "react";
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
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ArrowLeft, Loader2, Brain, Shield, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABELS } from "@/lib/constants";

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
  };
}

interface Finding {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  lineNumber: number | null;
  lineContent: string | null;
  matchedPattern: string | null;
  source: string;
  fingerprint: string;
  recommendation: string | null;
  confidence: number | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
}

interface AnalysisData {
  findings: Finding[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
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

  // Fetch upload details
  useEffect(() => {
    fetch(`/api/uploads/${id}`)
      .then((res) => res.json())
      .then(setUpload)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [id]);

  // Poll for analysis completion
  useEffect(() => {
    if (!upload?.analysisResult?.id) return;
    if (
      upload.status === "COMPLETED" ||
      upload.status === "FAILED" ||
      upload.analysisResult.status === "COMPLETED" ||
      upload.analysisResult.status === "FAILED"
    ) {
      // Fetch findings once analysis is done
      fetchFindings();
      return;
    }

    const interval = setInterval(async () => {
      const res = await fetch(`/api/uploads/${id}`);
      const data = await res.json();
      setUpload(data);

      if (data.status === "COMPLETED" || data.status === "FAILED") {
        clearInterval(interval);
        fetchFindings();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [upload?.analysisResult?.id, upload?.status]);

  // Refetch findings when filters change
  useEffect(() => {
    if (upload?.analysisResult?.id && upload.status === "COMPLETED") {
      fetchFindings();
    }
  }, [severityFilter, categoryFilter, page]);

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

  const fetchFindings = async () => {
    if (!upload?.analysisResult?.id) return;
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (severityFilter !== "all") params.set("severity", severityFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);

    const res = await fetch(
      `/api/analysis/${upload.analysisResult.id}?${params}`
    );
    const data = await res.json();
    setAnalysis(data);
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
  const isAnalyzing = upload.status === "ANALYZING";
  const isCompleted = upload.status === "COMPLETED";
  const isFailed = upload.status === "FAILED";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/uploads">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {upload.fileName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {upload.lineCount?.toLocaleString() || "?"} lines &middot;{" "}
              {new Date(upload.createdAt).toLocaleString()}
            </p>
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
                {ar?.ruleBasedCompleted
                  ? "Running LLM analysis..."
                  : "Running rule-based detection..."}
              </p>
            </div>
            <Progress value={ar?.ruleBasedCompleted ? 60 : 30} className="w-64" />
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

      {/* Analysis Summary */}
      {isCompleted && ar && (
        <>
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

          {/* AI Indicators */}
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1">
              <Shield className="h-3 w-3" />
              Rule-Based: {ar.ruleBasedCompleted ? "Complete" : "Pending"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Brain className="h-3 w-3" />
              LLM: {ar.llmAvailable ? (ar.llmCompleted ? "Complete" : "Pending") : "Not Configured"}
            </Badge>
          </div>

          {/* Overall Summary */}
          {ar.overallSummary && (
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
                          <TableHead className="w-24">Severity</TableHead>
                          <TableHead className="w-40">Category</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead className="w-16">Line</TableHead>
                          <TableHead className="w-24">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.findings.map((finding) => (
                          <TableRow
                            key={finding.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedFinding(finding)}
                          >
                            <TableCell>
                              <SeverityBadge severity={finding.severity} />
                            </TableCell>
                            <TableCell className="text-xs">
                              {CATEGORY_LABELS[finding.category] || finding.category}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm">
                              {finding.title}
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

      {/* Finding Detail Dialog */}
      <Dialog
        open={!!selectedFinding}
        onOpenChange={() => setSelectedFinding(null)}
      >
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          {selectedFinding && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <SeverityBadge severity={selectedFinding.severity} />
                  {selectedFinding.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {CATEGORY_LABELS[selectedFinding.category] || selectedFinding.category}
                  </Badge>
                  <Badge variant={selectedFinding.source === "LLM" ? "default" : "secondary"}>
                    {selectedFinding.source === "LLM" ? "AI Detection" : "Rule-Based"}
                  </Badge>
                  {selectedFinding.confidence && (
                    <Badge variant="outline">
                      Confidence: {Math.round(selectedFinding.confidence * 100)}%
                    </Badge>
                  )}
                  {selectedFinding.lineNumber && (
                    <Badge variant="outline">
                      Line {selectedFinding.lineNumber}
                    </Badge>
                  )}
                </div>

                <div>
                  <h4 className="mb-1 text-sm font-semibold">Description</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selectedFinding.description}
                  </p>
                </div>

                {selectedFinding.lineContent && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">Log Line</h4>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                      {selectedFinding.lineContent}
                    </pre>
                  </div>
                )}

                {selectedFinding.matchedPattern && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">
                      Matched Pattern
                    </h4>
                    <code className="rounded bg-muted px-2 py-1 text-xs">
                      {selectedFinding.matchedPattern}
                    </code>
                  </div>
                )}

                {selectedFinding.recommendation && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">
                      Recommendation
                    </h4>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {selectedFinding.recommendation}
                    </p>
                  </div>
                )}

                {(selectedFinding.mitreTactic || selectedFinding.mitreTechnique) && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">
                      MITRE ATT&CK
                    </h4>
                    <div className="flex gap-2">
                      {selectedFinding.mitreTactic && (
                        <Badge variant="outline">
                          {selectedFinding.mitreTactic}
                        </Badge>
                      )}
                      {selectedFinding.mitreTechnique && (
                        <Badge variant="outline">
                          {selectedFinding.mitreTechnique}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
