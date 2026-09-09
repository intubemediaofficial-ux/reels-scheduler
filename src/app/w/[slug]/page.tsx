import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatInTz } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug, "workspace.read");
  const wid = ctx.workspace.id;

  const [members, pendingInvites, recent] = await Promise.all([
    db.workspaceMember.count({ where: { workspaceId: wid } }),
    db.invitation.count({ where: { workspaceId: wid, status: "PENDING", expiresAt: { gt: new Date() } } }),
    db.auditLog.findMany({
      where: { workspaceId: wid },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);

  const stats = [
    { label: "Team members", value: members, href: `/w/${slug}/team` },
    { label: "Pending invitations", value: pendingInvites, href: `/w/${slug}/team` },
  ];

  return (
    <>
      <PageHeader title={ctx.workspace.name} description={`Timezone ${ctx.workspace.timezone} · ${ctx.workspace.approvalRequired ? "Approval required before scheduling" : "Approval optional"}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300">
            <p className="text-xs uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Next steps" className="lg:col-span-1">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              <Link href={`/w/${slug}/team`} className="text-indigo-600 hover:underline">
                Invite your team
              </Link>{" "}
              and assign Editor/Admin roles.
            </li>
            <li>
              <Link href={`/w/${slug}/settings`} className="text-indigo-600 hover:underline">
                Review workspace settings
              </Link>{" "}
              — timezone, approval policy, safe publishing interval.
            </li>
            <li>Connect Facebook Pages and Instagram accounts (Milestone 4).</li>
            <li>Bulk-upload Reels and add song metadata (Milestone 2).</li>
          </ol>
        </Card>

        <Card title="Recent activity" className="lg:col-span-2">
          {recent.length === 0 ? (
            <EmptyState title="No activity yet" description="Actions in this workspace will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-2">
                  <span>
                    <span className="font-medium">{r.actor?.name ?? r.actor?.email ?? "System"}</span>{" "}
                    <span className="text-slate-600">{r.action}</span>
                  </span>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={r.createdAt.toISOString()}>
                    {formatInTz(r.createdAt, ctx.workspace.timezone)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
