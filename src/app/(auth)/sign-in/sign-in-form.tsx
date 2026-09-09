"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "@/server/actions/auth.actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, null);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <div className="flex justify-between text-sm text-slate-600">
        <Link href="/forgot-password" className="hover:text-slate-900">
          Forgot password?
        </Link>
        <Link href="/sign-up" className="hover:text-slate-900">
          Create account
        </Link>
      </div>
    </form>
  );
}
