import { env } from "@/lib/env";
import { MockCaptionProvider } from "./mock";
import { OpenAiCaptionProvider } from "./openai";
import type { AiCaptionProvider, CaptionRequest, CaptionResult } from "./types";

const fallback = new MockCaptionProvider();
let cached: AiCaptionProvider | null = null;

export function captionProvider(): AiCaptionProvider {
  if (cached) return cached;
  const e = env();
  cached = e.AI_PROVIDER === "openai" && e.OPENAI_API_KEY ? new OpenAiCaptionProvider(e.OPENAI_API_KEY, e.AI_MODEL) : fallback;
  return cached;
}

/** Generate with the configured provider, falling back to templates on failure so the UI always gets something editable. */
export async function generateCaptionSafe(req: CaptionRequest): Promise<CaptionResult & { fellBack: boolean }> {
  const p = captionProvider();
  try {
    return { ...(await p.generateCaption(req)), fellBack: false };
  } catch (e) {
    if (p === fallback) throw e;
    console.warn("[ai] provider failed, using template:", e instanceof Error ? e.message : e);
    return { ...(await fallback.generateCaption(req)), fellBack: true };
  }
}
