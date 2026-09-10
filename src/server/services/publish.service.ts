import type { PublishErrorClass } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { meta } from "@/lib/providers/meta";
import { MetaApiError } from "@/lib/providers/meta/types";
import { storage } from "@/lib/providers/storage";
import { notify } from "@/server/services/notification.service";
import { pageTokenForAccount } from "@/server/services/accounts.service";
import { resolveCaptionText } from "@/lib/captions";

const ACTIVE = ["QUEUED", "LOCKED", "RUNNING", "RETRY_SCHEDULED"] as const;
const LOCK_TTL_MS = 15 * 60_000;

/**
 * One job per destination. The idempotency key includes the schedule time so a
 * reschedule creates a new job while the old one is cancelled; the unique
 * constraint guarantees the same destination can never be enqueued twice for
 * the same slot even under concurrent requests.
 */
export async function enqueueJobsForPost(postId: string, runAt: Date, onlyDestinationIds?: string[]) {
  const post = await db.post.findUnique({ where: { id: postId }, include: { destinations: true } });
  if (!post) return;
  const targets = post.destinations.filter((d) => (onlyDestinationIds ? onlyDestinationIds.includes(d.id) : d.status === "SCHEDULED"));
  for (const d of targets) {
    const idempotencyKey = `${d.id}:${runAt.toISOString()}`;
    await db.publishJob.upsert({
      where: { idempotencyKey },
      create: { workspaceId: post.workspaceId, destinationId: d.id, socialAccountId: d.socialAccountId, idempotencyKey, status: "QUEUED", runAt },
      update: {},
    });
  }
}

export async function cancelJobsForPost(postId: string, reason: string) {
  await db.publishJob.updateMany({
    where: { destination: { postId }, status: { in: [...ACTIVE] } },
    data: { status: "CANCELLED", lastErrorMessage: reason, lockedAt: null, lockedBy: null },
  });
}

/** Claim up to `limit` due jobs atomically (SKIP LOCKED) and mark them LOCKED for this worker. */
export async function claimDueJobs(workerId: string, limit = 5): Promise<string[]> {
  const now = new Date();
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH due AS (
      SELECT id FROM "PublishJob"
      WHERE (
        (status IN ('QUEUED','RETRY_SCHEDULED') AND "runAt" <= ${now} AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= ${now}))
        OR (status IN ('LOCKED','RUNNING') AND "lockedAt" < ${new Date(now.getTime() - LOCK_TTL_MS)})
      )
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "PublishJob" j SET status = 'LOCKED', "lockedAt" = ${now}, "lockedBy" = ${workerId}, "updatedAt" = ${now}
    FROM due WHERE j.id = due.id
    RETURNING j.id`;
  return rows.map((r) => r.id);
}

function backoffMs(attempt: number, cls: PublishErrorClass): number {
  const base = cls === "RATE_LIMITED" ? 15 * 60_000 : 2 * 60_000;
  return Math.min(base * 2 ** (attempt - 1), 6 * 3600_000) + Math.floor(Math.random() * 30_000);
}

function classify(e: unknown): { cls: PublishErrorClass; retryable: boolean; message: string } {
  if (e instanceof MetaApiError) return { cls: e.classification, retryable: e.retryable, message: e.message };
  const message = e instanceof Error ? e.message : "Unknown error";
  const transient = /ECONN|ETIMEDOUT|fetch failed|socket|network/i.test(message);
  return { cls: transient ? "META_TEMPORARY_OUTAGE" : "UNKNOWN", retryable: transient, message };
}

export async function runJob(jobId: string, workerId: string): Promise<void> {
  const job = await db.publishJob.findUnique({
    where: { id: jobId },
    include: {
      destination: { include: { post: { include: { mediaAsset: true, captions: true, schedule: true } }, socialAccount: true } },
    },
  });
  if (!job || job.status !== "LOCKED" || job.lockedBy !== workerId) return;
  const { destination } = job;
  const { post, socialAccount: account } = destination;

  // Idempotency: if a previous attempt already published, just finalize.
  if (destination.status === "PUBLISHED" && destination.metaMediaId) {
    await db.publishJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null } });
    await finalizePost(post.id);
    return;
  }
  if (post.deletedAt || post.status === "CANCELLED" || destination.status === "CANCELLED") {
    await db.publishJob.update({ where: { id: job.id }, data: { status: "CANCELLED", lockedAt: null, lockedBy: null, lastErrorMessage: "Post cancelled" } });
    return;
  }

  const attemptNumber = job.attemptCount + 1;
  const attempt = await db.publishAttempt.create({ data: { jobId: job.id, attemptNumber } });
  await db.$transaction([
    db.publishJob.update({ where: { id: job.id }, data: { status: "RUNNING", attemptCount: attemptNumber } }),
    db.postDestination.update({ where: { id: destination.id }, data: { status: "PUBLISHING" } }),
    db.post.updateMany({ where: { id: post.id, status: "SCHEDULED" }, data: { status: "PUBLISHING" } }),
  ]);
  await audit({ workspaceId: job.workspaceId, action: "publish.attempted", targetType: "PostDestination", targetId: destination.id, metadata: { attempt: attemptNumber, platform: account.platform } });

  try {
    // Pre-flight health checks — fail fast with a clear, non-retryable error.
    if (account.deletedAt || account.health === "DISCONNECTED") throw new MetaApiError(`${account.displayName} is disconnected. Reconnect it in Connected Accounts.`, "TOKEN_EXPIRED", false);
    if (account.health === "PERMISSION_REQUIRED") throw new MetaApiError(`${account.displayName} is missing permissions. Reconnect and grant all permissions.`, "PERMISSION_MISSING", false);
    if (post.mediaAsset.storageStatus !== "READY") throw new MetaApiError("Video is not ready.", "VALIDATION", false);
    const caption = resolveCaptionText(post.captions, account.platform);
    if (!caption) throw new MetaApiError("No caption selected for this platform.", "VALIDATION", false);
    if (!(await storage().head(post.mediaAsset.storageKey))) throw new MetaApiError("Video file is missing from storage.", "VALIDATION", false);

    const token = await pageTokenForAccount(account.id);
    const videoUrl = await storage().createSignedReadUrl(post.mediaAsset.storageKey, 3 * 3600);
    const provider = meta();
    let published: { id: string; permalink: string | null };
    let containerId: string | null = destination.metaContainerId;

    if (account.platform === "INSTAGRAM") {
      const limit = await provider.getInstagramPublishingLimit({ igUserId: account.externalId, pageToken: token }).catch(() => null);
      if (limit && limit.quota && limit.used >= limit.quota) throw new MetaApiError(`Instagram daily publishing limit reached (${limit.used}/${limit.quota}).`, "RATE_LIMITED", true);
      if (limit) await db.socialAccount.update({ where: { id: account.id }, data: { publishingLimitUsed: limit.used, publishingLimitCheckedAt: new Date() } });

      if (!containerId) {
        containerId = (await provider.createInstagramReelContainer({ igUserId: account.externalId, pageToken: token, input: { videoUrl, caption, shareToFeed: true } })).containerId;
        await db.postDestination.update({ where: { id: destination.id }, data: { metaContainerId: containerId } });
      }
      const deadline = Date.now() + 10 * 60_000;
      for (;;) {
        const st = await provider.getContainerStatus({ containerId, pageToken: token });
        if (st.status === "FINISHED") break;
        if (st.status === "PUBLISHED") break;
        if (st.status === "ERROR" || st.status === "EXPIRED") {
          await db.postDestination.update({ where: { id: destination.id }, data: { metaContainerId: null } });
          throw new MetaApiError(st.errorMessage ?? `Instagram could not process the video (${st.status}).`, "MEDIA_PROCESSING_FAILED", st.status === "EXPIRED");
        }
        if (Date.now() > deadline) throw new MetaApiError("Instagram is still processing the video; will retry.", "META_TEMPORARY_OUTAGE", true);
        await new Promise((r) => setTimeout(r, 5000));
      }
      published = await provider.publishInstagramContainer({ igUserId: account.externalId, containerId, pageToken: token });
    } else {
      published = await provider.publishFacebookPageReel({ pageId: account.externalId, pageToken: token, input: { videoUrl, caption } });
    }

    await db.$transaction([
      db.publishAttempt.update({ where: { id: attempt.id }, data: { finishedAt: new Date(), success: true, metaContainerId: containerId, metaMediaId: published.id } }),
      db.postDestination.update({ where: { id: destination.id }, data: { status: "PUBLISHED", metaMediaId: published.id, permalink: published.permalink, publishedAt: new Date(), lastErrorClass: null, lastErrorMessage: null } }),
      db.publishJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null } }),
    ]);
    await audit({ workspaceId: job.workspaceId, action: "publish.succeeded", targetType: "PostDestination", targetId: destination.id, metadata: { platform: account.platform, mediaId: published.id } });
  } catch (e) {
    const { cls, retryable, message } = classify(e);
    const canRetry = retryable && attemptNumber < job.maxAttempts;
    const nextRetryAt = canRetry ? new Date(Date.now() + backoffMs(attemptNumber, cls)) : null;
    await db.$transaction([
      db.publishAttempt.update({ where: { id: attempt.id }, data: { finishedAt: new Date(), success: false, errorClass: cls, errorMessage: message.slice(0, 1000) } }),
      db.publishJob.update({
        where: { id: job.id },
        data: { status: canRetry ? "RETRY_SCHEDULED" : retryable ? "EXHAUSTED" : "FAILED", nextRetryAt, lastErrorClass: cls, lastErrorMessage: message.slice(0, 1000), lockedAt: null, lockedBy: null },
      }),
      db.postDestination.update({ where: { id: destination.id }, data: { status: canRetry ? "SCHEDULED" : "FAILED", lastErrorClass: cls, lastErrorMessage: message.slice(0, 1000) } }),
    ]);
    if (cls === "TOKEN_EXPIRED" || cls === "PERMISSION_MISSING") {
      await db.socialAccount.update({ where: { id: account.id }, data: { health: cls === "TOKEN_EXPIRED" ? "ERROR" : "PERMISSION_REQUIRED", healthMessage: message.slice(0, 500), healthCheckedAt: new Date() } });
      await notify({ workspaceId: job.workspaceId, type: "PERMISSION_LOST", title: `${account.displayName} needs reconnecting`, body: message, href: "/accounts" });
    }
    await audit({ workspaceId: job.workspaceId, action: canRetry ? "publish.retried" : "publish.failed", targetType: "PostDestination", targetId: destination.id, metadata: { attempt: attemptNumber, errorClass: cls, retryable, nextRetryAt } });
    if (!canRetry) {
      await notify({ workspaceId: job.workspaceId, type: retryable ? "RETRY_EXHAUSTED" : "POST_FAILED", title: `"${post.title}" failed on ${account.displayName}`, body: message, href: `/posts/${post.id}` });
    }
  }
  await finalizePost(post.id);
}

/** Roll destination outcomes up to the post once no job for it is still active. */
async function finalizePost(postId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, include: { destinations: { include: { publishJobs: { where: { status: { in: [...ACTIVE] } }, select: { id: true } } } } } });
  if (!post || post.deletedAt) return;
  const pending = post.destinations.some((d) => d.publishJobs.length || d.status === "PUBLISHING" || d.status === "SCHEDULED");
  if (pending) return;
  const published = post.destinations.filter((d) => d.status === "PUBLISHED").length;
  const failed = post.destinations.filter((d) => d.status === "FAILED").length;
  const status = failed === 0 && published > 0 ? "PUBLISHED" : published > 0 ? "PARTIALLY_PUBLISHED" : failed > 0 ? "FAILED" : post.status;
  if (status === post.status) return;
  await db.post.update({ where: { id: postId }, data: { status } });
  if (status === "PUBLISHED") await notify({ workspaceId: post.workspaceId, type: "POST_PUBLISHED", title: `"${post.title}" published`, href: `/posts/${post.id}`, userIds: [post.createdById] });
}

/** Process one polling tick. Returns the number of jobs handled. */
export async function tick(workerId = env().PUBLISH_WORKER_ID, limit = 5): Promise<number> {
  const ids = await claimDueJobs(workerId, limit);
  await Promise.all(ids.map((id) => runJob(id, workerId).catch((e) => console.error("[publisher] job", id, e instanceof Error ? e.message : e))));
  return ids.length;
}
