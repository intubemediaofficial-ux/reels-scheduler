import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import { requireWorkspaceForUser, type WorkspaceContext } from "@/lib/tenant";
import { registerUser } from "@/server/services/auth.service";
import { createWorkspace } from "@/server/services/workspace.service";
import { completeConnection, listAccounts } from "@/server/services/accounts.service";
import { updateSongMetadata } from "@/server/services/media.service";
import {
  createPostsFromAssets,
  generateCaption,
  getPost,
  retryFailedDestinations,
  saveCaption,
  schedulePost,
  setDestinations,
  submitForApproval,
  approvePost,
} from "@/server/services/post.service";
import { tick } from "@/server/services/publish.service";
import { setEmailProviderForTests } from "@/lib/providers/email";

const run = Date.now().toString(36);
let owner: string;
let ws: { id: string; slug: string };
let ctx: WorkspaceContext;
let assetId: string;
let storageDir: string;

async function seedReadyAsset(name: string) {
  await mkdir(path.join(storageDir, ws.id), { recursive: true });
  await writeFile(path.join(storageDir, ws.id, name), Buffer.alloc(1000, 1));
  const a = await db.mediaAsset.create({
    data: {
      workspaceId: ws.id,
      uploadedById: owner,
      originalFilename: name,
      storageKey: `${ws.id}/${name}`,
      mimeType: "video/mp4",
      fileSizeBytes: 1000,
      sha256: `${run}-${name}`,
      storageStatus: "READY",
      durationSec: 20,
      width: 1080,
      height: 1920,
    },
  });
  await updateSongMetadata(ctx, [a.id], { songTitle: "Tere Bina", artist: "Bainsla", copyrightConfirmed: true });
  return a.id;
}

async function drain(rounds = 5) {
  for (let i = 0; i < rounds; i++) await tick(`test-${run}`, 10);
}

beforeAll(async () => {
  setEmailProviderForTests({ send: async () => {} });
  storageDir = await mkdtemp(path.join(os.tmpdir(), "reels-storage-"));
  process.env.STORAGE_LOCAL_DIR = storageDir;
  owner = (await registerUser({ email: `pub-${run}@test.local`, password: "correct-horse-battery", name: "Owner" })).id;
  ws = await createWorkspace(owner, { name: "Publish Lab", timezone: "Asia/Kolkata" });
  ctx = await requireWorkspaceForUser(owner, ws.slug);
  await completeConnection({ workspaceId: ws.id, userId: owner, code: "mock-code" });
  assetId = await seedReadyAsset("a.mp4");
});

afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: ws.id } });
  await db.user.deleteMany({ where: { id: owner } });
  await rm(storageDir, { recursive: true, force: true });
  await db.$disconnect();
});

describe("mock Meta connection", () => {
  it("discovers a Facebook Page and its linked Instagram account with encrypted token", async () => {
    const accounts = await listAccounts(ctx);
    expect(accounts.map((a) => a.platform).sort()).toEqual(["FACEBOOK_PAGE", "FACEBOOK_PAGE", "INSTAGRAM"]);
    expect(new Set(accounts.map((a) => a.connection.id)).size).toBe(1);
    const cred = await db.oAuthCredential.findFirstOrThrow({ where: { connectionId: accounts[0].connection.id } });
    expect(cred.encryptedAccessToken).not.toContain("mock");
  });
});

describe("post lifecycle → publish", () => {
  it("publishes to both destinations through the worker", async () => {
    const accounts = (await listAccounts(ctx)).filter((a) => a.platform === "INSTAGRAM" || a.externalId === "page-1");
    const [{ id: postId }] = await createPostsFromAssets(ctx, [assetId]);
    await setDestinations(ctx, postId, accounts.map((a) => a.id));
    const cap = await generateCaption(ctx, postId, { language: "HINGLISH", tone: "Friendly", length: "standard", hashtagCount: 5, emojiLevel: "light" });
    expect(cap.text).toMatch(/Tere Bina/);

    await submitForApproval(ctx, postId);
    expect((await getPost(ctx, postId)).status).toBe("PENDING_APPROVAL");
    await approvePost(ctx, postId);
    await schedulePost(ctx, postId, { scheduledAt: new Date(), timezone: "Asia/Kolkata", immediately: true });
    expect((await getPost(ctx, postId)).status).toBe("SCHEDULED");
    expect(await db.publishJob.count({ where: { destination: { postId } } })).toBe(2);

    await drain();
    const post = await getPost(ctx, postId);
    expect(post.status).toBe("PUBLISHED");
    expect(post.destinations.every((d) => d.status === "PUBLISHED" && d.metaMediaId)).toBe(true);
    // idempotent: another tick does nothing
    expect(await tick(`test-${run}`, 10)).toBe(0);
  });

  it("classifies permanent failures, allows retry after caption fix", async () => {
    const accounts = await listAccounts(ctx);
    const ig = accounts.find((a) => a.platform === "INSTAGRAM")!;
    const a2 = await seedReadyAsset("b.mp4");
    const [{ id: postId }] = await createPostsFromAssets(ctx, [a2]);
    await setDestinations(ctx, postId, [ig.id]);
    const c = await saveCaption(ctx, postId, { text: "broken [fail]", hashtags: [], callToAction: null, platform: null, language: "EN" });
    await schedulePost(ctx, postId, { scheduledAt: new Date(), timezone: "Asia/Kolkata", immediately: true });
    await drain();
    let post = await getPost(ctx, postId);
    expect(post.status).toBe("FAILED");
    const job = await db.publishJob.findFirstOrThrow({ where: { destination: { postId } }, include: { attempts: true } });
    expect(job.status).toBe("FAILED");
    expect(job.lastErrorClass).toBe("VALIDATION");
    expect(job.attempts.length).toBe(1);

    await saveCaption(ctx, postId, { captionId: c.id, text: "fixed caption", hashtags: [], callToAction: null, platform: null, language: "EN" });
    await retryFailedDestinations(ctx, postId);
    await drain();
    post = await getPost(ctx, postId);
    expect(post.status).toBe("PUBLISHED");
  });

  it("schedules transient failures for retry with backoff", async () => {
    const accounts = await listAccounts(ctx);
    const fb = accounts.find((a) => a.platform === "FACEBOOK_PAGE")!;
    const a3 = await seedReadyAsset("c.mp4");
    const [{ id: postId }] = await createPostsFromAssets(ctx, [a3]);
    await setDestinations(ctx, postId, [fb.id]);
    await saveCaption(ctx, postId, { text: "flaky [retry]", hashtags: [], callToAction: null, platform: null, language: "EN" });
    await schedulePost(ctx, postId, { scheduledAt: new Date(), timezone: "Asia/Kolkata", immediately: true });
    await tick(`test-${run}`, 10);
    const job = await db.publishJob.findFirstOrThrow({ where: { destination: { postId } } });
    expect(job.status).toBe("RETRY_SCHEDULED");
    expect(job.attemptCount).toBe(1);
    expect(job.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() + 10_000);
    expect((await getPost(ctx, postId)).status).toBe("PUBLISHING");
  });
});
