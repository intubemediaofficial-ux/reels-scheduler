import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { requireUserId } from "@/lib/auth";
import { verifyOAuthState } from "@/lib/providers/meta/oauth-state";
import { MetaApiError } from "@/lib/providers/meta/types";
import { completeConnection } from "@/server/services/accounts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = sp.get("state") ?? "";
  const verified = verifyOAuthState(state, env().AUTH_SECRET);
  if (!verified.ok) return NextResponse.redirect(new URL("/onboarding?error=meta_state", req.nextUrl.origin));

  const workspace = await db.workspace.findFirst({ where: { id: verified.payload.workspaceId, deletedAt: null }, select: { slug: true } });
  if (!workspace) return NextResponse.redirect(new URL("/onboarding", req.nextUrl.origin));
  const back = (q: string) => NextResponse.redirect(new URL(`/w/${workspace.slug}/accounts?${q}`, req.nextUrl.origin));

  // The state binds the flow to the user who started it; require the same session.
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.redirect(new URL(`/sign-in?callbackUrl=${encodeURIComponent(`/w/${workspace.slug}/accounts`)}`, req.nextUrl.origin));
  }
  if (userId !== verified.payload.userId) return back("error=meta_user_mismatch");

  if (sp.get("error")) return back(`error=meta_denied&reason=${encodeURIComponent(sp.get("error_description") ?? sp.get("error_reason") ?? sp.get("error") ?? "")}`);
  const code = sp.get("code");
  if (!code) return back("error=meta_denied");

  try {
    const result = await completeConnection({ workspaceId: verified.payload.workspaceId, userId, code });
    const q = new URLSearchParams({ connected: String(result.accounts), pages: String(result.pages) });
    if (result.missingScopes.length) q.set("missing", result.missingScopes.join(","));
    return back(q.toString());
  } catch (e) {
    const msg = e instanceof MetaApiError || e instanceof AppError ? e.message : "Could not complete the Meta connection.";
    console.error("[meta.callback]", e instanceof Error ? e.message : e);
    return back(`error=meta_failed&reason=${encodeURIComponent(msg)}`);
  }
}
