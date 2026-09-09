import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";

function keyFromBase64(b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)");
  }
  return key;
}

/** AES-256-GCM. Output: `v1.<iv>.<ciphertext>.<tag>` (all base64url). */
export function encryptSecret(plaintext: string, keyB64: string): string {
  const key = keyFromBase64(keyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, keyB64: string): string {
  const [version, ivB64, ctB64, tagB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || !ctB64 || !tagB64) {
    throw new Error("Malformed encrypted payload");
  }
  const key = keyFromBase64(keyB64);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
  return pt.toString("utf8");
}

/** Opaque random token for invitations / password resets. Store only its hash. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
