import { z } from "zod/v4";
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from "@/lib/constants";

export const uploadFileSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().max(MAX_FILE_SIZE, "File must be 10MB or less"),
  mimeType: z.string(),
});

export function validateFileExtension(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);
}
