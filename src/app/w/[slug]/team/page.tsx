import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, canAssignRole } from "@/lib/rbac";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { changeMemberRoleAction, removeMemberAction, revokeInvitationAction } from "@/server/actions/workspace.actions";
import { InviteForm } from "./invite-form";
import { RoleSelect } from "./role-select";
import { formatInTz } from "@/lib/format";
import type { WorkspaceRole } from "@prisma/client";

export const metadata = { title: "Team & Roles" };

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

export default async function TeamPage({ params }: PageProps<"/w/[slug]/team">) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug, "members.read");
  const canManage = ctx.can("members.manage");

  const [members, invitations] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    canManage
      ? db.invitation.findMany({
          where: { workspaceId: ctx.workspace.id, status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const assignableRoles = ROLES.filter((r) => canAssignRole(ctx.role, r));
  const changeRole = changeMemberRoleAction.bind(null, slug);
  const removeMember = removeMemberAction.bind(null, slug);
  const revoke = revokeInvitationAction.bind(null, slug);

  return (
    <>
      <PageHeader title="Team & Roles" description="Roles are enforced on the server for every action." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Members">
            <ul className="divide-y divide-slate-100">
              {members.map((m) => {
                const isSelf = m.userId === ctx.userId;
                const editable = canManage && canAssignRole(ctx.role, m.role);
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {m.user.name ?? m.user.email} {isSelf ? <span className="text-xs text-slate-500">(you)</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">{m.user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editable ? (
                        <form action={changeRole} className="flex items-center gap-2">
                          <input type="hidden" name="memberId" value={m.id} />
                          <RoleSelect name="role" defaultValue={m.role} roles={assignableRoles} />
                        </form>
                      ) : (
                        <Badge tone={m.role === "OWNER" ? "indigo" : "slate"}>{ROLE_LABELS[m.role]}</Badge>
                      )}
                      {editable || isSelf ? (
                        <form action={removeMember}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <ConfirmButton variant="ghost" confirmText={isSelf ? "Leave" : "Remove"} className="text-rose-600">
                            {isSelf ? "Leave" : "Remove"}
                          </ConfirmButton>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {canManage ? (
            <Card title="Pending invitations">
              {invitations.length === 0 ? (
                <EmptyState title="No pending invitations" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {invitations.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium">{inv.email}</p>
                        <p className="text-xs text-slate-500">
                          {ROLE_LABELS[inv.role]} · expires {formatInTz(inv.expiresAt, ctx.workspace.timezone)}
                        </p>
                      </div>
                      <form action={revoke}>
                        <input type="hidden" name="invitationId" value={inv.id} />
                        <ConfirmButton variant="ghost" confirmText="Revoke" className="text-rose-600">
                          Revoke
                        </ConfirmButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {canManage ? (
            <Card title="Invite a member" description="They receive a link valid for 7 days.">
              <InviteForm slug={slug} roles={assignableRoles} />
            </Card>
          ) : null}
          <Card title="What each role can do">
            <dl className="space-y-2 text-sm">
              {ROLES.map((r) => (
                <div key={r}>
                  <dt className="font-medium">{ROLE_LABELS[r]}</dt>
                  <dd className="text-slate-600">{ROLE_DESCRIPTIONS[r]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
