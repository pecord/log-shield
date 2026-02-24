"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/constants";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

interface UploadFormProps {
  onUploadComplete?: () => void;
}

export function UploadForm({ onUploadComplete }: UploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const handleFile = (f: File) => {
    const error = validateFile(f);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, []);

  const handleUploadAndAnalyze = async () => {
    if (!file) return;
    setIsUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgress(30);
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }

      const upload = await uploadRes.json();
      setProgress(60);

      const analyzeRes = await fetch(`/api/uploads/${upload.id}/analyze`, {
        method: "POST",
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "Failed to start analysis");
      }

      setProgress(100);
      toast.success("Upload complete! Analysis started.");
      onUploadComplete?.();
      router.push(`/uploads/${upload.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Upload failed"
      );
      setIsUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      {!file ? (
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
            Drag and drop your log file here
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
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFile(null)}
            disabled={isUploading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isUploading && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-center text-xs text-muted-foreground">
            {progress < 50
              ? "Uploading file..."
              : progress < 100
                ? "Starting analysis..."
                : "Redirecting..."}
          </p>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!file || isUploading}
        onClick={handleUploadAndAnalyze}
      >
        {isUploading ? "Uploading..." : "Upload & Analyze"}
      </Button>
    </div>
  );
}
