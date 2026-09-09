import type { CaptionLanguage } from "@prisma/client";

export type CaptionTone = "Energetic" | "Devotional" | "Romantic" | "Professional" | "Luxury" | "Friendly";

export type CaptionRequest = {
  song: {
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    label?: string | null;
    language?: string | null;
    genre?: string | null;
    mood?: string | null;
    releaseDate?: Date | null;
    callToAction?: string | null;
    destinationUrl?: string | null;
    keywords: string[];
  };
  brand: {
    name?: string | null;
    tone: string;
    defaultCta?: string | null;
    defaultHashtags: string[];
    wordsToAvoid: string[];
    requiredLegalText?: string | null;
  };
  options: {
    tone: CaptionTone;
    language: CaptionLanguage;
    length: "short" | "standard" | "promotional";
    hashtagCount: number;
    emojiLevel: "none" | "light" | "heavy";
  };
};

export type CaptionResult = {
  caption: string;
  hashtags: string[];
  callToAction: string | null;
  model: string;
};

export interface AiCaptionProvider {
  generateCaption(req: CaptionRequest): Promise<CaptionResult>;
}
