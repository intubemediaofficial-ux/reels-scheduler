import { describe, expect, it } from "vitest";
import { signOAuthState, verifyOAuthState } from "@/lib/providers/meta/oauth-state";

const SECRET = "test-secret";
const payload = { workspaceId: "ws-1", userId: "u-1", nonce: "n", issuedAt: 1_700_000_000_000 };

describe("Meta OAuth state", () => {
  it("verifies a freshly signed state", () => {
    const state = signOAuthState(payload, SECRET);
    const res = verifyOAuthState(state, SECRET, payload.issuedAt + 1000);
    expect(res).toEqual({ ok: true, payload });
  });

  it("rejects tampering, wrong secret, malformed input", () => {
    const state = signOAuthState(payload, SECRET);
    const [body, sig] = state.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, workspaceId: "ws-2" })).toString("base64url");
    expect(verifyOAuthState(`${forgedBody}.${sig}`, SECRET, payload.issuedAt).ok).toBe(false);
    expect(verifyOAuthState(state, "other", payload.issuedAt).ok).toBe(false);
    expect(verifyOAuthState("garbage", SECRET).ok).toBe(false);
    expect(verifyOAuthState(`${body}.`, SECRET).ok).toBe(false);
  });

  it("expires after 10 minutes, tolerates 60s clock skew, rejects far-future states", () => {
    const state = signOAuthState(payload, SECRET);
    expect(verifyOAuthState(state, SECRET, payload.issuedAt + 10 * 60 * 1000 + 1)).toMatchObject({ ok: false, reason: "expired" });
    expect(verifyOAuthState(state, SECRET, payload.issuedAt - 30_000).ok).toBe(true);
    expect(verifyOAuthState(state, SECRET, payload.issuedAt - 120_000).ok).toBe(false);
  });
});
