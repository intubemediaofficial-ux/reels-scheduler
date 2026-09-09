"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimited, validation, runAction, type ActionResult } from "@/lib/errors";
import { registerUser, requestPasswordReset, resetPassword } from "@/server/services/auth.service";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters.").max(200);

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  email: z.string().trim().email("Enter a valid email."),
  password: passwordSchema,
});

async function clientKey(prefix: string): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
  return `${prefix}:${ip}`;
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export async function signUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await runAction(async () => {
    if (!checkRateLimit(await clientKey("signup"), 5, 60 * 60_000)) throw rateLimited();
    const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validation(firstIssue(parsed.error));
    await registerUser(parsed.data);
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
    return undefined;
  });
  if (result.ok) {
    const next = formData.get("next");
    redirect(typeof next === "string" && next.startsWith("/") ? next : "/onboarding");
  }
  return result;
}

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await runAction(async () => {
    if (!checkRateLimit(await clientKey("signin"), 30, 15 * 60_000)) throw rateLimited();
    const parsed = signInSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validation(firstIssue(parsed.error));
    try {
      await signIn("credentials", { ...parsed.data, redirect: false });
    } catch (e) {
      if (e instanceof AuthError) throw validation("Incorrect email or password.");
      throw e;
    }
    return undefined;
  });
  if (result.ok) {
    const next = formData.get("next");
    redirect(typeof next === "string" && next.startsWith("/") ? next : "/onboarding");
  }
  return result;
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export async function forgotPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (!checkRateLimit(await clientKey("forgot"), 5, 60 * 60_000)) throw rateLimited();
    const email = z.string().trim().email("Enter a valid email.").safeParse(formData.get("email"));
    if (!email.success) throw validation(firstIssue(email.error));
    await requestPasswordReset(email.data);
    return undefined;
  });
}

const resetSchema = z.object({ token: z.string().min(10), password: passwordSchema });

export async function resetPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (!checkRateLimit(await clientKey("reset"), 10, 60 * 60_000)) throw rateLimited();
    const parsed = resetSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validation(firstIssue(parsed.error));
    await resetPassword(parsed.data.token, parsed.data.password);
    return undefined;
  });
}
