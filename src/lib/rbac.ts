import type { WorkspaceRole } from "@prisma/client";

/**
 * Every protected action in the app maps to one permission. Server code calls
 * `requireWorkspace(slug, permission)`; hiding a button is never sufficient.
 */
export const PERMISSIONS = [
  "workspace.read",
  "workspace.settings.manage",
  "workspace.delete",
  "members.read",
  "members.manage",
  "accounts.read",
  "accounts.manage",
  "media.read",
  "media.upload",
  "media.delete",
  "posts.read",
  "posts.create",
  "posts.edit",
  "posts.submit",
  "posts.approve",
  "posts.schedule",
  "posts.publish",
  "posts.cancel",
  "captions.generate",
  "brandkit.manage",
  "audit.read",
  "notifications.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = [
  "workspace.read",
  "members.read",
  "accounts.read",
  "media.read",
  "posts.read",
  "audit.read",
  "notifications.read",
];

const EDITOR: Permission[] = [
  ...VIEWER,
  "media.upload",
  "posts.create",
  "posts.edit",
  "posts.submit",
  "captions.generate",
];

const ADMIN: Permission[] = [
  ...EDITOR,
  "accounts.manage",
  "media.delete",
  "posts.approve",
  "posts.schedule",
  "posts.publish",
  "posts.cancel",
  "brandkit.manage",
  "members.manage",
  "workspace.settings.manage",
];

const OWNER: Permission[] = [...ADMIN, "workspace.delete"];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  EDITOR: new Set(EDITOR),
  VIEWER: new Set(VIEWER),
};

export function can(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export const ROLE_RANK: Record<WorkspaceRole, number> = { OWNER: 4, ADMIN: 3, EDITOR: 2, VIEWER: 1 };

/**
 * Who may assign which role. Owners can assign anything; Admins can assign
 * Editor/Viewer only. Nobody can promote above their own rank.
 */
export function canAssignRole(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (!can(actor, "members.manage")) return false;
  if (actor === "OWNER") return true;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  OWNER: "Full access, including deleting the workspace and managing owners.",
  ADMIN: "Manage connected accounts, approve, schedule and publish Reels, manage team.",
  EDITOR: "Upload videos, add metadata, generate captions and submit for approval.",
  VIEWER: "Read-only access to calendar, posts and reports.",
};
