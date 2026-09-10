import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { Card, PageHeader } from "@/components/ui";
import { MetadataForm } from "../metadata-form";
import { CreatePostsButton } from "./create-posts-button";

export default async function BatchMetadataPage({ params, searchParams }: PageProps<"/w/[slug]/library/batch">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug, "posts.edit");
  const raw = typeof sp.ids === "string" ? sp.ids : "";
  const ids = raw.split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  const nextIsPosts = sp.next === "posts" && ctx.can("posts.create");
  const assets = ids.length
    ? await db.mediaAsset.findMany({ where: { id: { in: ids }, workspaceId: ctx.workspace.id, deletedAt: null }, include: { songMetadata: true }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={nextIsPosts ? "Step 2 of 3 · Song details" : `Edit metadata for ${assets.length} videos`}
        description={nextIsPosts ? "Add song title / artist and confirm copyright, press Save, then create posts." : "Fill only the fields you want to apply to every selected video."}
      />
      {assets.length ? (
        <div className="space-y-4">
          <Card title="Selected videos">
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm text-slate-700">
              {assets.map((a) => (
                <li key={a.id} className="truncate">
                  <Link href={`/w/${slug}/library/${a.id}`} className="hover:underline">{a.songMetadata?.songTitle || a.originalFilename}</Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <MetadataForm slug={slug} assetIds={assets.map((a) => a.id)} mode="batch" canEdit initial={{}} />
          </Card>
          {nextIsPosts ? (
            <Card title="Step 3 · Create posts" description="One post per video. Each post opens an editor for caption, destinations, approval and scheduling.">
              <CreatePostsButton slug={slug} assetIds={assets.filter((a) => a.storageStatus === "READY").map((a) => a.id)} />
            </Card>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No videos selected. <Link href={`/w/${slug}/library`} className="text-indigo-700 hover:underline">Back to library</Link></p>
      )}
    </div>
  );
}
