import { NextResponse, type NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { localStorageOrNull } from "@/lib/providers/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed, time-limited read for STORAGE_PROVIDER=local (used by Meta to fetch the video). */
export async function GET(req: NextRequest) {
  const local = localStorageOrNull();
  if (!local) return NextResponse.json({ error: "Local storage disabled" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const key = searchParams.get("key") ?? "";
  const exp = Number(searchParams.get("exp"));
  const sig = searchParams.get("sig") ?? "";
  if (!key || !local.verify("get", key, exp, sig)) return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });

  const head = await local.head(key);
  if (!head) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = req.headers.get("range");
  const ext = key.split(".").pop()?.toLowerCase();
  const type = ext === "mov" ? "video/quicktime" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "video/mp4";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=0" };

  const { path: file } = await local.toLocalFile(key);
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
    if (start >= head.size || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
    headers["Content-Range"] = `bytes ${start}-${end}/${head.size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new NextResponse(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers["Content-Length"] = String(head.size);
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
}
