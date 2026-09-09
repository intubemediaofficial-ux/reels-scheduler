import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import type { SignedUpload, StorageProvider } from "./types";

/**
 * Disk-backed storage for single-server deployments. "Signed" URLs are HMAC
 * tokens verified by our own route handlers, so files are never served or
 * written without a valid, time-limited signature.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly root: string,
    private readonly appUrl: string,
    private readonly secret: string,
  ) {}

  private resolve(key: string): string {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }

  private sign(kind: "put" | "get", key: string, exp: number, extra = ""): string {
    return hmacSha256(`${kind}:${key}:${exp}:${extra}`, this.secret);
  }

  verify(kind: "put" | "get", key: string, exp: number, sig: string, extra = ""): boolean {
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    return safeEqual(sig, this.sign(kind, key, exp, extra));
  }

  async createSignedUpload({ key, contentType, contentLength }: { key: string; contentType: string; contentLength: number }): Promise<SignedUpload> {
    const exp = Date.now() + 6 * 60 * 60 * 1000;
    const sig = this.sign("put", key, exp, `${contentType}:${contentLength}`);
    const url = `${this.appUrl}/api/storage/put?key=${encodeURIComponent(key)}&exp=${exp}&len=${contentLength}&sig=${sig}`;
    return { url, method: "PUT", headers: { "Content-Type": contentType }, key, expiresAt: new Date(exp) };
  }

  async createSignedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    const exp = Date.now() + ttlSeconds * 1000;
    return `${this.appUrl}/api/storage/get?key=${encodeURIComponent(key)}&exp=${exp}&sig=${this.sign("get", key, exp)}`;
  }

  async write(key: string, body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<number> {
    if (!body) throw new Error("Empty body");
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    let written = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        written += chunk.byteLength;
        if (written > maxBytes) controller.error(new Error("File exceeds declared size"));
        else controller.enqueue(chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(body.pipeThrough(counter) as import("node:stream/web").ReadableStream), createWriteStream(file));
    } catch (e) {
      await rm(file, { force: true });
      throw e;
    }
    return written;
  }

  async head(key: string) {
    const file = this.resolve(key);
    try {
      const s = await stat(file);
      return { size: s.size, contentType: null };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async toLocalFile(key: string) {
    return { path: this.resolve(key), cleanup: async () => {} };
  }
}
