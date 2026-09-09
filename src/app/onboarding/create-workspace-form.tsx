"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "@/server/actions/workspace.actions";
import { COMMON_TIMEZONES } from "@/lib/timezones";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function CreateWorkspaceForm() {
  const [state, action] = useActionState(createWorkspaceAction, null);
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      <Field label="Workspace name" htmlFor="name" hint="Usually your label, brand or channel name.">
        <Input id="name" name="name" required minLength={2} maxLength={60} placeholder="Bainsla Music" />
      </Field>
      <Field label="Default timezone" htmlFor="timezone" hint="Schedules are entered in this timezone and stored in UTC.">
        <Select id="timezone" name="timezone" defaultValue="Asia/Kolkata">
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton pendingText="Creating…">Create workspace</SubmitButton>
    </form>
  );
}
