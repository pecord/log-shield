"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge } from "@/components/analysis/severity-badge";
import {
  FindingDetailDialog,
  type Finding,
} from "@/components/findings/finding-detail-dialog";
import { CATEGORY_LABELS, SEVERITY_INDEX, SEVERITY_CHART_COLORS } from "@/lib/constants";
import { Search, ChevronRight, CalendarDays, X } from "lucide-react";

interface FindingWithUpload extends Finding {
  uploadId: string;
  uploadFileName: string;
  createdAt: string;
}

interface FindingsResponse {
  findings: FindingWithUpload[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function FindingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [severity, setSeverity] = useState(
    searchParams.get("severity") || "all"
  );
  const [category, setCategory] = useState(
    searchParams.get("category") || "all"
  );
  const [source, setSource] = useState(searchParams.get("source") || "all");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || ""
  );
  const [dateStart, setDateStart] = useState(
    searchParams.get("dateStart") || ""
  );
  const [dateEnd, setDateEnd] = useState(searchParams.get("dateEnd") || "");
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") || "1")
  );

  const [findingId, setFindingId] = useState(
    searchParams.get("finding") || ""
  );

  const [data, setData] = useState<FindingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFinding, setSelectedFinding] =
    useState<FindingWithUpload | null>(null);

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
    if (!data?.findings || !sortBy || !sortDir) return data?.findings ?? [];
    return [...data.findings].sort((a, b) => {
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
  }, [data?.findings, sortBy, sortDir]);

  const fetchFindings = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    if (severity !== "all") params.set("severity", severity);
    if (category !== "all") params.set("category", category);
    if (source !== "all") params.set("source", source);
    if (search) params.set("search", search);
    if (dateStart) params.set("dateStart", dateStart);
    if (dateEnd) params.set("dateEnd", dateEnd);

    try {
      const res = await fetch(`/api/findings?${params}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch findings:", err);
      toast.error("Failed to load findings");
    } finally {
      setIsLoading(false);
    }
  }, [page, severity, category, source, search, dateStart, dateEnd]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (severity !== "all") params.set("severity", severity);
    if (category !== "all") params.set("category", category);
    if (source !== "all") params.set("source", source);
    if (search) params.set("search", search);
    if (dateStart) params.set("dateStart", dateStart);
    if (dateEnd) params.set("dateEnd", dateEnd);
    if (findingId) params.set("finding", findingId);
    if (page > 1) params.set("page", String(page));

    const queryString = params.toString();
    const newUrl = queryString ? `/findings?${queryString}` : "/findings";
    router.replace(newUrl, { scroll: false });
  }, [severity, category, source, search, dateStart, dateEnd, findingId, page, router]);

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  // Auto-open finding dialog from URL param
  useEffect(() => {
    if (findingId && data?.findings && !selectedFinding) {
      const match = data.findings.find((f) => f.id === findingId);
      if (match) setSelectedFinding(match);
    }
  }, [findingId, data?.findings]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleFilterChange =
    (setter: (v: string) => void) => (value: string) => {
      setter(value);
      setPage(1);
    };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Findings</h2>
        <p className="text-muted-foreground">
          {data
            ? `${data.pagination.total} finding${data.pagination.total !== 1 ? "s" : ""} across all uploads`
            : "Loading findings..."}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3">
        <Select value={severity} onValueChange={handleFilterChange(setSeverity)}>
          <SelectTrigger className="w-[150px]">
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

        <Select value={category} onValueChange={handleFilterChange(setCategory)}>
          <SelectTrigger className="w-[200px]">
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

        <Select value={source} onValueChange={handleFilterChange(setSource)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="RULE_BASED">Rule-Based</SelectItem>
            <SelectItem value="LLM">AI</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search findings..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Active date filter indicator */}
      {(dateStart || dateEnd) && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 py-1 pl-2 pr-1">
            <CalendarDays className="h-3 w-3" />
            <span className="text-xs">
              {dateStart === dateEnd
                ? dateStart
                : `${dateStart || "..."} to ${dateEnd || "..."}`}
            </span>
            <button
              onClick={() => {
                setDateStart("");
                setDateEnd("");
                setPage(1);
              }}
              className="ml-1 rounded-sm p-0.5 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {/* Results */}
      {isLoading && !data ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : data?.findings && data.findings.length > 0 ? (
        <div className={`transition-opacity duration-200 ${isLoading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
          <Card className="overflow-hidden py-0 gap-0">
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
                  <TableHead className="w-32">File</TableHead>
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
                    onClick={() => {
                      setSelectedFinding(finding);
                      setFindingId(finding.id);
                    }}
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
                    <TableCell className="text-xs">
                      <Link
                        href={`/uploads/${finding.uploadId}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {finding.uploadFileName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {finding.lineNumber || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          finding.source === "LLM" ? "default" : "secondary"
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
          </Card>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
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
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className={`py-8 text-center text-sm text-muted-foreground transition-opacity duration-200 ${isLoading ? "opacity-50" : "opacity-100"}`}>
          {search || severity !== "all" || category !== "all" || source !== "all" || dateStart || dateEnd ? (
            <>
              <p>No findings match the current filters.</p>
              <button
                className="mt-2 text-primary hover:underline"
                onClick={() => {
                  setSeverity("all");
                  setCategory("all");
                  setSource("all");
                  setSearch("");
                  setSearchInput("");
                  setDateStart("");
                  setDateEnd("");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <p>No findings yet. Upload and analyze a log file to see results.</p>
          )}
        </div>
      )}

      <FindingDetailDialog
        finding={selectedFinding}
        onClose={() => {
          setSelectedFinding(null);
          setFindingId("");
        }}
      />
    </div>
  );
}

export default function FindingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96" />
        </div>
      }
    >
      <FindingsContent />
    </Suspense>
  );
}
