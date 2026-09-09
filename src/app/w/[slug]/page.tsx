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

  const now = new Date();
  const dayStart = new Date(new Date(now.toLocaleString("en-US", { timeZone: ctx.workspace.timezone })).setHours(0, 0, 0, 0));
  const tzOffsetMs = new Date(now.toLocaleString("en-US", { timeZone: ctx.workspace.timezone })).getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const todayStartUtc = new Date(dayStart.getTime() - tzOffsetMs);
  const weekEnd = new Date(now.getTime() + 7 * 86400_000);

  const [accounts, accountProblems, scheduled, publishedToday, failed, pendingApproval, upcoming, recent] = await Promise.all([
    db.socialAccount.count({ where: { workspaceId: wid, deletedAt: null } }),
    db.socialAccount.count({ where: { workspaceId: wid, deletedAt: null, health: { not: "CONNECTED" } } }),
    db.post.count({ where: { workspaceId: wid, deletedAt: null, status: "SCHEDULED" } }),
    db.postDestination.count({ where: { status: "PUBLISHED", publishedAt: { gte: todayStartUtc }, post: { workspaceId: wid } } }),
    db.post.count({ where: { workspaceId: wid, deletedAt: null, status: { in: ["FAILED", "PARTIALLY_PUBLISHED"] } } }),
    db.post.count({ where: { workspaceId: wid, deletedAt: null, status: "PENDING_APPROVAL" } }),
    db.schedule.findMany({ where: { scheduledAt: { gte: now, lte: weekEnd }, post: { workspaceId: wid, deletedAt: null, status: { in: ["SCHEDULED", "PUBLISHING"] } } }, orderBy: { scheduledAt: "asc" }, take: 10, include: { post: { include: { destinations: { include: { socialAccount: { select: { displayName: true, platform: true } } } } } } } }),
    db.auditLog.findMany({
      where: { workspaceId: wid },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);

  const stats = [
    { label: "Connected accounts", value: accounts, href: `/w/${slug}/accounts` },
    { label: "Scheduled Reels", value: scheduled, href: `/w/${slug}/posts?status=SCHEDULED` },
    { label: "Published today", value: publishedToday, href: `/w/${slug}/posts?status=PUBLISHED` },
    { label: "Failed posts", value: failed, href: `/w/${slug}/posts?status=FAILED`, alert: failed > 0 },
    { label: "Pending approvals", value: pendingApproval, href: `/w/${slug}/posts?status=PENDING_APPROVAL`, alert: pendingApproval > 0 },
    { label: "Account problems", value: accountProblems, href: `/w/${slug}/accounts`, alert: accountProblems > 0 },
  ];

  return (
    <>
      <PageHeader title={ctx.workspace.name} description={`Timezone ${ctx.workspace.timezone} · ${ctx.workspace.approvalRequired ? "Approval required before scheduling" : "Approval optional"}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={`rounded-xl border bg-white p-4 shadow-sm hover:border-indigo-300 ${s.alert ? "border-amber-300" : "border-slate-200"}`}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${s.alert ? "text-amber-700" : ""}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="How to publish a Reel" className="lg:col-span-1">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li><Link href={`/w/${slug}/accounts`} className="text-indigo-600 hover:underline">Connect</Link> your Facebook Page + Instagram Professional account.</li>
            <li><Link href={`/w/${slug}/library/upload`} className="text-indigo-600 hover:underline">Upload videos</Link> (bulk drag & drop) and fill song details + copyright confirmation.</li>
            <li>Select videos in the <Link href={`/w/${slug}/library`} className="text-indigo-600 hover:underline">library</Link> → Create posts.</li>
            <li>In each post: generate/edit caption, pick destinations, approve, schedule or Publish now.</li>
            <li>Track results in <Link href={`/w/${slug}/posts`} className="text-indigo-600 hover:underline">Posts</Link> and the <Link href={`/w/${slug}/calendar`} className="text-indigo-600 hover:underline">Calendar</Link>.</li>
          </ol>
        </Card>

        <Card title="Next 7 days" className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Scheduled Reels for the coming week will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 py-2">
                  <Link href={`/w/${slug}/posts/${s.postId}`} className="min-w-0 truncate font-medium hover:underline">{s.post.title}</Link>
                  <span className="truncate text-xs text-slate-500">{s.post.destinations.map((d) => `${d.socialAccount.platform === "INSTAGRAM" ? "IG" : "FB"} ${d.socialAccount.displayName}`).join(", ")}</span>
                  <time className="shrink-0 text-xs text-slate-500">{formatInTz(s.scheduledAt, ctx.workspace.timezone)}</time>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" className="lg:col-span-3">
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
