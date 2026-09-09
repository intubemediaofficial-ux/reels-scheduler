import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getInvitationByToken } from "@/server/services/workspace.service";
import { ROLE_LABELS } from "@/lib/rbac";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { AcceptInviteButton } from "./accept-invite-button";

export const metadata = { title: "Workspace invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [user, invitation] = await Promise.all([currentUser(), getInvitationByToken(token)]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16">
      <Card title="Workspace invitation">
        {!invitation ? (
          <div className="space-y-4">
            <Alert>This invitation is invalid, expired or has already been used. Ask the workspace owner to send a new one.</Alert>
            <Link href="/onboarding" className="text-sm text-indigo-600 hover:text-indigo-500">
              Go to your workspaces
            </Link>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p>
              <span className="font-medium">{invitation.invitedBy.name ?? invitation.invitedBy.email}</span> invited{" "}
              <span className="font-medium">{invitation.email}</span> to join{" "}
              <span className="font-medium">{invitation.workspace.name}</span> as {ROLE_LABELS[invitation.role]}.
            </p>
            {!user ? (
              <div className="space-y-2">
                <p className="text-slate-600">Sign in or create an account with that email to accept.</p>
                <div className="flex gap-2">
                  <ButtonLink href={`/sign-in?next=/invite/${token}`}>Sign in</ButtonLink>
                  <ButtonLink href={`/sign-up?next=/invite/${token}`} variant="secondary">
                    Create account
                  </ButtonLink>
                </div>
              </div>
            ) : user.email !== invitation.email ? (
              <Alert kind="warning">
                You are signed in as {user.email}, but this invitation is for {invitation.email}. Sign out and sign in with the invited
                address.
              </Alert>
            ) : (
              <AcceptInviteButton token={token} />
            )}
          </div>
        )}
      </Card>
    </main>
  );
}
