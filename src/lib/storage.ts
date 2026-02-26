import { createReadStream, createWriteStream, type ReadStream } from "fs";
import { writeFile, unlink, readFile, mkdir } from "fs/promises";
import { join, dirname, resolve, normalize } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

/**
 * Storage abstraction for file persistence.
 *
 * The local implementation writes to the filesystem (suitable for traditional
 * server deployments). For serverless platforms (Vercel, AWS Lambda), swap in
 * an S3-compatible provider that implements the same interface.
 *
 * Usage:
 *   const storage = getStorageProvider();
 *   await storage.write("uploads/user123/file.log", buffer);
 *   const stream = storage.createReadStream("uploads/user123/file.log");
 */
export interface StorageProvider {
  write(relativePath: string, data: Buffer): Promise<void>;
  /** Stream data directly to storage without buffering the entire file in memory. */
  writeStream(relativePath: string, stream: Readable): Promise<void>;
  read(relativePath: string): Promise<Buffer>;
  createReadStream(relativePath: string): ReadStream;
  delete(relativePath: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
  }

  private resolve(relativePath: string): string {
    const fullPath = resolve(this.basePath, relativePath);
    const normalBase = normalize(this.basePath);
    if (!fullPath.startsWith(normalBase)) {
      throw new Error("Path traversal detected");
    }
    return fullPath;
  }

  async write(relativePath: string, data: Buffer): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async writeStream(relativePath: string, stream: Readable): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await pipeline(stream, createWriteStream(fullPath));
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.resolve(relativePath));
  }

  createReadStream(relativePath: string): ReadStream {
    return createReadStream(this.resolve(relativePath), { encoding: "utf-8" } as Parameters<typeof createReadStream>[1]);
  }

  async delete(relativePath: string): Promise<void> {
    await unlink(this.resolve(relativePath));
  }
}

// Singleton — swap implementation here for S3/R2/GCS providers
let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    _provider = new LocalStorageProvider();
  }
  return _provider;
}

import { S3StorageProvider, type S3Config } from "./storage-s3";

/**
 * Resolve storage provider for a specific user.
 * Returns S3StorageProvider if user has configured S3, otherwise local.
 */
export function getStorageProviderForUser(
  s3Config: S3Config | null
): StorageProvider {
  if (s3Config) {
    return new S3StorageProvider(s3Config);
  }
  return getStorageProvider();
}
