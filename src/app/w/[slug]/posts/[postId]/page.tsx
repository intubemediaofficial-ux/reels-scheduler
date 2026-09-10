import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { storage } from "@/lib/providers/storage";
import { POST_STATUS_LABEL, POST_STATUS_TONE } from "@/lib/post-status";
import { Badge, PageHeader } from "@/components/ui";
import { getPost } from "@/server/services/post.service";
import { PostEditor, type PostEditorData } from "./post-editor";

export const metadata = { title: "Edit post" };

export default async function PostPage({ params }: PageProps<"/w/[slug]/posts/[postId]">) {
  const { slug, postId } = await params;
  const ctx = await requireWorkspace(slug, "posts.read");
  const [post, accounts] = await Promise.all([
    getPost(ctx, postId),
    db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null }, orderBy: [{ platform: "asc" }, { displayName: "asc" }] }),
  ]);
  const previewUrl = post.mediaAsset.storageStatus === "READY" ? await storage().createSignedReadUrl(post.mediaAsset.storageKey, 3600) : null;
  const s = post.mediaAsset.songMetadata;

  const data: PostEditorData = {
    id: post.id,
    title: post.title ?? post.mediaAsset.originalFilename,
    status: post.status,
    audioMode: post.audioMode,
    rejectionComment: post.rejectionComment,
    approvedBy: post.approvedBy?.name ?? post.approvedBy?.email ?? null,
    createdBy: post.createdBy.name ?? post.createdBy.email,
    previewUrl,
    asset: { id: post.mediaAsset.id, filename: post.mediaAsset.originalFilename, status: post.mediaAsset.storageStatus, durationSec: post.mediaAsset.durationSec, aspectRatio: post.mediaAsset.aspectRatio, copyrightConfirmed: Boolean(s?.copyrightConfirmed), songTitle: s?.songTitle ?? null, artist: s?.artist ?? null },
    captions: post.captions.map((c) => ({ id: c.id, platform: c.platform, kind: c.kind, language: c.language, text: c.text, hashtags: c.hashtags, callToAction: c.callToAction, aiGenerated: c.aiGenerated, aiModel: c.aiModel, isSelected: c.isSelected, createdAt: c.createdAt.toISOString() })),
    destinations: post.destinations.map((d) => ({
      id: d.id,
      socialAccountId: d.socialAccountId,
      status: d.status,
      permalink: d.permalink,
      metaMediaId: d.metaMediaId,
      publishedAt: d.publishedAt?.toISOString() ?? null,
      lastErrorClass: d.lastErrorClass,
      lastErrorMessage: d.lastErrorMessage,
      job: d.publishJobs[0] ? { status: d.publishJobs[0].status, attemptCount: d.publishJobs[0].attemptCount, maxAttempts: d.publishJobs[0].maxAttempts, nextRetryAt: d.publishJobs[0].nextRetryAt?.toISOString() ?? null, runAt: d.publishJobs[0].runAt.toISOString(), attempts: d.publishJobs[0].attempts.map((a) => ({ n: a.attemptNumber, success: a.success, errorClass: a.errorClass, errorMessage: a.errorMessage, at: a.startedAt.toISOString() })) } : null,
    })),
    accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, displayName: a.displayName, username: a.username, health: a.health })),
    schedule: post.schedule ? { scheduledAt: post.schedule.scheduledAt.toISOString(), timezone: post.schedule.timezone } : null,
    workspaceTimezone: ctx.workspace.timezone,
    approvalRequired: ctx.workspace.approvalRequired,
    can: {
      edit: ctx.can("posts.edit"),
      generate: ctx.can("captions.generate"),
      submit: ctx.can("posts.submit"),
      approve: ctx.can("posts.approve"),
      schedule: ctx.can("posts.schedule"),
      publish: ctx.can("posts.publish"),
      cancel: ctx.can("posts.cancel"),
    },
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-2 text-sm text-slate-500"><Link href={`/w/${slug}/posts`} className="hover:underline">Posts</Link> / {data.title}</div>
      <PageHeader title={data.title} description={`Created by ${data.createdBy}${data.approvedBy ? ` · approved by ${data.approvedBy}` : ""}`} actions={<Badge tone={POST_STATUS_TONE[post.status]}>{POST_STATUS_LABEL[post.status]}</Badge>} />
      <PostEditor slug={slug} post={data} />
    </div>
  );
}
