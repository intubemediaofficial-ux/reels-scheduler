import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { POST_STATUS_LABEL, POST_STATUS_TONE } from "@/lib/post-status";
import { Badge, PageHeader } from "@/components/ui";

export const metadata = { title: "Calendar" };

function ymdInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function CalendarPage({ params, searchParams }: PageProps<"/w/[slug]/calendar">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug, "posts.read");
  const tz = ctx.workspace.timezone;

  const todayYmd = ymdInTz(new Date(), tz);
  const [y0, m0] = todayYmd.split("-").map(Number);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : `${y0}-${String(m0).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  const accountFilter = typeof sp.account === "string" ? sp.account : null;
  const statusFilter = typeof sp.status === "string" ? sp.status : null;

  // Generous UTC window; we bucket by workspace-timezone day afterwards.
  const from = new Date(Date.UTC(y, m - 1, 1) - 2 * 86400_000);
  const to = new Date(Date.UTC(y, m, 1) + 2 * 86400_000);
  const [schedules, accounts] = await Promise.all([
    db.schedule.findMany({
      where: {
        scheduledAt: { gte: from, lt: to },
        post: {
          workspaceId: ctx.workspace.id,
          deletedAt: null,
          ...(statusFilter && statusFilter in POST_STATUS_LABEL ? { status: statusFilter as keyof typeof POST_STATUS_LABEL } : {}),
          ...(accountFilter ? { destinations: { some: { socialAccountId: accountFilter } } } : {}),
        },
      },
      include: { post: { include: { destinations: { include: { socialAccount: { select: { displayName: true, platform: true } } } } } } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, displayName: true, platform: true } }),
  ]);

  const byDay = new Map<string, typeof schedules>();
  for (const s of schedules) {
    const k = ymdInTz(s.scheduledAt, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun
  const cells: (string | null)[] = [...Array<null>(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const q = (mm: string) => `/w/${slug}/calendar?month=${mm}${accountFilter ? `&account=${accountFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`;
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));

  return (
    <>
      <PageHeader title="Calendar" description={`All times shown in ${tz}.`} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link href={q(prev)} className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50">←</Link>
        <span className="min-w-[10rem] text-center font-medium">{monthLabel}</span>
        <Link href={q(next)} className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50">→</Link>
        <form className="ml-auto flex flex-wrap gap-2" method="get">
          <input type="hidden" name="month" value={month} />
          <select name="account" defaultValue={accountFilter ?? ""} className="rounded-md border border-slate-300 bg-white px-2 py-1">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.platform === "INSTAGRAM" ? "IG" : "FB"} · {a.displayName}</option>)}
          </select>
          <select name="status" defaultValue={statusFilter ?? ""} className="rounded-md border border-slate-300 bg-white px-2 py-1">
            <option value="">All statuses</option>
            {Object.entries(POST_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="rounded-md bg-slate-900 px-3 py-1 text-white">Filter</button>
        </form>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="bg-slate-50 p-2 text-center font-medium text-slate-600">{d}</div>)}
        {cells.map((day, i) => (
          <div key={i} className={`min-h-[7rem] bg-white p-1.5 ${day === todayYmd ? "ring-2 ring-inset ring-indigo-400" : ""}`}>
            {day ? <div className="mb-1 text-right text-slate-500">{Number(day.slice(-2))}</div> : null}
            <div className="space-y-1">
              {(day ? byDay.get(day) ?? [] : []).map((s) => (
                <Link key={s.id} href={`/w/${slug}/posts/${s.postId}`} className="block rounded border border-slate-200 p-1 hover:border-indigo-300" title={s.post.destinations.map((d) => d.socialAccount.displayName).join(", ")}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-slate-700">{new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(s.scheduledAt)}</span>
                    <Badge tone={POST_STATUS_TONE[s.post.status]}>{POST_STATUS_LABEL[s.post.status]}</Badge>
                  </div>
                  <p className="truncate font-medium">{s.post.title}</p>
                  <p className="truncate text-slate-500">{s.post.destinations.map((d) => `${d.socialAccount.platform === "INSTAGRAM" ? "IG" : "FB"} ${d.socialAccount.displayName}`).join(", ")}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
