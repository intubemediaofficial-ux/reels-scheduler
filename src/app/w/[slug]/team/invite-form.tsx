"use client";

import { useActionState } from "react";
import type { WorkspaceRole } from "@prisma/client";
import { inviteMemberAction } from "@/server/actions/workspace.actions";
import { ROLE_LABELS } from "@/lib/rbac";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function InviteForm({ slug, roles }: { slug: string; roles: WorkspaceRole[] }) {
  const [state, action] = useActionState(inviteMemberAction.bind(null, slug), null);
  return (
    <form action={action} className="space-y-3">
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      {state?.ok ? (
        <Alert kind="success">
          Invitation sent. Share this link if the email does not arrive:
          <code className="mt-1 block break-all text-xs">{state.data.url}</code>
        </Alert>
      ) : null}
      <Field label="Email" htmlFor="invite-email">
        <Input id="invite-email" name="email" type="email" required />
      </Field>
      <Field label="Role" htmlFor="invite-role">
        <Select id="invite-role" name="role" defaultValue={roles.includes("EDITOR") ? "EDITOR" : roles[0]}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
    </form>
  );
}
