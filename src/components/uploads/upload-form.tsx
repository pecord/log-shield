"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/constants";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

type FileStatus = "pending" | "uploading" | "analyzing" | "done" | "error";

interface QueuedFile {
  file: File;
  status: FileStatus;
  error?: string;
  uploadId?: string;
}

interface UploadFormProps {
  onUploadComplete?: () => void;
}

export function UploadForm({ onUploadComplete }: UploadFormProps) {
  const router = useRouter();
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const validateFile = (f: File): string | null => {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return "Invalid file type. Accepted: .txt, .log, .csv, .jsonl";
    }
    if (f.size > MAX_FILE_SIZE) {
      return "File is too large. Maximum size is 10MB.";
    }
    if (f.size === 0) {
      return "File is empty.";
    }
    return null;
  };

  const addFiles = (newFiles: FileList | File[]) => {
    const toAdd: QueuedFile[] = [];
    const errors: string[] = [];

    for (const f of Array.from(newFiles)) {
      const error = validateFile(f);
      if (error) {
        errors.push(`${f.name}: ${error}`);
      } else {
        // Skip duplicates by name+size
        const isDupe = files.some(
          (q) => q.file.name === f.name && q.file.size === f.size
        );
        if (!isDupe) {
          toAdd.push({ file: f, status: "pending" });
        }
      }
    }

    if (errors.length === 1) {
      toast.error(errors[0]);
    } else if (errors.length > 1) {
      toast.error(`${errors.length} files rejected`, {
        description: errors.join("\n"),
      });
    }

    if (toAdd.length > 0) {
      setFiles((prev) => [...prev, ...toAdd]);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [files]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFile = (index: number, updates: Partial<QueuedFile>) => {
    setFiles((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updates } : q))
    );
  };

  const handleUploadAll = async () => {
    const pending = files.filter((q) => q.status === "pending");
    if (pending.length === 0) return;

    setIsProcessing(true);
    let lastUploadId: string | undefined;

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;

      // Upload
      updateFile(i, { status: "uploading" });
      try {
        const formData = new FormData();
        formData.append("file", files[i].file);

        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || "Upload failed");
        }

        const upload = await uploadRes.json();
        updateFile(i, { status: "analyzing", uploadId: upload.id });
        lastUploadId = upload.id;

        // Analyze
        const analyzeRes = await fetch(`/api/uploads/${upload.id}/analyze`, {
          method: "POST",
        });

        if (!analyzeRes.ok) {
          const err = await analyzeRes.json();
          throw new Error(err.error || "Failed to start analysis");
        }

        updateFile(i, { status: "done" });
      } catch (error) {
        updateFile(i, {
          status: "error",
          error: error instanceof Error ? error.message : "Failed",
        });
      }
    }

    setIsProcessing(false);

    const results = files.map((q) =>
      q.status === "pending" ? q : q
    );
    // Re-read latest state
    const doneCount = document.querySelectorAll(
      '[data-status="done"]'
    ).length;

    onUploadComplete?.();

    // Navigate to the last successful upload, or stay on uploads page
    if (lastUploadId && pending.length === 1) {
      toast.success("Upload complete! Analysis started.");
      router.push(`/uploads/${lastUploadId}`);
    } else {
      const failCount = files.filter((q) => q.status === "error").length;
      if (failCount > 0) {
        toast.warning(
          `${pending.length - failCount} of ${pending.length} files uploaded`
        );
      } else {
        toast.success(
          `${pending.length} file${pending.length > 1 ? "s" : ""} uploaded and queued for analysis`
        );
      }
    }
  };

  const overallProgress = (() => {
    if (files.length === 0) return 0;
    const weights: Record<FileStatus, number> = {
      pending: 0,
      uploading: 0.3,
      analyzing: 0.7,
      done: 1,
      error: 1,
    };
    const total = files.reduce((sum, q) => sum + weights[q.status], 0);
    return Math.round((total / files.length) * 100);
  })();

  const pendingCount = files.filter((q) => q.status === "pending").length;
  const errorCount = files.filter((q) => q.status === "error").length;

  const retryFailed = () => {
    setFiles((prev) =>
      prev.map((q) => (q.status === "error" ? { ...q, status: "pending" as FileStatus, error: undefined } : q))
    );
  };

  return (
    <div className="space-y-4">
      {/* Drop zone — always visible */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
      >
        <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="mb-2 text-sm font-medium">
          Drag and drop your log file{files.length > 0 ? "s" : ""} here
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          Supports .txt, .log, .csv, and .jsonl files up to 10MB
        </p>
        <label>
          <Button variant="outline" asChild>
            <span>Browse Files</span>
          </Button>
          <input
            type="file"
            accept=".txt,.log,.csv,.jsonl"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                addFiles(e.target.files);
              }
              // Reset so re-selecting the same file works
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((q, i) => (
            <div
              key={`${q.file.name}-${q.file.size}-${i}`}
              data-status={q.status}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <FileStatus status={q.status} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{q.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(q.file.size)}
                    {q.error && (
                      <span className="ml-2 text-red-500">{q.error}</span>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Remove ${q.file.name}`}
                onClick={() => removeFile(i)}
                disabled={q.status === "uploading" || q.status === "analyzing"}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {isProcessing && (
        <div className="space-y-2">
          <Progress value={overallProgress} />
          <p className="text-center text-xs text-muted-foreground">
            Processing {files.length} file{files.length > 1 ? "s" : ""}...
          </p>
        </div>
      )}

      {/* Upload button */}
      {errorCount > 0 && pendingCount === 0 && !isProcessing ? (
        <Button className="w-full" variant="outline" onClick={retryFailed}>
          Retry Failed ({errorCount} file{errorCount > 1 ? "s" : ""})
        </Button>
      ) : (
        <Button
          className="w-full"
          disabled={pendingCount === 0 || isProcessing}
          onClick={handleUploadAll}
        >
          {isProcessing
            ? "Uploading..."
            : pendingCount === 0 && files.length > 0
              ? "All files processed"
              : `Upload & Analyze${pendingCount > 1 ? ` (${pendingCount} files)` : ""}`}
        </Button>
      )}
    </div>
  );
}

function FileStatus({ status }: { status: FileStatus }) {
  switch (status) {
    case "uploading":
    case "analyzing":
      return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />;
    case "done":
      return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />;
    case "error":
      return <XCircle className="h-5 w-5 shrink-0 text-red-500" />;
    default:
      return <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />;
  }
}
