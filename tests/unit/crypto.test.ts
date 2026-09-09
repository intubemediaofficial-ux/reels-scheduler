import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateOpaqueToken, safeEqual, sha256Hex } from "@/lib/crypto";
import { sanitizeAuditMetadata } from "@/lib/audit";

const KEY = Buffer.alloc(32, 1).toString("base64");

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("EAAB.long.lived.token", KEY);
    const b = encryptSecret("EAAB.long.lived.token", KEY);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret(a, KEY)).toBe("EAAB.long.lived.token");
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const enc = encryptSecret("secret", KEY);
    const parts = enc.split(".");
    parts[2] = parts[2].replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(() => decryptSecret(parts.join("."), KEY)).toThrow();
    expect(() => decryptSecret(enc, Buffer.alloc(32, 2).toString("base64"))).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptSecret("x", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("opaque tokens are unique and hashes are stable", () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
    expect(sha256Hex("a")).toBe(sha256Hex("a"));
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("audit metadata sanitizer", () => {
  it("redacts credential-looking keys recursively", () => {
    const out = sanitizeAuditMetadata({
      email: "a@b.c",
      accessToken: "EAAB",
      nested: { client_secret: "x", ok: 1, list: [{ password: "p" }] },
    });
    expect(JSON.stringify(out)).not.toMatch(/EAAB|"x"|"p"/);
    expect(JSON.stringify(out)).toContain("a@b.c");
  });
});
