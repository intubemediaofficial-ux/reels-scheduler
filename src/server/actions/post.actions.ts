"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/tenant";
import { runAction, type ActionResult } from "@/lib/errors";
import { CAPTION_TONES } from "@/lib/providers/ai/types";
import * as posts from "@/server/services/post.service";

const uuid = z.string().uuid();
const uuids = z.array(uuid).min(1).max(200);
const language = z.enum(["EN", "HI", "HINGLISH"]);
const platform = z.enum(["INSTAGRAM", "FACEBOOK_PAGE"]).nullable().optional();

function reval(slug: string, postId?: string) {
  revalidatePath(`/w/${slug}/posts`);
  revalidatePath(`/w/${slug}/calendar`);
  revalidatePath(`/w/${slug}/library`);
  if (postId) revalidatePath(`/w/${slug}/posts/${postId}`);
}

export async function createPostsFromAssetsAction(slug: string, assetIds: string[]): Promise<ActionResult<{ postIds: string[] }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.create");
    const created = await posts.createPostsFromAssets(ctx, uuids.parse(assetIds));
    reval(slug);
    return { postIds: created.map((p) => p.id) };
  });
}

export async function updatePostBasicsAction(slug: string, postId: string, input: { title?: string; audioMode?: "EMBEDDED" | "PLATFORM" }): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.edit");
    const parsed = z.object({ title: z.string().trim().min(1).max(200).optional(), audioMode: z.enum(["EMBEDDED", "PLATFORM"]).optional() }).parse(input);
    await posts.updatePostBasics(ctx, uuid.parse(postId), parsed);
    reval(slug, postId);
    return undefined;
  });
}

export async function setDestinationsAction(slug: string, postId: string, socialAccountIds: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.edit");
    await posts.setDestinations(ctx, uuid.parse(postId), z.array(uuid).max(50).parse(socialAccountIds));
    reval(slug, postId);
    return undefined;
  });
}

const generateSchema = z.object({
  language,
  tone: z.enum(CAPTION_TONES),
  length: z.enum(["short", "standard", "promotional"]),
  hashtagCount: z.coerce.number().int().min(0).max(30),
  emojiLevel: z.enum(["none", "light", "heavy"]),
  platform,
});

export async function generateCaptionAction(slug: string, postId: string, input: z.input<typeof generateSchema>): Promise<ActionResult<{ captionId: string }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "captions.generate");
    const c = await posts.generateCaption(ctx, uuid.parse(postId), generateSchema.parse(input));
    reval(slug, postId);
    return { captionId: c.id };
  });
}

const saveSchema = z.object({
  captionId: uuid.nullable().optional(),
  text: z.string().max(2200),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(30),
  callToAction: z.string().trim().max(300).nullable().optional(),
  language,
  platform,
  select: z.boolean().optional(),
});

export async function saveCaptionAction(slug: string, postId: string, input: z.input<typeof saveSchema>): Promise<ActionResult<{ captionId: string }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.edit");
    const c = await posts.saveCaption(ctx, uuid.parse(postId), saveSchema.parse(input));
    reval(slug, postId);
    return { captionId: c.id };
  });
}

export async function selectCaptionAction(slug: string, postId: string, captionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.edit");
    await posts.selectCaption(ctx, uuid.parse(postId), uuid.parse(captionId));
    reval(slug, postId);
    return undefined;
  });
}

export async function deleteCaptionAction(slug: string, postId: string, captionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.edit");
    await posts.deleteCaption(ctx, uuid.parse(postId), uuid.parse(captionId));
    reval(slug, postId);
    return undefined;
  });
}

export async function submitForApprovalAction(slug: string, postId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.submit");
    await posts.submitForApproval(ctx, uuid.parse(postId));
    reval(slug, postId);
    return undefined;
  });
}

export async function approvePostAction(slug: string, postId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.approve");
    await posts.approvePost(ctx, uuid.parse(postId));
    reval(slug, postId);
    return undefined;
  });
}

export async function rejectPostAction(slug: string, postId: string, comment: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.approve");
    await posts.rejectPost(ctx, uuid.parse(postId), z.string().max(2000).parse(comment));
    reval(slug, postId);
    return undefined;
  });
}

export async function backToDraftAction(slug: string, postId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.edit");
    await posts.backToDraft(ctx, uuid.parse(postId));
    reval(slug, postId);
    return undefined;
  });
}

export async function schedulePostAction(slug: string, postId: string, input: { scheduledAt: string; timezone: string; immediately?: boolean }): Promise<ActionResult<{ warnings: string[] }>> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.schedule");
    const parsed = z.object({ scheduledAt: z.string(), timezone: z.string().min(1).max(64), immediately: z.boolean().optional() }).parse(input);
    const when = new Date(parsed.scheduledAt);
    if (!parsed.immediately && Number.isNaN(when.getTime())) throw new Error("Invalid date");
    const r = await posts.schedulePost(ctx, uuid.parse(postId), { scheduledAt: Number.isNaN(when.getTime()) ? new Date() : when, timezone: parsed.timezone, immediately: parsed.immediately });
    reval(slug, postId);
    return r;
  });
}

export async function unschedulePostAction(slug: string, postId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.schedule");
    await posts.unschedulePost(ctx, uuid.parse(postId));
    reval(slug, postId);
    return undefined;
  });
}

export async function cancelPostAction(slug: string, postId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.cancel");
    await posts.cancelPost(ctx, uuid.parse(postId));
    reval(slug, postId);
    return undefined;
  });
}

export async function retryFailedAction(slug: string, postId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.publish");
    await posts.retryFailedDestinations(ctx, uuid.parse(postId));
    reval(slug, postId);
    return undefined;
  });
}

export async function deletePostAction(slug: string, postId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireWorkspace(slug, "posts.cancel");
    await posts.deletePost(ctx, uuid.parse(postId));
    reval(slug, postId);
    return undefined;
  });
}
