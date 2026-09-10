import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret, generateOpaqueToken } from "@/lib/crypto";
import { forbidden, notFound, validation } from "@/lib/errors";
import { meta, metaScopes } from "@/lib/providers/meta";
import { signOAuthState } from "@/lib/providers/meta/oauth-state";
import { MetaApiError } from "@/lib/providers/meta/types";
import type { WorkspaceContext } from "@/lib/tenant";
import { notify } from "@/server/services/notification.service";

const REQUIRED_SCOPES = ["pages_show_list", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];

export function buildConnectUrl(ctx: WorkspaceContext): string {
  if (!ctx.can("accounts.manage")) throw forbidden();
  const e = env();
  const state = signOAuthState({ workspaceId: ctx.workspace.id, userId: ctx.userId, nonce: generateOpaqueToken(16), issuedAt: Date.now() }, e.AUTH_SECRET);
  return meta().buildAuthorizationUrl({ state, scopes: metaScopes(), redirectUri: e.META_OAUTH_REDIRECT_URI });
}

/**
 * OAuth callback: exchange code → long-lived user token → discover Pages and
 * their linked IG professional accounts. Tokens are encrypted before they
 * touch the database and never returned to the caller.
 */
export async function completeConnection(params: { workspaceId: string; userId: string; code: string }) {
  const e = env();
  const provider = meta();
  const short = await provider.exchangeCodeForToken({ code: params.code, redirectUri: e.META_OAUTH_REDIRECT_URI });
  const long = await provider.exchangeForLongLivedToken(short.accessToken).catch(() => short);
  const debug = await provider.debugToken(long.accessToken);
  if (!debug.isValid) throw validation("Meta returned an invalid token. Please try connecting again.");
  const profile = await provider.getUserProfile(long.accessToken);
  const missing = REQUIRED_SCOPES.filter((s) => !debug.scopes.includes(s));

  const pages = await provider.listManagedPages(long.accessToken);
  const key = e.TOKEN_ENCRYPTION_KEY;

  const connection = await db.socialConnection.upsert({
    where: { workspaceId_metaUserId: { workspaceId: params.workspaceId, metaUserId: profile.id } },
    create: {
      workspaceId: params.workspaceId,
      connectedById: params.userId,
      metaUserId: profile.id,
      metaUserName: profile.name,
      grantedScopes: debug.scopes,
      status: missing.length ? "PERMISSION_REQUIRED" : "CONNECTED",
      lastCheckedAt: new Date(),
      lastError: missing.length ? `Missing permissions: ${missing.join(", ")}` : null,
      credential: { create: { encryptedAccessToken: encryptSecret(long.accessToken, key), expiresAt: debug.expiresAt ?? long.expiresAt, scopes: debug.scopes } },
    },
    update: {
      connectedById: params.userId,
      metaUserName: profile.name,
      grantedScopes: debug.scopes,
      status: missing.length ? "PERMISSION_REQUIRED" : "CONNECTED",
      lastCheckedAt: new Date(),
      lastError: missing.length ? `Missing permissions: ${missing.join(", ")}` : null,
      deletedAt: null,
      credential: {
        upsert: {
          create: { encryptedAccessToken: encryptSecret(long.accessToken, key), expiresAt: debug.expiresAt ?? long.expiresAt, scopes: debug.scopes },
          update: { encryptedAccessToken: encryptSecret(long.accessToken, key), expiresAt: debug.expiresAt ?? long.expiresAt, scopes: debug.scopes, lastRefreshedAt: new Date(), revokedAt: null },
        },
      },
    },
  });

  const seenIds: string[] = [];
  for (const page of pages) {
    const canPost = page.tasks.length === 0 || page.tasks.includes("CREATE_CONTENT") || page.tasks.includes("MANAGE");
    const fb = await db.socialAccount.upsert({
      where: { workspaceId_platform_externalId: { workspaceId: params.workspaceId, platform: "FACEBOOK_PAGE", externalId: page.id } },
      create: {
        workspaceId: params.workspaceId,
        connectionId: connection.id,
        platform: "FACEBOOK_PAGE",
        externalId: page.id,
        facebookPageId: page.id,
        displayName: page.name,
        profileImageUrl: page.pictureUrl,
        health: canPost ? "CONNECTED" : "PERMISSION_REQUIRED",
        healthCheckedAt: new Date(),
        healthMessage: canPost ? null : "Your Facebook role on this Page does not allow creating content.",
        credential: { create: { encryptedAccessToken: encryptSecret(page.accessToken, key), expiresAt: null, scopes: debug.scopes } },
      },
      update: {
        connectionId: connection.id,
        displayName: page.name,
        profileImageUrl: page.pictureUrl,
        health: canPost ? "CONNECTED" : "PERMISSION_REQUIRED",
        healthCheckedAt: new Date(),
        healthMessage: canPost ? null : "Your Facebook role on this Page does not allow creating content.",
        deletedAt: null,
        credential: {
          upsert: {
            create: { encryptedAccessToken: encryptSecret(page.accessToken, key), expiresAt: null, scopes: debug.scopes },
            update: { encryptedAccessToken: encryptSecret(page.accessToken, key), lastRefreshedAt: new Date(), revokedAt: null, scopes: debug.scopes },
          },
        },
      },
    });
    seenIds.push(fb.id);

    const ig = await provider.getInstagramAccountForPage(page.accessToken, page.id).catch(() => null);
    if (ig) {
      const igAcc = await db.socialAccount.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: params.workspaceId, platform: "INSTAGRAM", externalId: ig.id } },
        create: {
          workspaceId: params.workspaceId,
          connectionId: connection.id,
          platform: "INSTAGRAM",
          externalId: ig.id,
          facebookPageId: page.id,
          displayName: ig.name ?? ig.username,
          username: ig.username,
          profileImageUrl: ig.profilePictureUrl,
          health: "CONNECTED",
          healthCheckedAt: new Date(),
          credential: { create: { encryptedAccessToken: encryptSecret(page.accessToken, key), expiresAt: null, scopes: debug.scopes } },
        },
        update: {
          connectionId: connection.id,
          facebookPageId: page.id,
          displayName: ig.name ?? ig.username,
          username: ig.username,
          profileImageUrl: ig.profilePictureUrl,
          health: "CONNECTED",
          healthCheckedAt: new Date(),
          healthMessage: null,
          deletedAt: null,
          credential: {
            upsert: {
              create: { encryptedAccessToken: encryptSecret(page.accessToken, key), expiresAt: null, scopes: debug.scopes },
              update: { encryptedAccessToken: encryptSecret(page.accessToken, key), lastRefreshedAt: new Date(), revokedAt: null, scopes: debug.scopes },
            },
          },
        },
      });
      seenIds.push(igAcc.id);
    }
  }

  // Accounts previously under this connection that Meta no longer lists lost access.
  await db.socialAccount.updateMany({
    where: { connectionId: connection.id, id: { notIn: seenIds }, deletedAt: null },
    data: { health: "PERMISSION_REQUIRED", healthMessage: "This account was not returned by Meta on the last login. Reconnect to restore access.", healthCheckedAt: new Date() },
  });

  await audit({
    workspaceId: params.workspaceId,
    actorId: params.userId,
    action: "account.connected",
    targetType: "SocialConnection",
    targetId: connection.id,
    metadata: { metaUserId: profile.id, pages: pages.length, accounts: seenIds.length, missingScopes: missing },
  });
  await notify({
    workspaceId: params.workspaceId,
    type: "ACCOUNT_CONNECTED",
    title: `Connected ${seenIds.length} account(s) from Meta`,
    body: missing.length ? `Missing permissions: ${missing.join(", ")}` : null,
    href: "/accounts",
  });
  return { connectionId: connection.id, accounts: seenIds.length, missingScopes: missing, pages: pages.length };
}

export async function listAccounts(ctx: WorkspaceContext) {
  if (!ctx.can("accounts.read")) throw forbidden();
  return db.socialAccount.findMany({
    where: { workspaceId: ctx.workspace.id, deletedAt: null },
    orderBy: [{ platform: "asc" }, { displayName: "asc" }],
    include: { connection: { select: { id: true, metaUserName: true, status: true, lastError: true, credential: { select: { expiresAt: true } } } } },
  });
}

export async function disconnectConnection(ctx: WorkspaceContext, connectionId: string) {
  if (!ctx.can("accounts.manage")) throw forbidden();
  const conn = await db.socialConnection.findFirst({ where: { id: connectionId, workspaceId: ctx.workspace.id, deletedAt: null }, include: { credential: true } });
  if (!conn) throw notFound("Connection not found.");
  const active = await db.publishJob.count({ where: { socialAccount: { connectionId: conn.id }, status: { in: ["QUEUED", "LOCKED", "RUNNING", "RETRY_SCHEDULED"] } } });
  if (active) throw validation(`There are ${active} scheduled publish job(s) using these accounts. Cancel them before disconnecting.`);

  if (conn.credential) {
    try {
      await meta().revokeToken(decryptSecret(conn.credential.encryptedAccessToken, env().TOKEN_ENCRYPTION_KEY));
    } catch {
      /* best effort */
    }
  }
  const now = new Date();
  await db.$transaction([
    db.oAuthCredential.updateMany({ where: { OR: [{ connectionId: conn.id }, { socialAccount: { connectionId: conn.id } }] }, data: { revokedAt: now, encryptedAccessToken: "" } }),
    db.socialAccount.updateMany({ where: { connectionId: conn.id }, data: { health: "DISCONNECTED", deletedAt: now } }),
    db.socialConnection.update({ where: { id: conn.id }, data: { status: "DISCONNECTED", deletedAt: now } }),
  ]);
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "account.disconnected", targetType: "SocialConnection", targetId: conn.id, metadata: { metaUserId: conn.metaUserId } });
}

/** Re-validate a connection's user token with Meta and refresh account health. */
export async function checkConnectionHealth(ctx: WorkspaceContext, connectionId: string) {
  if (!ctx.can("accounts.manage")) throw forbidden();
  const conn = await db.socialConnection.findFirst({ where: { id: connectionId, workspaceId: ctx.workspace.id, deletedAt: null }, include: { credential: true } });
  if (!conn?.credential || conn.credential.revokedAt) throw notFound("Connection not found.");
  try {
    const debug = await meta().debugToken(decryptSecret(conn.credential.encryptedAccessToken, env().TOKEN_ENCRYPTION_KEY));
    const missing = REQUIRED_SCOPES.filter((s) => !debug.scopes.includes(s));
    const expiringSoon = debug.expiresAt ? debug.expiresAt.getTime() - Date.now() < 7 * 86400_000 : false;
    const status = !debug.isValid ? "ERROR" : missing.length ? "PERMISSION_REQUIRED" : expiringSoon ? "TOKEN_EXPIRING" : "CONNECTED";
    await db.socialConnection.update({
      where: { id: conn.id },
      data: { status, grantedScopes: debug.scopes, lastCheckedAt: new Date(), lastError: !debug.isValid ? "Token is no longer valid. Reconnect." : missing.length ? `Missing permissions: ${missing.join(", ")}` : null },
    });
    await db.socialAccount.updateMany({
      where: { connectionId: conn.id, deletedAt: null },
      data: { health: status, healthCheckedAt: new Date(), healthMessage: status === "CONNECTED" ? null : status === "TOKEN_EXPIRING" ? "Login expires soon — reconnect to refresh." : "Reconnect to restore access." },
    });
    if (status !== "CONNECTED") {
      await notify({ workspaceId: ctx.workspace.id, type: status === "TOKEN_EXPIRING" ? "TOKEN_EXPIRING" : "PERMISSION_LOST", title: `Meta connection needs attention (${conn.metaUserName ?? conn.metaUserId})`, href: "/accounts" });
    }
    return status;
  } catch (e) {
    const msg = e instanceof MetaApiError ? e.message : "Could not reach Meta.";
    await db.socialConnection.update({ where: { id: conn.id }, data: { status: "ERROR", lastCheckedAt: new Date(), lastError: msg } });
    return "ERROR" as const;
  }
}

/** Decrypt the page token for a social account; used only inside the publisher. */
export async function pageTokenForAccount(socialAccountId: string): Promise<string> {
  const cred = await db.oAuthCredential.findUnique({ where: { socialAccountId } });
  if (!cred || cred.revokedAt || !cred.encryptedAccessToken) throw new MetaApiError("Account is disconnected.", "TOKEN_EXPIRED", false);
  return decryptSecret(cred.encryptedAccessToken, env().TOKEN_ENCRYPTION_KEY);
}
