"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/analysis/severity-badge";
import { CATEGORY_LABELS } from "@/lib/constants";
import { X, FileText } from "lucide-react";

export interface Finding {
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
  uploadId?: string;
  uploadFileName?: string;
}

interface FindingDetailDialogProps {
  finding: Finding | null;
  onClose: () => void;
}

export function FindingDetailDialog({
  finding,
  onClose,
}: FindingDetailDialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Close on Escape key
  useEffect(() => {
    if (!finding) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [finding, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          finding ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Centered panel */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
          finding
            ? "opacity-100 scale-100"
            : "pointer-events-none opacity-0 scale-95"
        }`}
        onClick={onClose}
      >
        <div className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              {finding && <SeverityBadge severity={finding.severity} />}
              <h3 className="text-lg font-semibold break-words">
                {finding?.title}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Close dialog"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Scrollable content */}
          <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
            {finding && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/rules?expand=${finding.category}&highlight=${encodeURIComponent(finding.title)}`}
                  >
                    <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                      {CATEGORY_LABELS[finding.category] || finding.category}
                    </Badge>
                  </Link>
                  <Badge
                    variant={
                      finding.source === "LLM" ? "default" : "secondary"
                    }
                  >
                    {finding.source === "LLM" ? "AI Detection" : "Rule-Based"}
                  </Badge>
                  {finding.confidence != null && (
                    <Badge
                      variant="outline"
                      className={
                        finding.confidence >= 0.8
                          ? "border-red-500 text-red-600 dark:text-red-400"
                          : finding.confidence >= 0.6
                            ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                            : ""
                      }
                    >
                      Confidence: {Math.round(finding.confidence * 100)}%
                    </Badge>
                  )}
                  {finding.lineNumber && (
                    <Badge variant="outline">
                      Line {finding.lineNumber}
                    </Badge>
                  )}
                  {finding.uploadId && finding.uploadFileName && (
                    <Link
                      href={`/uploads/${finding.uploadId}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      {finding.uploadFileName}
                    </Link>
                  )}
                </div>

                <div>
                  <h4 className="mb-1 text-sm font-semibold">Description</h4>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {finding.description}
                  </p>
                </div>

                {finding.lineContent && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">Log Line</h4>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                      {finding.lineContent}
                    </pre>
                  </div>
                )}

                {finding.matchedPattern && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">
                      Matched Pattern
                    </h4>
                    <code className="rounded bg-muted px-2 py-1 text-xs">
                      {finding.matchedPattern}
                    </code>
                  </div>
                )}

                {finding.recommendation && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">
                      Recommendation
                    </h4>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {finding.recommendation}
                    </p>
                  </div>
                )}

                {(finding.mitreTactic || finding.mitreTechnique) && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      MITRE ATT&CK
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {finding.mitreTactic && (
                        <Link
                          href={`/rules?expand=${finding.category}&highlight=${encodeURIComponent(finding.title)}`}
                        >
                          <Badge variant="outline" className="px-3 py-1 cursor-pointer hover:bg-muted">
                            {finding.mitreTactic}
                          </Badge>
                        </Link>
                      )}
                      {finding.mitreTechnique && (
                        <Link
                          href={`/rules?expand=${finding.category}&highlight=${encodeURIComponent(finding.title)}`}
                        >
                          <Badge variant="outline" className="px-3 py-1 cursor-pointer hover:bg-muted">
                            {finding.mitreTechnique}
                          </Badge>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
