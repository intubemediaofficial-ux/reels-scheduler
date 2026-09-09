"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/server/actions/auth.actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Password updated</h1>
        <Alert kind="success">You can now sign in with your new password.</Alert>
        <Link href="/sign-in" className="text-sm text-indigo-600 hover:text-indigo-500">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" pendingText="Updating…">
        Update password
      </SubmitButton>
    </form>
  );
}
