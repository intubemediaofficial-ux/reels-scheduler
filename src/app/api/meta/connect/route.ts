import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { requireWorkspace } from "@/lib/tenant";
import { buildConnectUrl } from "@/server/services/accounts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts the Meta OAuth flow for the given workspace (`?workspace=<slug>`). */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("workspace") ?? "";
  try {
    const ctx = await requireWorkspace(slug, "accounts.manage");
    return NextResponse.redirect(buildConnectUrl(ctx));
  } catch (e) {
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") return NextResponse.redirect(new URL(`/sign-in?callbackUrl=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.nextUrl.origin));
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    console.error("[meta.connect]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Meta login is not configured." }, { status: 500 });
  }
}
