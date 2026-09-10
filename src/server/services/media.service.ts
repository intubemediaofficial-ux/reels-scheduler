import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { generateOpaqueToken } from "@/lib/crypto";
import { probeVideo, sha256File, validateReel } from "@/lib/media/inspect";
import { storage } from "@/lib/providers/storage";
import type { WorkspaceContext } from "@/lib/tenant";

const ALLOWED_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };

export function extensionFor(contentType: string, filename: string): string | null {
  if (ALLOWED_TYPES[contentType]) return ALLOWED_TYPES[contentType];
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "mov" ? ext : null;
}

export async function createBatch(ctx: WorkspaceContext, name?: string) {
  if (!ctx.can("media.upload")) throw forbidden();
  return db.uploadBatch.create({
    data: { workspaceId: ctx.workspace.id, createdById: ctx.userId, name: name?.trim() || `Upload ${new Date().toISOString().slice(0, 16).replace("T", " ")}` },
  });
}

/**
 * Reserve an asset row and hand back a signed direct-upload URL. Duplicate
 * detection happens here when the client pre-computed the hash, and again on
 * completion from the server-side hash.
 */
export async function initUpload(
  ctx: WorkspaceContext,
  input: { batchId: string | null; filename: string; contentType: string; sizeBytes: number; sha256?: string | null },
) {
  if (!ctx.can("media.upload")) throw forbidden();
  const e = env();
  const ext = extensionFor(input.contentType, input.filename);
  if (!ext) throw validation(`"${input.filename}": only MP4 or MOV video files are accepted.`);
  if (input.sizeBytes <= 0) throw validation(`"${input.filename}" is empty.`);
  if (input.sizeBytes > e.REEL_MAX_FILE_MB * 1048576) throw validation(`"${input.filename}" is larger than ${e.REEL_MAX_FILE_MB} MB.`);

  if (input.batchId) {
    const batch = await db.uploadBatch.findFirst({ where: { id: input.batchId, workspaceId: ctx.workspace.id }, select: { id: true } });
    if (!batch) throw notFound("Upload batch not found.");
  }

  if (input.sha256) {
    const dupe = await db.mediaAsset.findFirst({
      where: { workspaceId: ctx.workspace.id, sha256: input.sha256, deletedAt: null },
      select: { id: true, originalFilename: true },
    });
    if (dupe) throw conflict(`"${input.filename}" is already in your library as "${dupe.originalFilename}".`);
  }

  const used = await db.mediaAsset.aggregate({ where: { workspaceId: ctx.workspace.id, deletedAt: null }, _sum: { fileSizeBytes: true } });
  const usedBytes = Number(used._sum.fileSizeBytes ?? 0);
  if (usedBytes + input.sizeBytes > Number(ctx.workspace.storageLimitBytes)) throw validation("Workspace storage limit reached.");

  const key = `w/${ctx.workspace.id}/media/${new Date().toISOString().slice(0, 10)}/${generateOpaqueToken(12)}.${ext}`;
  const contentType = ALLOWED_TYPES[input.contentType] ? input.contentType : ext === "mov" ? "video/quicktime" : "video/mp4";
  const asset = await db.mediaAsset.create({
    data: {
      workspaceId: ctx.workspace.id,
      uploadedById: ctx.userId,
      batchId: input.batchId,
      originalFilename: input.filename.slice(0, 255),
      storageKey: key,
      mimeType: contentType,
      fileSizeBytes: BigInt(input.sizeBytes),
      storageStatus: "PENDING_UPLOAD",
    },
  });
  const upload = await storage().createSignedUpload({ key, contentType, contentLength: input.sizeBytes });
  return { assetId: asset.id, upload };
}

/** After the browser finished the PUT: verify, hash, probe and validate. */
export async function completeUpload(ctx: WorkspaceContext, assetId: string) {
  if (!ctx.can("media.upload")) throw forbidden();
  const asset = await db.mediaAsset.findFirst({ where: { id: assetId, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!asset) throw notFound("Upload not found.");
  if (asset.storageStatus !== "PENDING_UPLOAD" && asset.storageStatus !== "UPLOADED") return asset;

  const head = await storage().head(asset.storageKey);
  if (!head) throw validation("File was not received. Please retry the upload.");
  if (asset.fileSizeBytes && head.size !== Number(asset.fileSizeBytes)) {
    await storage().delete(asset.storageKey);
    await db.mediaAsset.update({ where: { id: asset.id }, data: { storageStatus: "INVALID", validationErrors: { errors: ["Uploaded size did not match."] } } });
    throw validation("Uploaded size did not match; please retry.");
  }

  await db.mediaAsset.update({ where: { id: asset.id }, data: { storageStatus: "INSPECTING" } });
  const { path, cleanup } = await storage().toLocalFile(asset.storageKey);
  try {
    const [hash, probe] = await Promise.all([sha256File(path), probeVideo(path).catch(() => null)]);

    const dupe = await db.mediaAsset.findFirst({
      where: { workspaceId: ctx.workspace.id, sha256: hash, deletedAt: null, id: { not: asset.id } },
      select: { originalFilename: true },
    });
    if (dupe) {
      await storage().delete(asset.storageKey);
      await db.mediaAsset.delete({ where: { id: asset.id } });
      throw conflict(`"${asset.originalFilename}" is already in your library as "${dupe.originalFilename}".`);
    }

    const e = env();
    const result = probe
      ? validateReel(probe, head.size, {
          minDurationSec: e.REEL_MIN_DURATION_SEC,
          maxDurationSec: e.REEL_MAX_DURATION_SEC,
          minWidth: e.REEL_MIN_WIDTH,
          maxFileBytes: e.REEL_MAX_FILE_MB * 1048576,
        })
      : { errors: ["File is not a readable video."], warnings: [], aspectRatio: null };

    const updated = await db.mediaAsset.update({
      where: { id: asset.id },
      data: {
        sha256: hash,
        durationSec: probe?.durationSec ?? null,
        width: probe?.width ?? null,
        height: probe?.height ?? null,
        aspectRatio: result.aspectRatio,
        videoCodec: probe?.videoCodec ?? null,
        audioCodec: probe?.audioCodec ?? null,
        hasAudio: probe?.hasAudio ?? null,
        frameRate: probe?.frameRate ?? null,
        storageStatus: result.errors.length ? "INVALID" : "READY",
        validationErrors: { errors: result.errors, warnings: result.warnings } as Prisma.InputJsonValue,
        songMetadata: { create: { songTitle: guessTitle(asset.originalFilename) } },
      },
    });
    await audit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.userId,
      action: "media.uploaded",
      targetType: "MediaAsset",
      targetId: asset.id,
      metadata: { filename: asset.originalFilename, size: head.size, status: updated.storageStatus },
    });
    return updated;
  } finally {
    await cleanup();
  }
}

function guessTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function deleteAsset(ctx: WorkspaceContext, assetId: string) {
  if (!ctx.can("media.delete")) throw forbidden();
  const asset = await db.mediaAsset.findFirst({
    where: { id: assetId, workspaceId: ctx.workspace.id, deletedAt: null },
    include: { posts: { where: { deletedAt: null, status: { in: ["SCHEDULED", "PUBLISHING"] } }, select: { id: true } } },
  });
  if (!asset) throw notFound("Video not found.");
  if (asset.posts.length) throw conflict("This video has scheduled or publishing posts. Cancel them first.");
  await db.mediaAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date(), storageStatus: "DELETED", sha256: null } });
  await storage().delete(asset.storageKey).catch(() => {});
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "media.deleted", targetType: "MediaAsset", targetId: asset.id, metadata: { filename: asset.originalFilename } });
}

export type SongMetadataInput = {
  songTitle?: string | null;
  artist?: string | null;
  album?: string | null;
  musicLabel?: string | null;
  language?: string | null;
  genre?: string | null;
  mood?: string | null;
  releaseDate?: Date | null;
  callToAction?: string | null;
  destinationUrl?: string | null;
  customKeywords?: string[];
  copyrightConfirmed?: boolean;
  internalNotes?: string | null;
};

/** Update metadata for one or many assets; undefined fields are left untouched. */
export async function updateSongMetadata(ctx: WorkspaceContext, assetIds: string[], input: SongMetadataInput) {
  if (!ctx.can("posts.edit")) throw forbidden();
  if (!assetIds.length) throw validation("Select at least one video.");
  const assets = await db.mediaAsset.findMany({ where: { id: { in: assetIds }, workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true } });
  if (assets.length !== assetIds.length) throw notFound("One or more videos were not found.");
  if (input.destinationUrl && !/^https?:\/\//i.test(input.destinationUrl)) throw validation("Destination URL must start with http:// or https://");

  const { copyrightConfirmed, ...rest } = input;
  const data: Prisma.SongMetadataUpdateInput = { ...rest };
  if (copyrightConfirmed !== undefined) {
    data.copyrightConfirmed = copyrightConfirmed;
    data.copyrightConfirmedById = copyrightConfirmed ? ctx.userId : null;
    data.copyrightConfirmedAt = copyrightConfirmed ? new Date() : null;
  }
  await db.$transaction(
    assets.map((a) =>
      db.songMetadata.upsert({
        where: { mediaAssetId: a.id },
        create: { mediaAssetId: a.id, ...rest, copyrightConfirmed: copyrightConfirmed ?? false, copyrightConfirmedById: copyrightConfirmed ? ctx.userId : null, copyrightConfirmedAt: copyrightConfirmed ? new Date() : null },
        update: data,
      }),
    ),
  );
}

export async function getReadUrl(ctx: WorkspaceContext, assetId: string, ttlSeconds = 3600) {
  const asset = await db.mediaAsset.findFirst({ where: { id: assetId, workspaceId: ctx.workspace.id, deletedAt: null }, select: { storageKey: true } });
  if (!asset) throw notFound("Video not found.");
  return storage().createSignedReadUrl(asset.storageKey, ttlSeconds);
}
