import { hmacSha256, safeEqual } from "@/lib/crypto";

export type OAuthStatePayload = {
  workspaceId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
};

const STATE_TTL_MS = 10 * 60 * 1000;

/** `base64url(json).signature` — signed so the callback can trust workspace/user without a DB lookup. */
export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacSha256(body, secret)}`;
}

export type OAuthStateVerification =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyOAuthState(state: string, secret: string, now = Date.now()): OAuthStateVerification {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!safeEqual(sig, hmacSha256(body, secret))) return { ok: false, reason: "bad_signature" };

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.workspaceId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.issuedAt !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (now - payload.issuedAt > STATE_TTL_MS || payload.issuedAt > now + 60_000) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
