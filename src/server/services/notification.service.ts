import type { NotificationType, WorkspaceRole } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Fan a workspace event out to members. Defaults to admins/owners; pass
 * `roles` to widen, or `userIds` to target specific people (e.g. post author).
 */
export async function notify(params: {
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Path relative to the workspace, e.g. "/posts/<id>". */
  href?: string | null;
  roles?: WorkspaceRole[];
  userIds?: string[];
}) {
  const workspace = await db.workspace.findUnique({ where: { id: params.workspaceId }, select: { slug: true } });
  if (!workspace) return;
  let userIds = params.userIds;
  if (!userIds) {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: params.workspaceId, role: { in: params.roles ?? ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    userIds = members.map((m) => m.userId);
  }
  if (!userIds.length) return;
  await db.notification.createMany({
    data: userIds.map((userId) => ({
      workspaceId: params.workspaceId,
      userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      href: params.href ? `/w/${workspace.slug}${params.href}` : null,
    })),
  });
}

export async function unreadCount(workspaceId: string, userId: string) {
  return db.notification.count({ where: { workspaceId, userId, readAt: null } });
}

export async function markAllRead(workspaceId: string, userId: string) {
  await db.notification.updateMany({ where: { workspaceId, userId, readAt: null }, data: { readAt: new Date() } });
}
