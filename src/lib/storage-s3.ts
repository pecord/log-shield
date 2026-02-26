import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import type { ReadStream } from "fs";
import type { StorageProvider } from "./storage";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathPrefix?: string;
  forcePathStyle?: boolean;
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private pathPrefix: string;

  constructor(config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    });
    this.bucket = config.bucket;
    this.pathPrefix = config.pathPrefix || "";
  }

  private key(relativePath: string): string {
    return this.pathPrefix + relativePath;
  }

  async write(relativePath: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
        Body: data,
      })
    );
  }

  async writeStream(relativePath: string, stream: Readable): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
        Body: stream,
      })
    );
  }

  async read(relativePath: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
      })
    );
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  createReadStream(relativePath: string): ReadStream {
    const readable = new Readable({ read() {} });

    this.client
      .send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.key(relativePath),
        })
      )
      .then((response) => {
        const body = response.Body as Readable;
        body.on("data", (chunk) => readable.push(chunk));
        body.on("end", () => readable.push(null));
        body.on("error", (err) => readable.destroy(err));
      })
      .catch((err) => readable.destroy(err));

    // readline accepts any Readable; cast for StorageProvider interface compat
    return readable as unknown as ReadStream;
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
      })
    );
  }

  async testConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
