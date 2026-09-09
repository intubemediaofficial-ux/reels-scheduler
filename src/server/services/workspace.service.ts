import type { CaptionLanguage, WorkspaceRole } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { canAssignRole } from "@/lib/rbac";
import { isReservedSlug, slugify } from "@/lib/slug";
import { isValidTimezone } from "@/lib/timezones";
import { requireWorkspaceForUser, type WorkspaceContext } from "@/lib/tenant";
import { emailProvider } from "@/lib/providers/email";
import { env } from "@/lib/env";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function uniqueSlug(base: string): Promise<string> {
  let candidate = slugify(base);
  if (isReservedSlug(candidate)) candidate = `${candidate}-ws`;
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? candidate : `${candidate}-${i + 1}`;
    const taken = await db.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${candidate}-${generateOpaqueToken(4).toLowerCase()}`;
}

export async function createWorkspace(userId: string, input: { name: string; timezone: string }) {
  const name = input.name.trim();
  if (name.length < 2) throw validation("Workspace name must be at least 2 characters.");
  if (!isValidTimezone(input.timezone)) throw validation("Unknown timezone.");

  const slug = await uniqueSlug(name);
  return db.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name,
        slug,
        timezone: input.timezone,
        members: { create: { userId, role: "OWNER" } },
        brandKit: { create: { brandName: name } },
      },
    });
    await audit({ tx, workspaceId: workspace.id, actorId: userId, action: "workspace.created", targetType: "Workspace", targetId: workspace.id });
    return workspace;
  });
}

export async function updateWorkspaceSettings(
  ctx: WorkspaceContext,
  input: {
    name?: string;
    timezone?: string;
    defaultCaptionLanguage?: CaptionLanguage;
    approvalRequired?: boolean;
    autoApproveAiCaptions?: boolean;
    safePublishIntervalSec?: number;
    mediaRetentionDays?: number | null;
  },
) {
  if (!ctx.can("workspace.settings.manage")) throw forbidden();
  if (input.name !== undefined && input.name.trim().length < 2) throw validation("Workspace name must be at least 2 characters.");
  if (input.timezone !== undefined && !isValidTimezone(input.timezone)) throw validation("Unknown timezone.");
  if (input.safePublishIntervalSec !== undefined && (input.safePublishIntervalSec < 0 || input.safePublishIntervalSec > 86400)) {
    throw validation("Safe publishing interval must be between 0 and 86400 seconds.");
  }
  if (input.mediaRetentionDays != null && input.mediaRetentionDays < 1) throw validation("Retention must be at least 1 day.");

  const updated = await db.workspace.update({
    where: { id: ctx.workspace.id },
    data: { ...input, name: input.name?.trim() },
  });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "workspace.updated", targetType: "Workspace", targetId: ctx.workspace.id, metadata: input });
  return updated;
}

export async function inviteMember(ctx: WorkspaceContext, input: { email: string; role: WorkspaceRole }) {
  if (!canAssignRole(ctx.role, input.role)) throw forbidden("You cannot invite members with that role.");
  const email = input.email.trim().toLowerCase();

  const alreadyMember = await db.workspaceMember.findFirst({
    where: { workspaceId: ctx.workspace.id, user: { email } },
    select: { id: true },
  });
  if (alreadyMember) throw conflict("That user is already a member of this workspace.");

  const token = generateOpaqueToken();
  const invitation = await db.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { workspaceId: ctx.workspace.id, email, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    const inv = await tx.invitation.create({
      data: {
        workspaceId: ctx.workspace.id,
        email,
        role: input.role,
        tokenHash: sha256Hex(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    await audit({ tx, workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "member.invited", targetType: "Invitation", targetId: inv.id, metadata: { email, role: input.role } });
    return inv;
  });

  const url = `${env().APP_URL}/invite/${token}`;
  await emailProvider().send({
    to: email,
    subject: `You're invited to ${ctx.workspace.name} on Reels Scheduler`,
    text: `You have been invited as ${input.role.toLowerCase()} to "${ctx.workspace.name}".\nAccept within 7 days:\n${url}`,
  });
  return { invitation, url };
}

export async function getInvitationByToken(token: string) {
  const inv = await db.invitation.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { workspace: { select: { id: true, name: true, slug: true } }, invitedBy: { select: { name: true, email: true } } },
  });
  if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) return null;
  return inv;
}

export async function acceptInvitation(userId: string, token: string) {
  const inv = await getInvitationByToken(token);
  if (!inv) throw validation("This invitation is invalid, expired or already used.");

  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  if (user.email !== inv.email) throw forbidden("This invitation was sent to a different email address.");

  await db.$transaction(async (tx) => {
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
      create: { workspaceId: inv.workspaceId, userId, role: inv.role },
      update: {},
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await audit({ tx, workspaceId: inv.workspaceId, actorId: userId, action: "member.invite_accepted", targetType: "Invitation", targetId: inv.id, metadata: { role: inv.role } });
  });
  return inv.workspace;
}

export async function revokeInvitation(ctx: WorkspaceContext, invitationId: string) {
  if (!ctx.can("members.manage")) throw forbidden();
  const inv = await db.invitation.findFirst({ where: { id: invitationId, workspaceId: ctx.workspace.id } });
  if (!inv) throw notFound("Invitation not found.");
  await db.invitation.update({ where: { id: inv.id }, data: { status: "REVOKED" } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "member.invite_revoked", targetType: "Invitation", targetId: inv.id });
}

export async function changeMemberRole(ctx: WorkspaceContext, memberId: string, role: WorkspaceRole) {
  const member = await db.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspace.id } });
  if (!member) throw notFound("Member not found.");
  if (!canAssignRole(ctx.role, role) || !canAssignRole(ctx.role, member.role)) throw forbidden("You cannot change this member's role.");
  if (member.role === "OWNER" && role !== "OWNER") await assertNotLastOwner(ctx.workspace.id, member.id);

  await db.workspaceMember.update({ where: { id: member.id }, data: { role } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "member.role_changed", targetType: "WorkspaceMember", targetId: member.id, metadata: { from: member.role, to: role } });
}

export async function removeMember(ctx: WorkspaceContext, memberId: string) {
  const member = await db.workspaceMember.findFirst({ where: { id: memberId, workspaceId: ctx.workspace.id } });
  if (!member) throw notFound("Member not found.");
  const isSelf = member.userId === ctx.userId;
  if (!isSelf && !canAssignRole(ctx.role, member.role)) throw forbidden("You cannot remove this member.");
  if (member.role === "OWNER") await assertNotLastOwner(ctx.workspace.id, member.id);

  await db.workspaceMember.delete({ where: { id: member.id } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.userId, action: "member.removed", targetType: "WorkspaceMember", targetId: member.id, metadata: { userId: member.userId, role: member.role, self: isSelf } });
}

async function assertNotLastOwner(workspaceId: string, memberId: string) {
  const owners = await db.workspaceMember.count({ where: { workspaceId, role: "OWNER", id: { not: memberId } } });
  if (owners === 0) throw validation("A workspace must keep at least one owner.");
}

export { requireWorkspaceForUser };
