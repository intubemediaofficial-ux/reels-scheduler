import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { listUserWorkspaces } from "@/lib/tenant";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card } from "@/components/ui";
import { CreateWorkspaceForm } from "./create-workspace-form";
import { signOutAction } from "@/server/actions/auth.actions";

export const metadata = { title: "Workspaces" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const userId = await requireUserId();
  const memberships = await listUserWorkspaces(userId);
  const sp = await searchParams;
  const showAll = sp.switch === "1";

  if (memberships.length === 1 && !showAll) redirect(`/w/${memberships[0].workspace.slug}`);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{memberships.length ? "Choose a workspace" : "Create your first workspace"}</h1>
        <form action={signOutAction}>
          <button className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
        </form>
      </div>

      {memberships.length ? (
        <Card title="Your workspaces" className="mb-6">
          <ul className="divide-y divide-slate-100">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link href={`/w/${m.workspace.slug}`} className="flex items-center justify-between py-3 hover:bg-slate-50">
                  <span className="font-medium">{m.workspace.name}</span>
                  <span className="text-xs text-slate-500">{ROLE_LABELS[m.role]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title={memberships.length ? "Create another workspace" : "Workspace details"}
        description="A workspace holds your connected Instagram accounts, Facebook Pages, media and team. You'll be its Owner."
      >
        <CreateWorkspaceForm />
      </Card>
    </main>
  );
}
