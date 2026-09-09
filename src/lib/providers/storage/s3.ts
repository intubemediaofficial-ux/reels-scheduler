import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SignedUpload, StorageProvider } from "./types";

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    opts: { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint || undefined,
      forcePathStyle: Boolean(opts.endpoint),
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async createSignedUpload({ key, contentType, contentLength }: { key: string; contentType: string; contentLength: number }): Promise<SignedUpload> {
    const expiresIn = 6 * 60 * 60;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      { expiresIn },
    );
    return { url, method: "PUT", headers: { "Content-Type": contentType }, key, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  createSignedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds });
  }

  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async toLocalFile(key: string) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "reels-"));
    const file = path.join(dir, path.basename(key));
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!r.Body) throw new Error("Empty object");
    await pipeline(r.Body as Readable, createWriteStream(file));
    return { path: file, cleanup: () => rm(dir, { recursive: true, force: true }) };
  }
}
