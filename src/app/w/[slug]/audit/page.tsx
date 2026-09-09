import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatInTz } from "@/lib/format";

export const metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;

export default async function AuditPage({ params, searchParams }: PageProps<"/w/[slug]/audit">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug, "audit.read");
  const page = Math.max(1, Number(sp.page) || 1);

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditLog.count({ where: { workspaceId: ctx.workspace.id } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Audit Log" description={`${total} events. Tokens and secrets are never recorded.`} />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No events yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-600">{formatInTz(r.createdAt, ctx.workspace.timezone)}</td>
                    <td className="py-2 pr-4">{r.actor?.name ?? r.actor?.email ?? "System"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.action}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.targetType ? `${r.targetType} ${r.targetId?.slice(0, 8) ?? ""}` : "—"}</td>
                    <td className="py-2 font-mono text-xs text-slate-600">{r.metadata ? JSON.stringify(r.metadata) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 1 ? <Link href={`/w/${slug}/audit?page=${page - 1}`} className="text-indigo-600 hover:underline">Newer</Link> : <span />}
            <span className="text-slate-500">
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={`/w/${slug}/audit?page=${page + 1}`} className="text-indigo-600 hover:underline">Older</Link> : <span />}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
