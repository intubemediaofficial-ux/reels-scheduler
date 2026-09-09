export type SignedUpload = {
  /** Browser PUTs the file directly here; never through a server action body. */
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  key: string;
  expiresAt: Date;
};

export interface StorageProvider {
  createSignedUpload(params: { key: string; contentType: string; contentLength: number }): Promise<SignedUpload>;
  /** Time-limited absolute URL acceptable to Meta as `video_url` / `file_url`. */
  createSignedReadUrl(key: string, ttlSeconds: number): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  delete(key: string): Promise<void>;
  /** Materialise the object on local disk for inspection (ffprobe/hash). Returns path + cleanup. */
  toLocalFile(key: string): Promise<{ path: string; cleanup: () => Promise<void> }>;
}
