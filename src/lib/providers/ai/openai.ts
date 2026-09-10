import { buildHashtags } from "./mock";
import type { AiCaptionProvider, CaptionRequest, CaptionResult } from "./types";

/** OpenAI Chat Completions with JSON output; no SDK dependency. */
export class OpenAiCaptionProvider implements AiCaptionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateCaption(req: CaptionRequest): Promise<CaptionResult> {
    const { song, brand, options } = req;
    const language = options.language === "HI" ? "Hindi (Devanagari script)" : options.language === "EN" ? "English" : "Hinglish (Hindi written in Latin script mixed with English)";
    const lengthHint = options.length === "short" ? "1 short line (max 15 words)" : options.length === "standard" ? "2-3 short lines (max 60 words)" : "3-5 lines with a promotional hook and CTA (max 120 words)";
    const emoji = options.emojiLevel === "none" ? "Do not use emojis." : options.emojiLevel === "light" ? "Use 1-2 emojis." : "Use emojis generously.";

    const system = `You write Instagram/Facebook Reels captions for a music label. Output strict JSON: {"caption": string, "hashtags": string[], "callToAction": string}. Never include hashtags inside "caption". Tone: ${options.tone}. Brand tone: ${brand.tone}. Language: ${language}. Length: ${lengthHint}. ${emoji} Produce exactly ${options.hashtagCount} relevant hashtags without the # symbol. ${brand.wordsToAvoid.length ? `Never use these words: ${brand.wordsToAvoid.join(", ")}.` : ""} ${brand.requiredLegalText ? `End the caption with this exact text: ${brand.requiredLegalText}` : ""}`;
    const user = JSON.stringify({
      song: { ...song, releaseDate: song.releaseDate?.toISOString().slice(0, 10) ?? null },
      brand: { name: brand.name, defaultCta: brand.defaultCta, defaultHashtags: brand.defaultHashtags },
    });

    const res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { caption?: string; hashtags?: string[]; callToAction?: string };
    if (!parsed.caption) throw new Error("OpenAI returned no caption");
    return {
      caption: parsed.caption.trim(),
      hashtags: buildHashtags([...(parsed.hashtags ?? []), ...brand.defaultHashtags], options.hashtagCount),
      callToAction: parsed.callToAction?.trim() || song.callToAction || brand.defaultCta || null,
      model: this.model,
    };
  }
}
