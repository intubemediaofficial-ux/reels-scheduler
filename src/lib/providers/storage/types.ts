export type SignedUpload = {
  /** Browser PUTs the file directly here; never through a Next.js request body. */
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  key: string;
  expiresAt: Date;
};

export interface StorageProvider {
  createSignedUpload(params: { key: string; contentType: string; contentLength: number }): Promise<SignedUpload>;
  /** Time-limited URL acceptable to Meta as `video_url`. */
  createSignedReadUrl(key: string, ttlSeconds: number): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  delete(key: string): Promise<void>;
}
