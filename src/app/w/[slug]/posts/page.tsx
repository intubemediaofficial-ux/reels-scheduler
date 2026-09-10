import Link from "next/link";
import type { PostStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { formatInTz } from "@/lib/format";
import { ALL_POST_STATUSES, POST_STATUS_LABEL, POST_STATUS_TONE, DEST_STATUS_TONE } from "@/lib/post-status";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Posts" };

export default async function PostsPage({ params, searchParams }: PageProps<"/w/[slug]/posts">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug, "posts.read");
  const status = typeof sp.status === "string" && (ALL_POST_STATUSES as string[]).includes(sp.status) ? (sp.status as PostStatus) : null;

  const [posts, counts] = await Promise.all([
    db.post.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      include: { schedule: true, destinations: { include: { socialAccount: { select: { displayName: true, platform: true } } } }, mediaAsset: { select: { originalFilename: true, durationSec: true } } },
    }),
    db.post.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id, deletedAt: null }, _count: { _all: true } }),
  ]);
  const countMap = new Map(counts.map((c) => [c.status, c._count._all]));

  return (
    <>
      <PageHeader title="Posts" description="Every Reel you are preparing, approving, scheduling or have published." actions={ctx.can("posts.create") ? <ButtonLink href={`/w/${slug}/library`}>New post from library</ButtonLink> : undefined} />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={`/w/${slug}/posts`} className={`rounded-full px-3 py-1 ${!status ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>All</Link>
        {ALL_POST_STATUSES.filter((s) => countMap.get(s)).map((s) => (
          <Link key={s} href={`/w/${slug}/posts?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {POST_STATUS_LABEL[s]} · {countMap.get(s)}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <EmptyState title="No posts yet" description="Upload videos to the Content Library, then select them and click Create posts." action={ctx.can("media.upload") ? <ButtonLink href={`/w/${slug}/library/upload`}>Upload videos</ButtonLink> : undefined} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Post</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Destinations</th>
                <th className="px-4 py-2">Scheduled</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {posts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/w/${slug}/posts/${p.id}`} className="font-medium text-slate-900 hover:underline">{p.title ?? p.mediaAsset.originalFilename}</Link>
                    <p className="text-xs text-slate-500">{p.mediaAsset.originalFilename}{p.mediaAsset.durationSec ? ` · ${Math.round(p.mediaAsset.durationSec)}s` : ""}</p>
                  </td>
                  <td className="px-4 py-2"><Badge tone={POST_STATUS_TONE[p.status]}>{POST_STATUS_LABEL[p.status]}</Badge></td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {p.destinations.length === 0 ? <span className="text-xs text-slate-400">None</span> : p.destinations.map((d) => (
                        <Badge key={d.id} tone={DEST_STATUS_TONE[d.status]}>{d.socialAccount.platform === "INSTAGRAM" ? "IG" : "FB"} {d.socialAccount.displayName}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-700">{p.schedule ? formatInTz(p.schedule.scheduledAt, p.schedule.timezone) : "—"}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{formatInTz(p.updatedAt, ctx.workspace.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
