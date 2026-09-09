"use client";

import { useActionState } from "react";
import type { CaptionLanguage } from "@prisma/client";
import { updateWorkspaceSettingsAction } from "@/server/actions/workspace.actions";
import { COMMON_TIMEZONES } from "@/lib/timezones";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

type Initial = {
  name: string;
  timezone: string;
  defaultCaptionLanguage: CaptionLanguage;
  approvalRequired: boolean;
  autoApproveAiCaptions: boolean;
  safePublishIntervalSec: number;
  mediaRetentionDays: number | null;
};

export function SettingsForm({ slug, initial }: { slug: string; initial: Initial }) {
  const [state, action] = useActionState(updateWorkspaceSettingsAction.bind(null, slug), null);
  const timezones = COMMON_TIMEZONES.includes(initial.timezone as (typeof COMMON_TIMEZONES)[number])
    ? COMMON_TIMEZONES
    : [initial.timezone, ...COMMON_TIMEZONES];

  return (
    <form action={action} className="space-y-5">
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="success">Settings saved.</Alert> : null}

      <Field label="Workspace name" htmlFor="name">
        <Input id="name" name="name" defaultValue={initial.name} required minLength={2} maxLength={60} />
      </Field>

      <Field label="Default timezone" htmlFor="timezone" hint="Schedules are entered in this timezone and stored in UTC.">
        <Select id="timezone" name="timezone" defaultValue={initial.timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Default caption language" htmlFor="defaultCaptionLanguage">
        <Select id="defaultCaptionLanguage" name="defaultCaptionLanguage" defaultValue={initial.defaultCaptionLanguage}>
          <option value="HINGLISH">Hinglish</option>
          <option value="HI">Hindi</option>
          <option value="EN">English</option>
        </Select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Approval policy</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="approvalRequired" defaultChecked={initial.approvalRequired} className="mt-0.5" />
          <span>
            Require approval before scheduling
            <span className="block text-xs text-slate-500">Editors submit; Owners/Admins approve. Recommended.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="autoApproveAiCaptions" defaultChecked={initial.autoApproveAiCaptions} className="mt-0.5" />
          <span>
            Allow AI-generated captions to be published without human review
            <span className="block text-xs text-slate-500">Off by default. Only an Owner should enable this.</span>
          </span>
        </label>
      </fieldset>

      <Field
        label="Safe publishing interval (seconds)"
        htmlFor="safePublishIntervalSec"
        hint="Minimum gap between publishes to the same account. Slows the queue; it is not a guarantee against Meta restrictions."
      >
        <Input id="safePublishIntervalSec" name="safePublishIntervalSec" type="number" min={0} max={86400} defaultValue={initial.safePublishIntervalSec} />
      </Field>

      <Field label="Media retention (days)" htmlFor="mediaRetentionDays" hint="Leave empty to keep source videos forever. Published videos are never deleted automatically unless this is set.">
        <Input id="mediaRetentionDays" name="mediaRetentionDays" type="number" min={1} defaultValue={initial.mediaRetentionDays ?? ""} />
      </Field>

      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
