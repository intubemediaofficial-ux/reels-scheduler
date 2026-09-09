"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/server/actions/auth.actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <Alert kind="success">If an account exists for that address, a reset link has been sent. It expires in one hour.</Alert>
        <Link href="/sign-in" className="text-sm text-indigo-600 hover:text-indigo-500">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Sending…">
        Send reset link
      </SubmitButton>
      <Link href="/sign-in" className="block text-center text-sm text-slate-600 hover:text-slate-900">
        Back to sign in
      </Link>
    </form>
  );
}
