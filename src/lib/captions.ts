export type CaptionLike = { text: string; hashtags: string[]; callToAction: string | null; isSelected: boolean; platform: string | null };

/** Resolve the caption to publish for a platform: selected platform-specific > selected general > any. */
export function resolveCaption(captions: CaptionLike[], platform: string): CaptionLike | null {
  return (
    captions.find((x) => x.isSelected && x.platform === platform) ??
    captions.find((x) => x.isSelected && x.platform === null) ??
    captions.find((x) => x.platform === null || x.platform === platform) ??
    null
  );
}

export function resolveCaptionText(captions: CaptionLike[], platform: string): string | null {
  const c = resolveCaption(captions, platform);
  if (!c) return null;
  const parts = [c.text.trim()];
  if (c.callToAction && !c.text.includes(c.callToAction)) parts.push(c.callToAction);
  if (c.hashtags.length) parts.push(c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
  return parts.join("\n\n");
}
