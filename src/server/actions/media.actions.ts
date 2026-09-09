"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/tenant";
import { runAction, validation, type ActionResult } from "@/lib/errors";
import type { SignedUpload } from "@/lib/providers/storage/types";
import { completeUpload, createBatch, deleteAsset, getReadUrl, initUpload, updateSongMetadata } from "@/server/services/media.service";

const uuid = z.string().uuid();

export async function createBatchAction(slug: string, name?: string): Promise<ActionResult<{ batchId: string }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "media.upload");
    const batch = await createBatch(ctx, name);
    return { batchId: batch.id };
  });
}

export async function initUploadAction(
  slug: string,
  input: { batchId: string | null; filename: string; contentType: string; sizeBytes: number; sha256?: string | null },
): Promise<ActionResult<{ assetId: string; upload: SignedUpload }>> {
  const schema = z.object({
    batchId: uuid.nullable(),
    filename: z.string().min(1).max(255),
    contentType: z.string().max(100),
    sizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
  });
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "media.upload");
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw validation("Invalid upload request.");
    return initUpload(ctx, parsed.data);
  });
}

export async function completeUploadAction(slug: string, assetId: string): Promise<ActionResult<{ status: string; errors: string[]; warnings: string[] }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "media.upload");
    const asset = await completeUpload(ctx, uuid.parse(assetId));
    const v = (asset.validationErrors ?? {}) as { errors?: string[]; warnings?: string[] };
    revalidatePath(`/w/${slug}/library`);
    return { status: asset.storageStatus, errors: v.errors ?? [], warnings: v.warnings ?? [] };
  });
}

export async function deleteAssetAction(slug: string, assetId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "media.delete");
    await deleteAsset(ctx, uuid.parse(assetId));
    revalidatePath(`/w/${slug}/library`);
    return undefined;
  });
}

const metadataSchema = z.object({
  songTitle: z.string().trim().max(200).optional(),
  artist: z.string().trim().max(200).optional(),
  album: z.string().trim().max(200).optional(),
  musicLabel: z.string().trim().max(200).optional(),
  language: z.string().trim().max(50).optional(),
  genre: z.string().trim().max(50).optional(),
  mood: z.string().trim().max(50).optional(),
  releaseDate: z.string().trim().optional(),
  callToAction: z.string().trim().max(200).optional(),
  destinationUrl: z.string().trim().max(500).optional(),
  customKeywords: z.string().trim().max(1000).optional(),
  copyrightConfirmed: z.enum(["on", "true", "false", ""]).optional(),
  internalNotes: z.string().trim().max(2000).optional(),
});

/**
 * Form-driven metadata save. In batch mode, blank fields mean "leave as is";
 * for a single asset blank fields clear the value.
 */
export async function saveSongMetadataAction(slug: string, assetIds: string[], mode: "single" | "batch", _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.edit");
    const parsed = metadataSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? "Invalid input.");
    const d = parsed.data;
    const pick = (v: string | undefined) => (v === undefined ? undefined : mode === "batch" && v === "" ? undefined : v || null);
    const ids = z.array(uuid).min(1).parse(assetIds);
    let releaseDate: Date | null | undefined;
    if (d.releaseDate !== undefined) {
      if (d.releaseDate === "") releaseDate = mode === "batch" ? undefined : null;
      else {
        releaseDate = new Date(d.releaseDate);
        if (Number.isNaN(releaseDate.getTime())) throw validation("Invalid release date.");
      }
    }
    const keywords = d.customKeywords === undefined || (mode === "batch" && d.customKeywords === "")
      ? undefined
      : d.customKeywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean).slice(0, 50);
    const checked = d.copyrightConfirmed === "on" || d.copyrightConfirmed === "true";
    const copyright = mode === "batch" ? (checked ? true : undefined) : formData.has("copyrightConfirmedPresent") ? checked : undefined;

    await updateSongMetadata(ctx, ids, {
      songTitle: pick(d.songTitle),
      artist: pick(d.artist),
      album: pick(d.album),
      musicLabel: pick(d.musicLabel),
      language: pick(d.language),
      genre: pick(d.genre),
      mood: pick(d.mood),
      releaseDate,
      callToAction: pick(d.callToAction),
      destinationUrl: pick(d.destinationUrl),
      customKeywords: keywords,
      copyrightConfirmed: copyright,
      internalNotes: pick(d.internalNotes),
    });
    revalidatePath(`/w/${slug}/library`);
    return undefined;
  });
}

export async function previewUrlAction(slug: string, assetId: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "media.read");
    return { url: await getReadUrl(ctx, uuid.parse(assetId), 900) };
  });
}
