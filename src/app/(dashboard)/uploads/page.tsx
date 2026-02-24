"use client";

import { useEffect, useState } from "react";
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
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Trash2, ChevronDown, ChevronUp } from "lucide-react";
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
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function UploadsPage() {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchUploads = () => {
    fetch("/api/uploads?limit=50")
      .then((res) => res.json())
      .then((data) => {
        setUploads(data.uploads);
        // Auto-expand upload form when there are no uploads
        if (data.uploads.length === 0) {
          setShowUpload(true);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Uploads</h2>
          <p className="text-muted-foreground">
            Upload and manage your log files
          </p>
        </div>
        {uploads.length > 0 && (
          <Button
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

      {uploads.length === 0 && !showUpload ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">No uploads yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload your first log file to start analyzing threats.
          </p>
          <Button onClick={() => setShowUpload(true)}>Upload Log File</Button>
        </div>
      ) : uploads.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map((upload) => (
                <TableRow key={upload.id}>
                  <TableCell>
                    <Link
                      href={`/uploads/${upload.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {upload.fileName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatBytes(upload.fileSize)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {upload.lineCount?.toLocaleString() || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        upload.status === "COMPLETED"
                          ? "default"
                          : upload.status === "FAILED"
                            ? "destructive"
                            : upload.status === "ANALYZING"
                              ? "secondary"
                              : "outline"
                      }
                    >
                      {upload.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {upload.analysisResult ? (
                      <div className="flex items-center gap-1">
                        <span>{upload.analysisResult.totalFindings}</span>
                        {upload.analysisResult.criticalCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {upload.analysisResult.criticalCount} critical
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(upload.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(upload.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
