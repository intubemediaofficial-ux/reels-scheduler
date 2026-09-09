import type { CaptionKind, CaptionLanguage, PostStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, type AuditAction } from "@/lib/audit";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { isValidTimezone } from "@/lib/timezones";
import { generateCaptionSafe } from "@/lib/providers/ai";
import type { CaptionTone } from "@/lib/providers/ai/types";
import type { WorkspaceContext } from "@/lib/tenant";
import { resolveCaptionText } from "@/lib/captions";
import { notify } from "@/server/services/notification.service";
import { enqueueJobsForPost, cancelJobsForPost } from "@/server/services/publish.service";

/** Allowed state transitions. Anything not listed is rejected server-side. */
const TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "DRAFT", "CANCELLED"],
  APPROVED: ["SCHEDULED", "DRAFT", "CANCELLED"],
  SCHEDULED: ["PUBLISHING", "APPROVED", "CANCELLED"],
  PUBLISHING: ["PUBLISHED", "PARTIALLY_PUBLISHED", "FAILED"],
  PUBLISHED: [],
  PARTIALLY_PUBLISHED: ["SCHEDULED", "CANCELLED"],
  FAILED: ["SCHEDULED", "APPROVED", "DRAFT", "CANCELLED"],
  REJECTED: ["DRAFT", "CANCELLED"],
  CANCELLED: ["DRAFT"],
};

/** Statuses in which content is still editable (and edits force re-approval). */
const EDITABLE: PostStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "FAILED", "CANCELLED"];

export async function createPostsFromAssets(ctx: WorkspaceContext, assetIds: string[]) {
  if (!ctx.can("posts.create")) throw forbidden();
  const assets = await db.mediaAsset.findMany({
    where: { id: { in: assetIds }, workspaceId: ctx.workspace.id, deletedAt: null, storageStatus: "READY" },
    include: { songMetadata: true },
  });
  if (!assets.length) throw validation("Select at least one ready video.");
  const posts = await db.$transaction(
    assets.map((a) =>
      db.post.create({
        data: { workspaceId: ctx.workspace.id, mediaAssetId: a.id, createdById: ctx.userId, title: a.songMetadata?.songTitle || a.originalFilename, status: "DRAFT" },
      }),
    ),
  );
  for (const p of posts) await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "post.created", targetType: "Post", targetId: p.id });
  return posts;
}

export async function getPost(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.read")) throw forbidden();
  const post = await db.post.findFirst({
    where: { id: postId, workspaceId: ctx.workspace.id, deletedAt: null },
    include: {
      mediaAsset: { include: { songMetadata: true } },
      captions: { orderBy: { createdAt: "desc" } },
      destinations: { include: { socialAccount: true, publishJobs: { orderBy: { createdAt: "desc" }, take: 1, include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 3 } } } } },
      schedule: true,
      createdBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } },
    },
  });
  if (!post) throw notFound("Post not found.");
  return post;
}

async function loadEditable(ctx: WorkspaceContext, postId: string) {
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id, deletedAt: null }, include: { schedule: true } });
  if (!post) throw notFound("Post not found.");
  if (!EDITABLE.includes(post.status)) throw conflict(`Post is ${post.status.toLowerCase().replace("_", " ")} and cannot be edited. Cancel or unschedule it first.`);
  return post;
}

/** Content edits invalidate a previous approval. */
async function contentChanged(ctx: WorkspaceContext, postId: string, status: PostStatus) {
  if (status === "APPROVED" || status === "PENDING_APPROVAL" || status === "REJECTED") {
    await db.post.update({ where: { id: postId }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
  }
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "post.updated", targetType: "Post", targetId: postId });
}

export async function updatePostBasics(ctx: WorkspaceContext, postId: string, input: { title?: string; audioMode?: "EMBEDDED" | "PLATFORM" }) {
  if (!ctx.can("posts.edit")) throw forbidden();
  const post = await loadEditable(ctx, postId);
  await db.post.update({ where: { id: post.id }, data: input });
  await contentChanged(ctx, post.id, post.status);
}

export async function setDestinations(ctx: WorkspaceContext, postId: string, socialAccountIds: string[]) {
  if (!ctx.can("posts.edit")) throw forbidden();
  const post = await loadEditable(ctx, postId);
  const accounts = await db.socialAccount.findMany({ where: { id: { in: socialAccountIds }, workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true } });
  if (accounts.length !== new Set(socialAccountIds).size) throw notFound("One or more accounts were not found.");
  const keep = accounts.map((a) => a.id);
  await db.$transaction([
    db.postDestination.deleteMany({ where: { postId: post.id, socialAccountId: { notIn: keep }, status: { in: ["PENDING", "FAILED", "CANCELLED"] } } }),
    ...keep.map((id) =>
      db.postDestination.upsert({ where: { postId_socialAccountId: { postId: post.id, socialAccountId: id } }, create: { postId: post.id, socialAccountId: id }, update: {} }),
    ),
  ]);
  await contentChanged(ctx, post.id, post.status);
}

export type GenerateOptions = { language: CaptionLanguage; tone: CaptionTone; length: "short" | "standard" | "promotional"; hashtagCount: number; emojiLevel: "none" | "light" | "heavy"; platform?: "INSTAGRAM" | "FACEBOOK_PAGE" | null };

export async function generateCaption(ctx: WorkspaceContext, postId: string, opts: GenerateOptions) {
  if (!ctx.can("captions.generate")) throw forbidden();
  const post = await loadEditable(ctx, postId);
  const [asset, brand] = await Promise.all([
    db.mediaAsset.findUnique({ where: { id: post.mediaAssetId }, include: { songMetadata: true } }),
    db.brandKit.findUnique({ where: { workspaceId: ctx.workspace.id } }),
  ]);
  const s = asset?.songMetadata;
  const result = await generateCaptionSafe({
    song: { title: s?.songTitle, artist: s?.artist, album: s?.album, label: s?.musicLabel, language: s?.language, genre: s?.genre, mood: s?.mood, releaseDate: s?.releaseDate, callToAction: s?.callToAction, destinationUrl: s?.destinationUrl, keywords: s?.customKeywords ?? [] },
    brand: { name: brand?.brandName ?? ctx.workspace.name, tone: brand?.writingTone ?? "Friendly", defaultCta: brand?.defaultCta, defaultHashtags: brand?.defaultHashtags ?? [], wordsToAvoid: brand?.wordsToAvoid ?? [], requiredLegalText: brand?.requiredLegalText },
    options: { tone: opts.tone, language: opts.language, length: opts.length, hashtagCount: Math.min(Math.max(opts.hashtagCount, 0), 30), emojiLevel: opts.emojiLevel },
  });
  const kind: CaptionKind = opts.length === "short" ? "SHORT" : opts.length === "promotional" ? "PROMOTIONAL" : "STANDARD";
  const hasSelected = await db.captionVersion.count({ where: { postId: post.id, isSelected: true } });
  const caption = await db.captionVersion.create({
    data: {
      postId: post.id,
      platform: opts.platform ?? null,
      kind,
      language: opts.language,
      text: result.caption,
      hashtags: result.hashtags,
      callToAction: result.callToAction,
      aiGenerated: true,
      aiModel: result.model,
      isSelected: hasSelected === 0,
      createdById: ctx.userId,
    },
  });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "caption.generated", targetType: "Post", targetId: post.id, metadata: { language: opts.language, kind, model: result.model, fellBack: result.fellBack } });
  return caption;
}

export async function saveCaption(ctx: WorkspaceContext, postId: string, input: { captionId?: string | null; text: string; hashtags: string[]; callToAction?: string | null; language: CaptionLanguage; platform?: "INSTAGRAM" | "FACEBOOK_PAGE" | null; select?: boolean }) {
  if (!ctx.can("posts.edit")) throw forbidden();
  const post = await loadEditable(ctx, postId);
  if (!input.text.trim()) throw validation("Caption cannot be empty.");
  if (input.text.length + input.hashtags.join(" ").length > 2200) throw validation("Caption + hashtags exceed Instagram's 2,200 character limit.");
  if (input.hashtags.length > 30) throw validation("Instagram allows at most 30 hashtags.");

  const data = { text: input.text.trim(), hashtags: input.hashtags, callToAction: input.callToAction ?? null, language: input.language, platform: input.platform ?? null };
  let caption;
  if (input.captionId) {
    const existing = await db.captionVersion.findFirst({ where: { id: input.captionId, postId: post.id } });
    if (!existing) throw notFound("Caption not found.");
    caption = await db.captionVersion.update({ where: { id: existing.id }, data: { ...data, aiGenerated: existing.aiGenerated && existing.text === data.text, kind: existing.aiGenerated && existing.text === data.text ? existing.kind : "MANUAL" } });
  } else {
    caption = await db.captionVersion.create({ data: { ...data, postId: post.id, kind: "MANUAL", createdById: ctx.userId } });
  }
  if (input.select) await selectCaptionInternal(post.id, caption.id, caption.platform);
  await contentChanged(ctx, post.id, post.status);
  return caption;
}

async function selectCaptionInternal(postId: string, captionId: string, platform: "INSTAGRAM" | "FACEBOOK_PAGE" | null) {
  await db.$transaction([
    db.captionVersion.updateMany({ where: { postId, isSelected: true, platform }, data: { isSelected: false } }),
    db.captionVersion.update({ where: { id: captionId }, data: { isSelected: true } }),
  ]);
}

export async function selectCaption(ctx: WorkspaceContext, postId: string, captionId: string) {
  if (!ctx.can("posts.edit")) throw forbidden();
  const post = await loadEditable(ctx, postId);
  const c = await db.captionVersion.findFirst({ where: { id: captionId, postId: post.id } });
  if (!c) throw notFound("Caption not found.");
  await selectCaptionInternal(post.id, c.id, c.platform);
  await contentChanged(ctx, post.id, post.status);
}

export async function deleteCaption(ctx: WorkspaceContext, postId: string, captionId: string) {
  if (!ctx.can("posts.edit")) throw forbidden();
  const post = await loadEditable(ctx, postId);
  await db.captionVersion.deleteMany({ where: { id: captionId, postId: post.id } });
}

async function readiness(postId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, include: { destinations: { include: { socialAccount: true } }, captions: true, mediaAsset: { include: { songMetadata: true } } } });
  if (!post) throw notFound("Post not found.");
  const problems: string[] = [];
  if (post.mediaAsset.storageStatus !== "READY") problems.push("Video is not ready.");
  if (!post.destinations.length) problems.push("Choose at least one destination account.");
  for (const d of post.destinations) {
    if (d.socialAccount.deletedAt || d.socialAccount.health === "DISCONNECTED" || d.socialAccount.health === "ERROR") problems.push(`${d.socialAccount.displayName} is disconnected.`);
    if (!resolveCaptionText(post.captions, d.socialAccount.platform)) problems.push(`No caption for ${d.socialAccount.displayName}.`);
  }
  if (!post.mediaAsset.songMetadata?.copyrightConfirmed) problems.push("Confirm copyright ownership in the video's song metadata.");
  return { post, problems };
}

async function transition(ctx: WorkspaceContext, postId: string, to: PostStatus, extra: Prisma.PostUpdateInput, action: AuditAction, metadata?: Record<string, unknown>) {
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!post) throw notFound("Post not found.");
  if (!TRANSITIONS[post.status].includes(to)) throw conflict(`Cannot move a ${post.status.toLowerCase().replace("_", " ")} post to ${to.toLowerCase().replace("_", " ")}.`);
  const updated = await db.post.update({ where: { id: post.id }, data: { status: to, ...extra } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action, targetType: "Post", targetId: post.id, metadata: { from: post.status, to, ...metadata } });
  return updated;
}

export async function submitForApproval(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.submit")) throw forbidden();
  const { problems } = await readiness(postId);
  if (problems.length) throw validation(problems.join(" "));
  const p = await transition(ctx, postId, "PENDING_APPROVAL", { rejectionComment: null }, "post.submitted");
  await notify({ workspaceId: ctx.workspace.id, type: "POST_APPROVED", title: `"${p.title}" is waiting for approval`, href: `/posts/${p.id}` });
  return p;
}

export async function approvePost(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.approve")) throw forbidden();
  const { post, problems } = await readiness(postId);
  if (problems.length) throw validation(problems.join(" "));
  const p = await transition(ctx, postId, "APPROVED", { approvedAt: new Date(), approvedBy: { connect: { id: ctx.userId } }, rejectionComment: null }, "post.approved");
  await notify({ workspaceId: ctx.workspace.id, type: "POST_APPROVED", title: `"${p.title}" was approved`, href: `/posts/${p.id}`, userIds: [post.createdById] });
  return p;
}

export async function rejectPost(ctx: WorkspaceContext, postId: string, comment: string) {
  if (!ctx.can("posts.approve")) throw forbidden();
  if (!comment.trim()) throw validation("Please add a comment explaining what to change.");
  const p = await transition(ctx, postId, "REJECTED", { rejectionComment: comment.trim(), approvedAt: null, approvedBy: { disconnect: true } }, "post.rejected", { comment: comment.trim() });
  await notify({ workspaceId: ctx.workspace.id, type: "POST_REJECTED", title: `"${p.title}" was rejected`, body: comment.trim(), href: `/posts/${p.id}`, userIds: [p.createdById] });
  return p;
}

export async function backToDraft(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.edit")) throw forbidden();
  return transition(ctx, postId, "DRAFT", { approvedAt: null, approvedBy: { disconnect: true } }, "post.updated");
}

/**
 * Schedule (or reschedule) a post. Times are stored in UTC; `timezone` is kept
 * for display and conflict detection. Publishing requires an approved post,
 * except when `immediately` is true and the caller can publish.
 */
export async function schedulePost(ctx: WorkspaceContext, postId: string, input: { scheduledAt: Date; timezone: string; immediately?: boolean }) {
  if (!ctx.can("posts.schedule")) throw forbidden();
  const { post, problems } = await readiness(postId);
  if (problems.length) throw validation(problems.join(" "));
  const when = input.immediately ? new Date() : input.scheduledAt;
  if (!input.immediately && when.getTime() < Date.now() - 60_000) throw validation("Scheduled time is in the past.");
  if (!isValidTimezone(input.timezone)) throw validation("Unknown timezone.");

  let current = post.status;
  if (current === "SCHEDULED") {
    await cancelJobsForPost(post.id, "Rescheduled");
    await transition(ctx, postId, "APPROVED", {}, "post.rescheduled");
    current = "APPROVED";
  }
  if (current === "DRAFT" || current === "PENDING_APPROVAL" || current === "FAILED" || current === "PARTIALLY_PUBLISHED") {
    if (!ctx.can("posts.approve")) throw validation("Post must be approved before scheduling.");
    if (current !== "PARTIALLY_PUBLISHED") {
      if (current === "DRAFT" || current === "PENDING_APPROVAL" || current === "FAILED") await transition(ctx, postId, "APPROVED", { approvedAt: new Date(), approvedBy: { connect: { id: ctx.userId } } }, "post.approved");
      current = "APPROVED";
    }
  }

  const conflicts = await db.schedule.findMany({
    where: {
      post: { workspaceId: ctx.workspace.id, id: { not: post.id }, deletedAt: null, status: { in: ["SCHEDULED", "PUBLISHING"] }, destinations: { some: { socialAccountId: { in: post.destinations.map((d) => d.socialAccountId) } } } },
      scheduledAt: { gte: new Date(when.getTime() - 10 * 60_000), lte: new Date(when.getTime() + 10 * 60_000) },
    },
    include: { post: { select: { title: true } } },
  });
  const warnings = conflicts.map((c) => `"${c.post.title}" is scheduled within 10 minutes on the same account.`);

  await db.schedule.upsert({
    where: { postId: post.id },
    create: { postId: post.id, scheduledAt: when, timezone: input.timezone, scheduledById: ctx.userId },
    update: { scheduledAt: when, timezone: input.timezone, scheduledById: ctx.userId },
  });
  await transition(ctx, postId, "SCHEDULED", {}, "post.scheduled", { scheduledAt: when.toISOString(), timezone: input.timezone, immediately: Boolean(input.immediately) });
  await db.postDestination.updateMany({ where: { postId: post.id, status: { in: ["PENDING", "FAILED", "CANCELLED"] } }, data: { status: "SCHEDULED", lastErrorClass: null, lastErrorMessage: null } });
  await enqueueJobsForPost(post.id, when);
  await notify({ workspaceId: ctx.workspace.id, type: "POST_SCHEDULED", title: `"${post.title}" scheduled`, body: when.toLocaleString("en-IN", { timeZone: input.timezone }), href: `/posts/${post.id}`, userIds: [post.createdById] });
  return { warnings };
}

export async function unschedulePost(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.schedule")) throw forbidden();
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!post) throw notFound("Post not found.");
  if (post.status !== "SCHEDULED") throw conflict("Only scheduled posts can be unscheduled.");
  await cancelJobsForPost(post.id, "Unscheduled");
  await db.postDestination.updateMany({ where: { postId: post.id, status: "SCHEDULED" }, data: { status: "PENDING" } });
  await transition(ctx, postId, "APPROVED", {}, "post.rescheduled", { unscheduled: true });
}

export async function cancelPost(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.cancel")) throw forbidden();
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!post) throw notFound("Post not found.");
  if (post.status === "PUBLISHING") throw conflict("Publishing is in progress; wait for it to finish.");
  await cancelJobsForPost(post.id, "Cancelled");
  await db.postDestination.updateMany({ where: { postId: post.id, status: { in: ["PENDING", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
  await transition(ctx, postId, "CANCELLED", {}, "post.cancelled");
}

export async function retryFailedDestinations(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.publish")) throw forbidden();
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id, deletedAt: null }, include: { destinations: true } });
  if (!post) throw notFound("Post not found.");
  if (post.status !== "FAILED" && post.status !== "PARTIALLY_PUBLISHED") throw conflict("Only failed posts can be retried.");
  const failed = post.destinations.filter((d) => d.status === "FAILED");
  if (!failed.length) throw validation("No failed destinations to retry.");
  await db.postDestination.updateMany({ where: { id: { in: failed.map((d) => d.id) } }, data: { status: "SCHEDULED", lastErrorClass: null, lastErrorMessage: null } });
  await db.post.update({ where: { id: post.id }, data: { status: "SCHEDULED" } });
  await db.schedule.upsert({ where: { postId: post.id }, create: { postId: post.id, scheduledAt: new Date(), timezone: ctx.workspace.timezone, scheduledById: ctx.userId }, update: { scheduledAt: new Date(), scheduledById: ctx.userId } });
  await enqueueJobsForPost(post.id, new Date(), failed.map((d) => d.id));
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "publish.retried", targetType: "Post", targetId: post.id, metadata: { destinations: failed.length } });
}

export async function deletePost(ctx: WorkspaceContext, postId: string) {
  if (!ctx.can("posts.cancel")) throw forbidden();
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!post) throw notFound("Post not found.");
  if (post.status === "SCHEDULED" || post.status === "PUBLISHING") throw conflict("Cancel the post before deleting it.");
  await db.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
}
