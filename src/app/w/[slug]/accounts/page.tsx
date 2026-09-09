import { requireWorkspace } from "@/lib/tenant";
import { isMockMeta } from "@/lib/providers/meta";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { listAccounts } from "@/server/services/accounts.service";
import { ConnectionActions } from "./connection-actions";

const healthTone = { CONNECTED: "green", PERMISSION_REQUIRED: "amber", TOKEN_EXPIRING: "amber", DISCONNECTED: "slate", ERROR: "red" } as const;

export default async function AccountsPage({ params, searchParams }: PageProps<"/w/[slug]/accounts">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug, "accounts.read");
  const accounts = await listAccounts(ctx);
  const canManage = ctx.can("accounts.manage");
  const mock = isMockMeta();

  const byConnection = new Map<string, { name: string | null; status: string; lastError: string | null; expiresAt: Date | null; accounts: typeof accounts }>();
  for (const a of accounts) {
    const g = byConnection.get(a.connection.id) ?? { name: a.connection.metaUserName, status: a.connection.status, lastError: a.connection.lastError, expiresAt: a.connection.credential?.expiresAt ?? null, accounts: [] };
    g.accounts.push(a);
    byConnection.set(a.connection.id, g);
  }

  const connectHref = `/api/meta/connect?workspace=${encodeURIComponent(slug)}`;
  const connectButton = canManage ? (
    <a href={connectHref} className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1877F2] px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#166fe0]">
      Connect with Facebook
    </a>
  ) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Connected Accounts" description="Facebook Pages and Instagram Professional accounts this workspace can publish to." actions={connectButton} />

      {mock ? <div className="mb-4"><Alert kind="info">Meta is in sandbox (mock) mode: connecting adds demo accounts and publishing is simulated. Set META_PROVIDER=graph with your App ID/Secret for real accounts.</Alert></div> : null}
      {typeof sp.connected === "string" ? (
        <div className="mb-4">
          <Alert kind="success">
            Connected {sp.connected} account(s) across {sp.pages} Facebook Page(s).
            {typeof sp.missing === "string" && sp.missing ? ` Missing permissions: ${sp.missing}. Reconnect and accept all permissions.` : ""}
          </Alert>
        </div>
      ) : null}
      {typeof sp.error === "string" ? (
        <div className="mb-4">
          <Alert>
            {sp.error === "meta_denied" ? "Facebook login was cancelled or permissions were declined." : sp.error === "meta_state" ? "Login link expired. Please try again." : sp.error === "meta_user_mismatch" ? "Please finish connecting with the same account you started with." : "Meta connection failed."}
            {typeof sp.reason === "string" && sp.reason ? ` (${sp.reason})` : ""}
          </Alert>
        </div>
      ) : null}

      {byConnection.size === 0 ? (
        <EmptyState
          title="No accounts connected"
          description="Click Connect with Facebook, log in, and choose the Pages you manage. Instagram Professional accounts linked to those Pages are added automatically."
          action={connectButton}
        />
      ) : (
        <div className="space-y-4">
          {Array.from(byConnection.entries()).map(([id, g]) => (
            <Card
              key={id}
              title={`Meta login: ${g.name ?? "Facebook user"}`}
              description={g.lastError ?? (g.expiresAt ? `Login valid until ${g.expiresAt.toLocaleDateString("en-IN")}` : "Login active")}
              actions={canManage ? <ConnectionActions slug={slug} connectionId={id} connectHref={connectHref} /> : undefined}
            >
              <ul className="divide-y divide-slate-100">
                {g.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                    {a.profileImageUrl ? <img src={a.profileImageUrl} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-slate-200" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{a.displayName}{a.username ? <span className="text-slate-500"> @{a.username}</span> : null}</p>
                      <p className="text-xs text-slate-500">{a.platform === "INSTAGRAM" ? "Instagram Professional" : "Facebook Page"}{a.healthMessage ? ` · ${a.healthMessage}` : ""}</p>
                    </div>
                    <Badge tone={healthTone[a.health]}>{a.health.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Card title="How connecting works" className="mt-6">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Your Instagram account must be a Professional (Business or Creator) account linked to a Facebook Page you manage.</li>
          <li>Click Connect with Facebook and log in. We never see your password — Meta gives us a limited token.</li>
          <li>Approve the requested permissions and select the Pages to share. Linked Instagram accounts appear automatically.</li>
          <li>Tokens are encrypted at rest. Disconnect any time; you can also remove the app from Facebook Settings → Business Integrations.</li>
        </ol>
      </Card>
    </div>
  );
}
