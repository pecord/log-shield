"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Trash2, ChevronUp, ChevronRight, Search, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { UploadForm } from "@/components/uploads/upload-form";

interface UploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  lineCount: number | null;
  status: string;
  createdAt: string;
  analysisResult?: {
    id: string;
    status: string;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getRowBorderColor(upload: UploadItem): string {
  const ar = upload.analysisResult;
  if (!ar || ar.totalFindings === 0) return "transparent";
  if (ar.criticalCount > 0) return "#dc2626";
  if (ar.highCount > 0) return "#f97316";
  if (ar.mediumCount > 0) return "#eab308";
  if (ar.lowCount > 0) return "#3b82f6";
  return "#9ca3af";
}

const STATUS_ORDER: Record<string, number> = {
  ANALYZING: 0,
  PENDING: 1,
  FAILED: 2,
  COMPLETED: 3,
};

export default function UploadsPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [isReanalyzingAll, setIsReanalyzingAll] = useState(false);

  // Client-side filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");

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

  const fetchUploads = () => {
    fetch("/api/uploads?limit=50")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const list = data.uploads ?? [];
        setUploads(list);
        if (list.length === 0) {
          setShowUpload(true);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  // Poll while any upload is actively being analyzed
  const hasActiveAnalysis = uploads.some((u) => u.status === "ANALYZING");
  useEffect(() => {
    if (!hasActiveAnalysis) return;
    const interval = setInterval(fetchUploads, 3000);
    return () => clearInterval(interval);
  }, [hasActiveAnalysis]);

  const handleReanalyzeAll = async () => {
    const completedCount = uploads.filter((u) => u.status === "COMPLETED").length;
    if (completedCount === 0) {
      toast.error("No completed uploads to re-analyze");
      return;
    }

    const confirmed = window.confirm(
      `Re-analyze all ${completedCount} completed uploads? This will delete existing findings and re-run the analysis pipeline sequentially.`
    );
    if (!confirmed) return;

    setIsReanalyzingAll(true);
    try {
      const res = await fetch("/api/uploads/reanalyze-all", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start re-analysis");
      }
      const data = await res.json();
      toast.success(`Re-analyzing ${data.total} uploads sequentially`);
      fetchUploads();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Re-analysis failed"
      );
    } finally {
      setIsReanalyzingAll(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setUploads((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete upload");
    }
  };

  const filtered = useMemo(() => {
    return uploads.filter((u) => {
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (searchInput && !u.fileName.toLowerCase().includes(searchInput.toLowerCase())) return false;
      return true;
    });
  }, [uploads, statusFilter, searchInput]);

  const sorted = useMemo(() => {
    if (!sortBy || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "fileName":
          cmp = a.fileName.localeCompare(b.fileName);
          break;
        case "uploaded":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "lines":
          cmp = (a.lineCount ?? 0) - (b.lineCount ?? 0);
          break;
        case "status":
          cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
          break;
        case "critical":
          cmp = (a.analysisResult?.criticalCount ?? 0) - (b.analysisResult?.criticalCount ?? 0);
          break;
        case "high":
          cmp = (a.analysisResult?.highCount ?? 0) - (b.analysisResult?.highCount ?? 0);
          break;
        case "medlow":
          cmp = ((a.analysisResult?.mediumCount ?? 0) + (a.analysisResult?.lowCount ?? 0))
            - ((b.analysisResult?.mediumCount ?? 0) + (b.analysisResult?.lowCount ?? 0));
          break;
        case "total":
          cmp = (a.analysisResult?.totalFindings ?? 0) - (b.analysisResult?.totalFindings ?? 0);
          break;
        default:
          return 0;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortBy, sortDir]);

  const hasActiveFilters = statusFilter !== "all" || searchInput !== "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Uploads</h2>
          <p className="text-muted-foreground">
            {isLoading
              ? "Loading uploads..."
              : `${uploads.length} upload${uploads.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {uploads.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyzeAll}
              disabled={isReanalyzingAll}
            >
              {isReanalyzingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Re-analyze All
            </Button>
            <Button
              size="sm"
              variant={showUpload ? "outline" : "default"}
              onClick={() => setShowUpload(!showUpload)}
            >
              {showUpload ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Hide Upload
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload New
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <Collapsible open={showUpload} onOpenChange={setShowUpload}>
        <CollapsibleContent>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Upload Log File
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UploadForm onUploadComplete={fetchUploads} />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Filter Bar */}
      {uploads.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ANALYZING">Analyzing</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by file name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : uploads.length === 0 && !showUpload ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No uploads yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload your first log file to start analyzing threats.
          </p>
          <Button onClick={() => setShowUpload(true)}>Upload Log File</Button>
        </div>
      ) : sorted.length > 0 ? (
        <Card className="overflow-hidden py-0 gap-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="fileName" activeSort={sortBy} direction={sortDir} onSort={handleSort}>
                    File Name
                  </SortableTableHead>
                  <SortableTableHead sortKey="uploaded" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-28">
                    Uploaded
                  </SortableTableHead>
                  <SortableTableHead sortKey="lines" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-20">
                    Lines
                  </SortableTableHead>
                  <SortableTableHead sortKey="status" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-28">
                    Status
                  </SortableTableHead>
                  <SortableTableHead sortKey="critical" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-16">
                    Crit
                  </SortableTableHead>
                  <SortableTableHead sortKey="high" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-16">
                    High
                  </SortableTableHead>
                  <SortableTableHead sortKey="medlow" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-20">
                    Med/Low
                  </SortableTableHead>
                  <SortableTableHead sortKey="total" activeSort={sortBy} direction={sortDir} onSort={handleSort} className="w-16">
                    Total
                  </SortableTableHead>
                  <TableHead className="w-8" />
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((upload) => (
                  <TableRow
                    key={upload.id}
                    className="cursor-pointer hover:bg-muted/50"
                    style={{ borderLeft: `3px solid ${getRowBorderColor(upload)}` }}
                    onClick={() => router.push(`/uploads/${upload.id}`)}
                  >
                    <TableCell>
                      <Link
                        href={`/uploads/${upload.id}`}
                        className="font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {upload.fileName}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatBytes(upload.fileSize)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" title={new Date(upload.createdAt).toLocaleString()}>
                      {formatRelativeDate(upload.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {upload.lineCount?.toLocaleString() || "–"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          upload.status === "COMPLETED"
                            ? "outline"
                            : upload.status === "FAILED"
                              ? "destructive"
                              : upload.status === "ANALYZING"
                                ? "secondary"
                                : "outline"
                        }
                        className={`text-xs ${upload.status === "COMPLETED" ? "bg-emerald-800 text-emerald-100 border-emerald-800" : ""}`}
                      >
                        {(upload.status === "ANALYZING" || upload.status === "PENDING") && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        {upload.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {upload.analysisResult ? (
                        <span className={upload.analysisResult.criticalCount > 0 ? "text-sm font-medium text-red-500" : "text-xs text-muted-foreground"}>
                          {upload.analysisResult.criticalCount || "–"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {upload.analysisResult ? (
                        <span className={upload.analysisResult.highCount > 0 ? "text-sm font-medium text-orange-500" : "text-xs text-muted-foreground"}>
                          {upload.analysisResult.highCount || "–"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {upload.analysisResult ? (
                        <span className="text-xs text-muted-foreground">
                          {(upload.analysisResult.mediumCount + upload.analysisResult.lowCount) || "–"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {upload.analysisResult ? (
                        <span className="text-sm font-medium">
                          {upload.analysisResult.totalFindings}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => handleDelete(upload.id, e)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </Card>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {hasActiveFilters ? (
            <>
              <p>No uploads match the current filters.</p>
              <button
                className="mt-2 text-primary hover:underline"
                onClick={() => {
                  setStatusFilter("all");
                  setSearchInput("");
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <p>No uploads yet. Upload a log file to get started.</p>
          )}
        </div>
      )}
    </div>
  );
}
