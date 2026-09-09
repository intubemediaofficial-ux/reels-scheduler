import { NextResponse, type NextRequest } from "next/server";
import { localStorageOrNull } from "@/lib/providers/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed direct upload target for STORAGE_PROVIDER=local. Body is streamed to disk. */
export async function PUT(req: NextRequest) {
  const local = localStorageOrNull();
  if (!local) return NextResponse.json({ error: "Local storage disabled" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const key = searchParams.get("key") ?? "";
  const exp = Number(searchParams.get("exp"));
  const len = Number(searchParams.get("len"));
  const sig = searchParams.get("sig") ?? "";
  const contentType = req.headers.get("content-type") ?? "";

  if (!key || !local.verify("put", key, exp, sig, `${contentType}:${len}`)) {
    return NextResponse.json({ error: "Invalid or expired upload signature" }, { status: 403 });
  }

  try {
    const written = await local.write(key, req.body, len);
    if (written !== len) {
      await local.delete(key);
      return NextResponse.json({ error: "Size mismatch" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, size: written });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
