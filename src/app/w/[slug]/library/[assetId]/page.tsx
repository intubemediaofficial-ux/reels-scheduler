import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { storage } from "@/lib/providers/storage";
import { Badge, Card, PageHeader } from "@/components/ui";
import { MetadataForm } from "../metadata-form";
import { AssetActions } from "./asset-actions";

export default async function AssetPage({ params }: PageProps<"/w/[slug]/library/[assetId]">) {
  const { slug, assetId } = await params;
  const ctx = await requireWorkspace(slug, "media.read");
  const asset = await db.mediaAsset.findFirst({
    where: { id: assetId, workspaceId: ctx.workspace.id, deletedAt: null },
    include: { songMetadata: true, posts: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, title: true, createdAt: true } } },
  });
  if (!asset) notFound();

  const v = (asset.validationErrors as { errors?: string[]; warnings?: string[] } | null) ?? {};
  const previewUrl = asset.storageStatus === "READY" || asset.storageStatus === "INVALID" ? await storage().createSignedReadUrl(asset.storageKey, 1800) : null;
  const m = asset.songMetadata;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={m?.songTitle || asset.originalFilename}
        description={asset.originalFilename}
        actions={<AssetActions slug={slug} assetId={asset.id} canDelete={ctx.can("media.delete")} canCreatePost={ctx.can("posts.create") && asset.storageStatus === "READY"} />}
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          {previewUrl ? (
            <video src={previewUrl} controls playsInline className="aspect-[9/16] w-full rounded-xl bg-black" />
          ) : (
            <div className="aspect-[9/16] w-full rounded-xl bg-slate-200" />
          )}
          <Card title="Video details">
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Status</dt>
              <dd><Badge tone={asset.storageStatus === "READY" ? "green" : asset.storageStatus === "INVALID" ? "red" : "amber"}>{asset.storageStatus}</Badge></dd>
              <dt className="text-slate-500">Duration</dt>
              <dd>{asset.durationSec ? `${asset.durationSec.toFixed(1)}s` : "—"}</dd>
              <dt className="text-slate-500">Resolution</dt>
              <dd>{asset.width && asset.height ? `${asset.width}×${asset.height} (${asset.aspectRatio})` : "—"}</dd>
              <dt className="text-slate-500">Codecs</dt>
              <dd>{asset.videoCodec ?? "—"} / {asset.audioCodec ?? (asset.hasAudio === false ? "no audio" : "—")}</dd>
              <dt className="text-slate-500">Frame rate</dt>
              <dd>{asset.frameRate ?? "—"}</dd>
              <dt className="text-slate-500">Size</dt>
              <dd>{(Number(asset.fileSizeBytes ?? 0) / 1048576).toFixed(1)} MB</dd>
              <dt className="text-slate-500">Uploaded</dt>
              <dd>{asset.createdAt.toLocaleString("en-IN", { timeZone: ctx.workspace.timezone })}</dd>
            </dl>
            {v.errors?.length ? <ul className="mt-3 list-disc pl-4 text-xs text-rose-600">{v.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
            {v.warnings?.length ? <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{v.warnings.map((e) => <li key={e}>{e}</li>)}</ul> : null}
          </Card>
          {asset.posts.length ? (
            <Card title="Posts using this video">
              <ul className="space-y-1 text-sm">
                {asset.posts.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <Link href={`/w/${slug}/posts/${p.id}`} className="truncate text-indigo-700 hover:underline">{p.title || "Untitled post"}</Link>
                    <Badge>{p.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <Card title="Song metadata" description="Used to generate captions, hashtags and calls to action.">
          <MetadataForm
            slug={slug}
            assetIds={[asset.id]}
            mode="single"
            canEdit={ctx.can("posts.edit")}
            initial={{
              songTitle: m?.songTitle,
              artist: m?.artist,
              album: m?.album,
              musicLabel: m?.musicLabel,
              language: m?.language,
              genre: m?.genre,
              mood: m?.mood,
              releaseDate: m?.releaseDate ? m.releaseDate.toISOString().slice(0, 10) : "",
              callToAction: m?.callToAction,
              destinationUrl: m?.destinationUrl,
              customKeywords: m?.customKeywords ?? [],
              copyrightConfirmed: m?.copyrightConfirmed ?? false,
              internalNotes: m?.internalNotes,
            }}
          />
        </Card>
      </div>
    </div>
  );
}
