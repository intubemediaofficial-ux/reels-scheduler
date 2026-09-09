"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "@/server/actions/auth.actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUpAction, null);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Create your account</h1>
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={80} />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" pendingText="Creating…">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </form>
  );
}
