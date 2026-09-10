import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { formatInTz } from "@/lib/format";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { markAllReadAction } from "@/server/actions/notification.actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: PageProps<"/w/[slug]/notifications">) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug, "notifications.read");
  const items = await db.notification.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 100 });
  const markAll = markAllReadAction.bind(null, slug);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" actions={items.some((n) => !n.readAt) ? <form action={markAll}><Button variant="secondary" type="submit">Mark all read</Button></form> : undefined} />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" description="Approvals, schedules, publishing results and account problems appear here." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {items.map((n) => {
            const href = n.href ? (n.href.startsWith("/w/") ? n.href : `/w/${slug}${n.href}`) : null;
            const inner = (
              <div className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-indigo-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className={n.readAt ? "text-slate-700" : "font-medium text-slate-900"}>{n.title}</p>
                  {n.body ? <p className="mt-0.5 line-clamp-2 text-slate-600">{n.body}</p> : null}
                </div>
                <time className="shrink-0 text-xs text-slate-500">{formatInTz(n.createdAt, ctx.workspace.timezone)}</time>
              </div>
            );
            return <li key={n.id}>{href ? <Link href={href} className="block hover:bg-slate-50">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
