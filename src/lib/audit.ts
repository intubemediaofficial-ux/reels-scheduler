import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditAction =
  | "auth.signup"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "workspace.created"
  | "workspace.updated"
  | "member.invited"
  | "member.invite_accepted"
  | "member.invite_revoked"
  | "member.role_changed"
  | "member.removed"
  | "account.connected"
  | "account.disconnected"
  | "account.permission_changed"
  | "media.uploaded"
  | "media.deleted"
  | "caption.generated"
  | "post.created"
  | "post.updated"
  | "post.submitted"
  | "post.approved"
  | "post.rejected"
  | "post.scheduled"
  | "post.rescheduled"
  | "post.cancelled"
  | "publish.attempted"
  | "publish.succeeded"
  | "publish.failed"
  | "publish.retried";

const SENSITIVE_KEYS = /token|secret|password|authorization|cookie/i;

/** Drop anything that looks like a credential before it reaches the log. */
export function sanitizeAuditMetadata(input: unknown): Prisma.InputJsonValue | undefined {
  if (input === undefined || input === null) return undefined;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, SENSITIVE_KEYS.test(k) ? "[redacted]" : walk(val)]),
      );
    }
    return v;
  };
  return walk(input) as Prisma.InputJsonValue;
}

export async function audit(params: {
  workspaceId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: unknown;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? db;
  await client.auditLog.create({
    data: {
      workspaceId: params.workspaceId ?? null,
      actorId: params.actorId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: sanitizeAuditMetadata(params.metadata),
    },
  });
}
