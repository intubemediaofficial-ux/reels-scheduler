import { describe, expect, it } from "vitest";
import { validateReel, type MediaProbe } from "@/lib/media/inspect";
import { LocalStorageProvider } from "@/lib/providers/storage/local";
import { toMetaError } from "@/lib/providers/meta/graph";
import { MockCaptionProvider } from "@/lib/providers/ai/mock";
import { resolveCaptionText } from "@/lib/captions";
import type { CaptionRequest } from "@/lib/providers/ai/types";

const rules = { minDurationSec: 3, maxDurationSec: 90, minWidth: 540, maxFileBytes: 500 * 1048576 };
const good: MediaProbe = { durationSec: 30, width: 1080, height: 1920, videoCodec: "h264", audioCodec: "aac", hasAudio: true, frameRate: 30, container: "mov,mp4" };

describe("validateReel", () => {
  it("accepts a 9:16 H.264 reel", () => {
    const r = validateReel(good, 10 * 1048576, rules);
    expect(r.errors).toEqual([]);
    expect(r.aspectRatio).toBe("9:16");
  });
  it("rejects too long / wrong codec / too large", () => {
    const r = validateReel({ ...good, durationSec: 200, videoCodec: "vp9" }, 600 * 1048576, rules);
    expect(r.errors.length).toBe(3);
  });
  it("warns on landscape", () => {
    const r = validateReel({ ...good, width: 1920, height: 1080 }, 1, rules);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/16:9/);
  });
});

describe("LocalStorageProvider signatures", () => {
  const p = new LocalStorageProvider("/tmp/x", "http://app", "s3cret");
  it("signed upload URL verifies and is bound to key/type/length", async () => {
    const up = await p.createSignedUpload({ key: "ws/a.mp4", contentType: "video/mp4", contentLength: 123 });
    const u = new URL(up.url);
    const exp = Number(u.searchParams.get("exp"));
    const sig = u.searchParams.get("sig")!;
    expect(p.verify("put", "ws/a.mp4", exp, sig, "video/mp4:123")).toBe(true);
    expect(p.verify("put", "ws/b.mp4", exp, sig, "video/mp4:123")).toBe(false);
    expect(p.verify("put", "ws/a.mp4", exp, sig, "video/mp4:999")).toBe(false);
    expect(p.verify("get", "ws/a.mp4", exp, sig)).toBe(false);
    expect(p.verify("put", "ws/a.mp4", Date.now() - 1, sig, "video/mp4:123")).toBe(false);
  });
  it("rejects path traversal keys", async () => {
    await expect(p.head("../etc/passwd")).rejects.toThrow();
  });
});

describe("toMetaError classification", () => {
  it("maps codes to retry classes", () => {
    expect(toMetaError({ error: { code: 190 } }, 400).classification).toBe("TOKEN_EXPIRED");
    const rl = toMetaError({ error: { code: 4 } }, 400);
    expect(rl.classification).toBe("RATE_LIMITED");
    expect(rl.retryable).toBe(true);
    expect(toMetaError({ error: { code: 200 } }, 400).classification).toBe("PERMISSION_MISSING");
    expect(toMetaError({ error: { code: 100 } }, 400).classification).toBe("VALIDATION");
    expect(toMetaError({}, 503).retryable).toBe(true);
  });
});

describe("MockCaptionProvider", () => {
  const base: CaptionRequest = {
    song: { title: "Tere Bina", artist: "Bainsla", label: "Bainsla Music", language: "Hindi", genre: "Romantic", mood: "soft", callToAction: "Full song out now", destinationUrl: null, keywords: ["love"] },
    brand: { name: "Bainsla Music", tone: "Friendly", defaultCta: null, defaultHashtags: ["bainslamusic"], wordsToAvoid: ["cheap"], requiredLegalText: null },
    options: { tone: "Romantic", language: "HINGLISH", length: "standard", hashtagCount: 5, emojiLevel: "light" },
  };
  it("produces caption + hashtags + CTA, respecting hashtag count and brand tags", async () => {
    const r = await new MockCaptionProvider().generateCaption(base);
    expect(r.caption).toMatch(/Tere Bina/);
    expect(r.hashtags.length).toBeLessThanOrEqual(5);
    expect(r.hashtags).toContain("#bainslamusic");
    expect(r.callToAction).toBe("Full song out now");
    expect(r.caption.toLowerCase()).not.toContain("cheap");
  });
  it("supports hindi and english", async () => {
    const hi = await new MockCaptionProvider().generateCaption({ ...base, options: { ...base.options, language: "HI" } });
    const en = await new MockCaptionProvider().generateCaption({ ...base, options: { ...base.options, language: "EN", emojiLevel: "none" } });
    expect(hi.caption).not.toEqual(en.caption);
    expect(en.caption).toMatch(/Tere Bina/);
  });
});

describe("resolveCaptionText", () => {
  const caps = [
    { platform: "INSTAGRAM", isSelected: true, text: "ig", hashtags: ["#a"], callToAction: "cta" },
    { platform: null, isSelected: true, text: "general", hashtags: [], callToAction: null },
  ];
  it("prefers platform-specific selected caption, falls back to general", () => {
    expect(resolveCaptionText(caps, "INSTAGRAM")).toBe("ig\n\ncta\n\n#a");
    expect(resolveCaptionText(caps, "FACEBOOK")).toBe("general");
    expect(resolveCaptionText([], "FACEBOOK")).toBeNull();
  });
});
