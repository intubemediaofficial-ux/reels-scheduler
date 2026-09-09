import type { AiCaptionProvider, CaptionRequest, CaptionResult } from "./types";

const EMOJI: Record<CaptionRequest["options"]["emojiLevel"], string[]> = {
  none: [],
  light: ["🎵", "🔥"],
  heavy: ["🎵", "🔥", "💃", "🎶", "❤️", "✨"],
};

/**
 * Template-based caption generator: deterministic, offline, and good enough to
 * ship real posts with. Also the fallback when the OpenAI provider fails.
 */
export class MockCaptionProvider implements AiCaptionProvider {
  async generateCaption(req: CaptionRequest): Promise<CaptionResult> {
    const { song, brand, options } = req;
    const title = song.title ?? "New Reel";
    const artist = song.artist ? ` by ${song.artist}` : "";
    const emo = EMOJI[options.emojiLevel];
    const e = (i: number) => (emo.length ? ` ${emo[i % emo.length]}` : "");

    const lines: Record<CaptionRequest["options"]["language"], string[]> = {
      EN: [
        `${title}${artist} is out now!${e(0)}`,
        options.length !== "short" ? `${moodLine(song.mood, "EN")} ${song.language ? `A ${song.language} ${song.genre ?? "song"} you'll have on repeat.` : ""}`.trim() : "",
        options.length === "promotional" ? `${song.label ? `Presented by ${song.label}. ` : ""}${song.album ? `From the album "${song.album}". ` : ""}Watch till the end!${e(1)}` : "",
      ],
      HI: [
        `${title}${song.artist ? ` — ${song.artist}` : ""} अब रिलीज़ हो गया है!${e(0)}`,
        options.length !== "short" ? `${moodLine(song.mood, "HI")} ${song.genre ? `${song.genre} का नया धमाका।` : ""}`.trim() : "",
        options.length === "promotional" ? `${song.label ? `${song.label} प्रस्तुत करता है। ` : ""}पूरा वीडियो ज़रूर देखें!${e(1)}` : "",
      ],
      HINGLISH: [
        `${title}${artist} out now!${e(0)}`,
        options.length !== "short" ? `${moodLine(song.mood, "HINGLISH")} ${song.genre ? `${song.genre} lovers, yeh wala miss mat karna.` : ""}`.trim() : "",
        options.length === "promotional" ? `${song.label ? `${song.label} presents. ` : ""}${song.album ? `Album: ${song.album}. ` : ""}Full video dekho aur share karo!${e(1)}` : "",
      ],
    };

    const cta = song.callToAction ?? brand.defaultCta ?? (options.language === "HI" ? "पूरा गाना सुनें — लिंक बायो में" : options.language === "EN" ? "Full song — link in bio" : "Full song link bio me");
    const avoid = new Set(brand.wordsToAvoid.map((w) => w.toLowerCase()));
    const body = lines[options.language]
      .filter(Boolean)
      .concat(cta, brand.requiredLegalText ?? "")
      .filter(Boolean)
      .map((l) => l.split(" ").filter((w) => !avoid.has(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))).join(" "))
      .join("\n\n");

    const hashtags = buildHashtags([...brand.defaultHashtags, ...(song.keywords ?? []), song.title, song.artist, song.genre, song.language, song.mood, "reels", "newsong", "trending"], options.hashtagCount);
    return { caption: body, hashtags, callToAction: cta, model: "template-v1" };
  }
}

function moodLine(mood: string | null | undefined, lang: CaptionRequest["options"]["language"]): string {
  const m = (mood ?? "").toLowerCase();
  const table: Record<string, Record<CaptionRequest["options"]["language"], string>> = {
    romantic: { EN: "A love song for your favourite person.", HI: "अपने खास के लिए एक प्यार भरा गाना।", HINGLISH: "Apne special ke liye ek pyaar bhara gaana." },
    sad: { EN: "For the nights that hit different.", HI: "उन रातों के लिए जो अलग सी लगती हैं।", HINGLISH: "Un raaton ke liye jo alag hi feel deti hain." },
    energetic: { EN: "Turn the volume up.", HI: "आवाज़ बढ़ाओ!", HINGLISH: "Volume full karo!" },
    party: { EN: "Your next party anthem.", HI: "आपकी अगली पार्टी का धमाका।", HINGLISH: "Next party ka anthem ready hai." },
    devotional: { EN: "Feel the devotion.", HI: "भक्ति में डूब जाइए।", HINGLISH: "Bhakti mein doob jao." },
  };
  return table[m]?.[lang] ?? "";
}

export function buildHashtags(candidates: (string | null | undefined)[], count: number): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const tag = "#" + c.replace(/^#/, "").replace(/[^\p{L}\p{N}]/gu, "");
    if (tag.length < 3 || out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    out.push(tag);
    if (out.length >= count) break;
  }
  return out;
}
