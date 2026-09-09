import type { Workspace, WorkspaceRole } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";
import { forbidden, notFound } from "@/lib/errors";

export type WorkspaceContext = {
  userId: string;
  workspace: Workspace;
  role: WorkspaceRole;
  can: (permission: Permission) => boolean;
};

/**
 * Resolve the current user's membership in `slug` and assert `permission`.
 * Every server action / route handler touching workspace data must go through
 * this so tenant isolation and RBAC are enforced in one place.
 */
export async function requireWorkspace(slug: string, permission: Permission = "workspace.read"): Promise<WorkspaceContext> {
  // Lazy import keeps this module (and the services that depend on it) free of
  // next-auth's Next.js runtime so they can run in plain Node tests/workers.
  const { requireUserId } = await import("@/lib/auth");
  const userId = await requireUserId();
  return requireWorkspaceForUser(userId, slug, permission);
}

export async function requireWorkspaceForUser(
  userId: string,
  slug: string,
  permission: Permission = "workspace.read",
): Promise<WorkspaceContext> {
  const membership = await db.workspaceMember.findFirst({
    where: { userId, workspace: { slug, deletedAt: null } },
    include: { workspace: true },
  });
  // Non-members get 404, not 403, so workspace slugs are not enumerable.
  if (!membership) throw notFound("Workspace not found.");
  if (!can(membership.role, permission)) throw forbidden();
  return {
    userId,
    workspace: membership.workspace,
    role: membership.role,
    can: (p) => can(membership.role, p),
  };
}

export async function listUserWorkspaces(userId: string) {
  return db.workspaceMember.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: { workspace: { select: { id: true, name: true, slug: true, logoUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
}
