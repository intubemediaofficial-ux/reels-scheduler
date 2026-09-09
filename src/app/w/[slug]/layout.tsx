import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppError } from "@/lib/errors";
import { requireWorkspace, listUserWorkspaces } from "@/lib/tenant";
import { ROLE_LABELS } from "@/lib/rbac";
import { signOutAction } from "@/server/actions/auth.actions";
import { SidebarNav } from "./sidebar-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let ctx;
  try {
    ctx = await requireWorkspace(slug, "workspace.read");
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const memberships = await listUserWorkspaces(ctx.userId);

  const nav = [
    { href: `/w/${slug}`, label: "Dashboard" },
    { href: `/w/${slug}/team`, label: "Team & Roles", show: ctx.can("members.read") },
    { href: `/w/${slug}/settings`, label: "Workspace Settings", show: ctx.can("workspace.settings.manage") },
    { href: `/w/${slug}/audit`, label: "Audit Log", show: ctx.can("audit.read") },
  ].filter((n) => n.show !== false);

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="border-b border-slate-200 p-4">
          <Link href="/" className="text-sm font-semibold text-slate-900">
            Reels Scheduler
          </Link>
          <div className="mt-3">
            <WorkspaceSwitcher
              current={slug}
              workspaces={memberships.map((m) => ({ slug: m.workspace.slug, name: m.workspace.name }))}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Your role: {ROLE_LABELS[ctx.role]}</p>
        </div>
        <SidebarNav items={nav} />
        <div className="mt-auto border-t border-slate-200 p-4">
          <form action={signOutAction}>
            <button className="text-sm text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
