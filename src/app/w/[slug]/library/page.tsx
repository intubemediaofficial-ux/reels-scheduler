import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { LibraryGrid, type LibraryItem } from "./library-grid";

export default async function LibraryPage({ params }: PageProps<"/w/[slug]/library">) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug, "media.read");
  const assets = await db.mediaAsset.findMany({
    where: { workspaceId: ctx.workspace.id, deletedAt: null, storageStatus: { not: "PENDING_UPLOAD" } },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { songMetadata: true, _count: { select: { posts: { where: { deletedAt: null } } } } },
  });

  const items: LibraryItem[] = assets.map((a) => ({
    id: a.id,
    filename: a.originalFilename,
    status: a.storageStatus,
    sizeMb: Number(a.fileSizeBytes ?? 0) / 1048576,
    durationSec: a.durationSec,
    aspectRatio: a.aspectRatio,
    createdAt: a.createdAt.toISOString(),
    songTitle: a.songMetadata?.songTitle ?? null,
    artist: a.songMetadata?.artist ?? null,
    copyrightConfirmed: a.songMetadata?.copyrightConfirmed ?? false,
    postCount: a._count.posts,
    errors: ((a.validationErrors as { errors?: string[] } | null)?.errors ?? []).slice(0, 1),
  }));

  return (
    <div>
      <PageHeader
        title="Content Library"
        description="All uploaded Reel videos for this workspace."
        actions={ctx.can("media.upload") ? <ButtonLink href={`/w/${slug}/library/upload`}>Upload videos</ButtonLink> : undefined}
      />
      {items.length ? (
        <LibraryGrid slug={slug} items={items} canEdit={ctx.can("posts.edit")} canCreatePosts={ctx.can("posts.create")} />
      ) : (
        <EmptyState
          title="No videos yet"
          description="Upload your first batch of Reels to get started."
          action={ctx.can("media.upload") ? <ButtonLink href={`/w/${slug}/library/upload`}>Upload videos</ButtonLink> : undefined}
        />
      )}
    </div>
  );
}
