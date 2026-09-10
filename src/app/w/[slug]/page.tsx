import Link from "next/link";
import { clsx } from "clsx";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/tenant";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { formatInTz } from "@/lib/format";
import { POST_STATUS_LABEL, POST_STATUS_TONE } from "@/lib/post-status";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug, "workspace.read");
  const wid = ctx.workspace.id;
  const tz = ctx.workspace.timezone;

  const now = new Date();
  const dayStart = new Date(new Date(now.toLocaleString("en-US", { timeZone: tz })).setHours(0, 0, 0, 0));
  const tzOffsetMs = new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const todayStartUtc = new Date(dayStart.getTime() - tzOffsetMs);
  const weekEnd = new Date(now.getTime() + 7 * 86400_000);

  const [accounts, accountProblems, videos, videosWithoutPost, publishedToday, statusGroups, upcoming, needsWork, recent] = await Promise.all([
    db.socialAccount.count({ where: { workspaceId: wid, deletedAt: null } }),
    db.socialAccount.count({ where: { workspaceId: wid, deletedAt: null, health: { not: "CONNECTED" } } }),
    db.mediaAsset.count({ where: { workspaceId: wid, deletedAt: null } }),
    db.mediaAsset.findMany({ where: { workspaceId: wid, deletedAt: null, storageStatus: "READY", posts: { none: { deletedAt: null } } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, originalFilename: true, createdAt: true, songMetadata: { select: { songTitle: true, copyrightConfirmed: true } } } }),
    db.postDestination.count({ where: { status: "PUBLISHED", publishedAt: { gte: todayStartUtc }, post: { workspaceId: wid } } }),
    db.post.groupBy({ by: ["status"], where: { workspaceId: wid, deletedAt: null }, _count: { _all: true } }),
    db.schedule.findMany({ where: { scheduledAt: { gte: now, lte: weekEnd }, post: { workspaceId: wid, deletedAt: null, status: { in: ["SCHEDULED", "PUBLISHING"] } } }, orderBy: { scheduledAt: "asc" }, take: 8, include: { post: { include: { destinations: { include: { socialAccount: { select: { displayName: true, platform: true } } } } } } } }),
    db.post.findMany({ where: { workspaceId: wid, deletedAt: null, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "FAILED", "PARTIALLY_PUBLISHED", "REJECTED"] } }, orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, title: true, status: true, updatedAt: true, mediaAsset: { select: { originalFilename: true } }, destinations: { select: { id: true } }, captions: { where: { isSelected: true }, select: { id: true } } } }),
    db.auditLog.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 6, include: { actor: { select: { name: true, email: true } } } }),
  ]);

  const count = (s: string) => statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const drafts = count("DRAFT");
  const pendingApproval = count("PENDING_APPROVAL");
  const approved = count("APPROVED");
  const scheduled = count("SCHEDULED");
  const published = count("PUBLISHED");
  const failed = count("FAILED") + count("PARTIALLY_PUBLISHED");
  const totalPosts = statusGroups.reduce((n, g) => n + g._count._all, 0);

  // --- Getting-started checklist (live state) ---
  const steps: { title: string; hint: string; done: boolean; href: string; cta: string; icon: IconName }[] = [
    { icon: "accounts", title: "Connect Instagram & Facebook", hint: "Login with Facebook once — your Pages and linked Instagram Professional accounts are picked up automatically. No Instagram password needed.", done: accounts > 0, href: `/w/${slug}/accounts`, cta: "Connect accounts" },
    { icon: "upload", title: "Upload your Reel videos", hint: "Drag & drop many videos at once. Then add song title / artist and confirm copyright.", done: videos > 0, href: `/w/${slug}/library/upload`, cta: "Upload videos" },
    { icon: "posts", title: "Create a post from a video", hint: "Select videos in the Library → Create posts. One post = one Reel that can go to many accounts.", done: totalPosts > 0, href: `/w/${slug}/library`, cta: "Open library" },
    { icon: "sparkles", title: "Caption, destinations, approve", hint: "In the post: Generate caption (Hindi / English / Hinglish) → tick the accounts → Approve.", done: approved + scheduled + published + failed > 0, href: `/w/${slug}/posts`, cta: "Open posts" },
    { icon: "calendar", title: "Schedule or publish now", hint: `Pick a date & time (${tz}). The publisher posts it automatically and shows the result here.`, done: scheduled + published + failed > 0, href: `/w/${slug}/calendar`, cta: "Open calendar" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  const stats: { label: string; value: number; href: string; icon: IconName; tone: "indigo" | "emerald" | "amber" | "rose" | "slate" }[] = [
    { label: "Connected accounts", value: accounts, href: `/w/${slug}/accounts`, icon: "accounts", tone: accountProblems > 0 ? "amber" : "indigo" },
    { label: "Videos in library", value: videos, href: `/w/${slug}/library`, icon: "library", tone: "slate" },
    { label: "Scheduled", value: scheduled, href: `/w/${slug}/posts?status=SCHEDULED`, icon: "clock", tone: "indigo" },
    { label: "Published today", value: publishedToday, href: `/w/${slug}/posts?status=PUBLISHED`, icon: "check", tone: "emerald" },
    { label: "Waiting for approval", value: pendingApproval, href: `/w/${slug}/posts?status=PENDING_APPROVAL`, icon: "alert", tone: pendingApproval > 0 ? "amber" : "slate" },
    { label: "Failed", value: failed, href: `/w/${slug}/posts?status=FAILED`, icon: "alert", tone: failed > 0 ? "rose" : "slate" },
  ];
  const toneClass = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
  } as const;

  const pipeline = [
    { label: "Draft", n: drafts, href: `/w/${slug}/posts?status=DRAFT`, bar: "bg-slate-400" },
    { label: "Pending approval", n: pendingApproval, href: `/w/${slug}/posts?status=PENDING_APPROVAL`, bar: "bg-amber-400" },
    { label: "Approved", n: approved, href: `/w/${slug}/posts?status=APPROVED`, bar: "bg-sky-400" },
    { label: "Scheduled", n: scheduled, href: `/w/${slug}/posts?status=SCHEDULED`, bar: "bg-indigo-500" },
    { label: "Published", n: published, href: `/w/${slug}/posts?status=PUBLISHED`, bar: "bg-emerald-500" },
    { label: "Failed", n: failed, href: `/w/${slug}/posts?status=FAILED`, bar: "bg-rose-500" },
  ];
  const pipelineMax = Math.max(1, ...pipeline.map((p) => p.n));

  return (
    <>
      <PageHeader
        title={ctx.workspace.name}
        description={`Schedule Instagram & Facebook Reels · ${tz} · ${ctx.workspace.approvalRequired ? "approval required before scheduling" : "approval optional"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {ctx.can("accounts.manage") ? <ButtonLink href={`/w/${slug}/accounts`} variant="secondary"><Icon.accounts /> Connect account</ButtonLink> : null}
            {ctx.can("media.upload") ? <ButtonLink href={`/w/${slug}/library/upload`}><Icon.upload /> Upload Reels</ButtonLink> : null}
          </div>
        }
      />

      {/* Getting started / next step banner */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-fuchsia-900 text-white shadow-lg">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr] lg:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">{doneCount === steps.length ? "All set" : `Step ${doneCount + 1} of ${steps.length}`}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{nextStep ? nextStep.title : "Your Reels pipeline is running"}</h2>
            <p className="mt-2 max-w-xl text-sm text-indigo-100/90">{nextStep ? nextStep.hint : "Upload more videos, or check the calendar for what goes out next."}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {nextStep ? <ButtonLink href={nextStep.href} className="bg-white text-slate-900 hover:bg-indigo-50">{nextStep.cta} <Icon.arrow /></ButtonLink> : <ButtonLink href={`/w/${slug}/library/upload`} className="bg-white text-slate-900 hover:bg-indigo-50">Upload more <Icon.arrow /></ButtonLink>}
              <ButtonLink href={`/w/${slug}/posts`} variant="ghost" className="text-white hover:bg-white/10">View all posts</ButtonLink>
            </div>
            <div className="mt-6 h-1.5 w-full max-w-xl overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-pink-400 to-indigo-300 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
          </div>
          <ol className="grid gap-2 text-sm">
            {steps.map((s, i) => {
              const I = Icon[s.icon];
              const current = s === nextStep;
              return (
                <li key={s.title}>
                  <Link href={s.href} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2 transition", current ? "bg-white/15 ring-1 ring-white/30" : "hover:bg-white/10", s.done && "opacity-80")}>
                    <span className={clsx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", s.done ? "bg-emerald-400 text-emerald-950" : current ? "bg-white text-slate-900" : "bg-white/15 text-white")}>{s.done ? <Icon.check width={14} height={14} /> : i + 1}</span>
                    <I className="shrink-0 text-indigo-200" />
                    <span className={clsx("flex-1", s.done && "line-through decoration-white/40")}>{s.title}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => {
          const I = Icon[s.icon];
          return (
            <Link key={s.label} href={s.href} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow">
              <div className="flex items-center justify-between">
                <span className={clsx("grid h-9 w-9 place-items-center rounded-lg", toneClass[s.tone])}><I /></span>
                <Icon.arrow className="text-slate-300 transition group-hover:text-indigo-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Pipeline */}
        <Card title="Post pipeline" description="Every Reel moves left → right." className="lg:col-span-1">
          {totalPosts === 0 ? (
            <EmptyState title="No posts yet" description="Upload a video and create a post to see it here." />
          ) : (
            <ul className="space-y-3">
              {pipeline.map((p) => (
                <li key={p.label}>
                  <Link href={p.href} className="block hover:opacity-80">
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-700">{p.label}</span><span className="font-semibold tabular-nums">{p.n}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100"><div className={clsx("h-2 rounded-full", p.bar)} style={{ width: `${(p.n / pipelineMax) * 100}%` }} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Upcoming */}
        <Card title="Going out in the next 7 days" className="lg:col-span-2" actions={<Link href={`/w/${slug}/calendar`} className="text-sm text-indigo-600 hover:underline">Calendar →</Link>}>
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Open a post → Schedule → pick a date and time. It will show up here." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-center gap-4 py-2.5">
                  <div className="w-28 shrink-0 text-xs text-slate-500">
                    <div className="font-medium text-slate-800">{formatInTz(s.scheduledAt, tz).split(",")[0]}</div>
                    <div>{formatInTz(s.scheduledAt, tz).split(",").slice(1).join(",").trim()}</div>
                  </div>
                  <Link href={`/w/${slug}/posts/${s.postId}`} className="min-w-0 flex-1 truncate font-medium text-slate-900 hover:underline">{s.post.title}</Link>
                  <div className="flex shrink-0 gap-1">
                    {s.post.destinations.map((d) => (
                      <span key={d.id} title={d.socialAccount.displayName} className={clsx("grid h-6 w-6 place-items-center rounded-full text-white", d.socialAccount.platform === "INSTAGRAM" ? "bg-gradient-to-br from-pink-500 to-amber-400" : "bg-blue-600")}>
                        {d.socialAccount.platform === "INSTAGRAM" ? <Icon.instagram width={13} height={13} /> : <Icon.facebook width={13} height={13} />}
                      </span>
                    ))}
                  </div>
                  <Badge tone={POST_STATUS_TONE[s.post.status]}>{POST_STATUS_LABEL[s.post.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Needs attention */}
        <Card title="Needs your attention" description="Videos without a post, and posts that are not scheduled yet." className="lg:col-span-2">
          {videosWithoutPost.length === 0 && needsWork.length === 0 ? (
            <EmptyState title="All clear" description="Everything uploaded has a post, and nothing is waiting on you." />
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {videosWithoutPost.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon.library /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/w/${slug}/library/${v.id}`} className="block truncate font-medium text-slate-900 hover:underline">{v.songMetadata?.songTitle || v.originalFilename}</Link>
                    <p className="text-xs text-slate-500">{v.songMetadata?.copyrightConfirmed ? "Video ready — create a post from the Library" : "Add song details + confirm copyright, then create a post"}</p>
                  </div>
                  <ButtonLink href={`/w/${slug}/library`} variant="secondary" className="shrink-0">Create post</ButtonLink>
                </li>
              ))}
              {needsWork.map((p) => {
                const todo = p.status === "DRAFT" ? (p.destinations.length === 0 ? "Pick destinations" : p.captions.length === 0 ? "Add a caption" : ctx.workspace.approvalRequired ? "Submit for approval" : "Approve & schedule") : p.status === "PENDING_APPROVAL" ? "Waiting for approval" : p.status === "APPROVED" ? "Schedule it" : p.status === "REJECTED" ? "Fix and resubmit" : "Retry failed destinations";
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon.posts /></span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/w/${slug}/posts/${p.id}`} className="block truncate font-medium text-slate-900 hover:underline">{p.title || p.mediaAsset.originalFilename}</Link>
                      <p className="text-xs text-slate-500">Next: {todo}</p>
                    </div>
                    <Badge tone={POST_STATUS_TONE[p.status]}>{POST_STATUS_LABEL[p.status]}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Activity */}
        <Card title="Recent activity" className="lg:col-span-1" actions={ctx.can("audit.read") ? <Link href={`/w/${slug}/audit`} className="text-sm text-indigo-600 hover:underline">Audit log →</Link> : undefined}>
          {recent.length === 0 ? (
            <EmptyState title="No activity yet" description="Actions in this workspace will appear here." />
          ) : (
            <ul className="space-y-3 text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                  <div className="min-w-0">
                    <p className="truncate"><span className="font-medium">{r.actor?.name ?? r.actor?.email ?? "System"}</span> <span className="text-slate-600">{r.action.replace(/[._]/g, " ")}</span></p>
                    <time className="text-xs text-slate-500" dateTime={r.createdAt.toISOString()}>{formatInTz(r.createdAt, tz)}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
