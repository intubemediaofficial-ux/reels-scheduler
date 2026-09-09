"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "@/server/actions/workspace.actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function AcceptInviteButton({ token }: { token: string }) {
  const [state, action] = useActionState(() => acceptInvitationAction(token), null);
  return (
    <form action={action} className="space-y-3">
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      <SubmitButton pendingText="Joining…">Accept invitation</SubmitButton>
    </form>
  );
}
