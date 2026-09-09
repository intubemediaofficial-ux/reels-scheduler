import path from "node:path";
import { env } from "@/lib/env";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let cached: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (cached) return cached;
  const e = env();
  if (e.STORAGE_PROVIDER === "s3") {
    if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) throw new Error("STORAGE_PROVIDER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
    cached = new S3StorageProvider(e.S3_BUCKET, {
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    });
  } else {
    cached = new LocalStorageProvider(path.resolve(e.STORAGE_LOCAL_DIR), e.APP_URL, e.AUTH_SECRET);
  }
  return cached;
}

/** Only valid when STORAGE_PROVIDER=local; used by the /api/storage route handlers. */
export function localStorageOrNull(): LocalStorageProvider | null {
  const s = storage();
  return s instanceof LocalStorageProvider ? s : null;
}
