import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppError } from "@/lib/errors";
import { requireWorkspace, listUserWorkspaces } from "@/lib/tenant";
import { ROLE_LABELS } from "@/lib/rbac";
import { signOutAction } from "@/server/actions/auth.actions";
import { SidebarNav, type NavItem } from "./sidebar-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { unreadCount } from "@/server/services/notification.service";

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let ctx;
  try {
    ctx = await requireWorkspace(slug, "workspace.read");
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [memberships, unread] = await Promise.all([listUserWorkspaces(ctx.userId), unreadCount(ctx.workspace.id, ctx.userId)]);

  const nav = ([
    { href: `/w/${slug}`, label: "Dashboard", icon: "home", exact: true },
    { href: `/w/${slug}/library/upload`, label: "Upload Reels", icon: "upload", show: ctx.can("media.upload") },
    { href: `/w/${slug}/library`, label: "Content Library", icon: "library", show: ctx.can("media.read") },
    { href: `/w/${slug}/posts`, label: "Posts", icon: "posts", show: ctx.can("posts.read") },
    { href: `/w/${slug}/calendar`, label: "Calendar", icon: "calendar", show: ctx.can("posts.read") },
    { href: `/w/${slug}/accounts`, label: "Connected Accounts", icon: "accounts", show: ctx.can("accounts.read") },
    { href: `/w/${slug}/notifications`, label: "Notifications", icon: "bell", badge: unread, show: ctx.can("notifications.read") },
    { href: `/w/${slug}/team`, label: "Team & Roles", icon: "team", show: ctx.can("members.read") },
    { href: `/w/${slug}/settings`, label: "Workspace Settings", icon: "settings", show: ctx.can("workspace.settings.manage") },
    { href: `/w/${slug}/audit`, label: "Audit Log", icon: "audit", show: ctx.can("audit.read") },
  ] satisfies (NavItem & { show?: boolean })[]).filter((n) => n.show !== false);
  const items: NavItem[] = nav.map(({ show: _show, ...n }) => n);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50 md:flex-row">
      <aside className="flex w-full flex-col bg-slate-900 text-slate-100 md:sticky md:top-0 md:h-screen md:w-64">
        <div className="px-5 pb-3 pt-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-pink-500 via-fuchsia-500 to-indigo-500 text-sm font-bold text-white">R</span>
            <span className="text-base font-semibold tracking-tight">Reels Scheduler</span>
          </Link>
          <div className="mt-4">
            <WorkspaceSwitcher current={slug} workspaces={memberships.map((m) => ({ slug: m.workspace.slug, name: m.workspace.name }))} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Role: {ROLE_LABELS[ctx.role]} · {ctx.workspace.timezone}</p>
        </div>
        <SidebarNav items={items} />
        <div className="mt-auto border-t border-white/10 p-4">
          <form action={signOutAction}>
            <button className="text-sm text-slate-400 hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-10">{children}</main>
    </div>
  );
}
