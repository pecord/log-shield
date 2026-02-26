"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge } from "@/components/analysis/severity-badge";
import {
  RULES_REGISTRY,
  TOTAL_PATTERN_COUNT,
  TOTAL_CATEGORY_COUNT,
  type RuleCategory,
} from "@/lib/rules-registry";
import {
  ChevronDown,
  ChevronRight,
  Search,
  BookOpen,
  Shield,
  Crosshair,
} from "lucide-react";

function RulesContent() {
  const searchParams = useSearchParams();
  const urlCategory = searchParams.get("category");
  const urlExpand = searchParams.get("expand");
  const urlHighlight = searchParams.get("highlight");

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const expandKey = urlExpand || urlCategory || RULES_REGISTRY[0]?.category;
  const [expanded, setExpanded] = useState<Set<string>>(
    expandKey ? new Set([expandKey]) : new Set()
  );

  const toggleExpanded = (category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(RULES_REGISTRY.map((r) => r.category)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  // Filter categories and patterns
  const filteredCategories = useMemo(() => {
    const searchLower = search.toLowerCase();

    return RULES_REGISTRY.map((cat) => {
      // Filter patterns within each category
      let patterns = cat.patterns;

      if (severityFilter !== "all") {
        patterns = patterns.filter((p) => p.severity === severityFilter);
      }

      if (searchLower) {
        patterns = patterns.filter(
          (p) =>
            p.label.toLowerCase().includes(searchLower) ||
            p.description.toLowerCase().includes(searchLower) ||
            p.pattern.toLowerCase().includes(searchLower)
        );
      }

      return { ...cat, patterns, patternCount: patterns.length };
    })
      .filter((cat) => {
        // Filter out categories with no matching patterns
        if (cat.patternCount === 0) return false;

        // Apply category filter
        if (categoryFilter !== "all" && cat.category !== categoryFilter)
          return false;

        return true;
      });
  }, [categoryFilter, severityFilter, search]);

  const filteredPatternCount = filteredCategories.reduce(
    (sum, cat) => sum + cat.patternCount,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Detection Rules
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {TOTAL_PATTERN_COUNT} detection patterns across{" "}
          {TOTAL_CATEGORY_COUNT} threat categories. All rules are evaluated
          against each log line during analysis.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={setCategoryFilter}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {RULES_REGISTRY.map((cat) => (
              <SelectItem key={cat.category} value={cat.category}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severityFilter}
          onValueChange={setSeverityFilter}
        >
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
        <div className="flex gap-1.5 text-xs">
          <button
            onClick={expandAll}
            className="text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Expand all
          </button>
          <span className="text-muted-foreground">/</span>
          <button
            onClick={collapseAll}
            className="text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Results summary */}
      {(search || categoryFilter !== "all" || severityFilter !== "all") && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredPatternCount} pattern
          {filteredPatternCount !== 1 ? "s" : ""} across{" "}
          {filteredCategories.length} categor
          {filteredCategories.length !== 1 ? "ies" : "y"}
        </p>
      )}

      {/* Category Cards */}
      <div className="space-y-3">
        {filteredCategories.map((cat) => (
          <CategoryCard
            key={cat.category}
            category={cat}
            isExpanded={expanded.has(cat.category)}
            onToggle={() => toggleExpanded(cat.category)}
            highlightPattern={urlHighlight}
          />
        ))}

        {filteredCategories.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No rules match the current filters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function RulesPage() {
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
      <RulesContent />
    </Suspense>
  );
}

function CategoryCard({
  category,
  isExpanded,
  onToggle,
  highlightPattern,
}: {
  category: RuleCategory & { patterns: RuleCategory["patterns"] };
  isExpanded: boolean;
  onToggle: () => void;
  highlightPattern?: string | null;
}) {
  const scrollRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node) {
      // Small delay to let the collapsible finish opening
      setTimeout(() => node.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  }, []);
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    {category.label}
                    <Badge variant="secondary" className="text-xs">
                      {category.patternCount} pattern
                      {category.patternCount !== 1 ? "s" : ""}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {category.description}
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 shrink-0 ml-4">
                <Badge variant="outline" className="text-xs gap-1">
                  <Shield className="h-3 w-3" />
                  {category.mitreTactic}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <Crosshair className="h-3 w-3" />
                  {category.mitreTechnique}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Mobile MITRE badges */}
            <div className="flex flex-wrap gap-2 sm:hidden mb-4">
              <Badge variant="outline" className="text-xs gap-1">
                <Shield className="h-3 w-3" />
                {category.mitreTactic}
              </Badge>
              <Badge variant="outline" className="text-xs gap-1">
                <Crosshair className="h-3 w-3" />
                {category.mitreTechnique}
              </Badge>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Severity</TableHead>
                    <TableHead className="w-48">Label</TableHead>
                    <TableHead className="w-20">Confidence</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Description
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.patterns.map((pattern, idx) => (
                    <TableRow key={idx} ref={highlightPattern && highlightPattern.includes(pattern.label) ? scrollRef : undefined} className={highlightPattern && highlightPattern.includes(pattern.label) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <SeverityBadge severity={pattern.severity} />
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {pattern.label}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(pattern.confidence * 100)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono break-all">
                          {pattern.pattern}
                        </code>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-xs">
                        {pattern.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
