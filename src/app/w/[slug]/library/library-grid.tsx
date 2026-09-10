"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { createPostsFromAssetsAction } from "@/server/actions/post.actions";

export type LibraryItem = {
  id: string;
  filename: string;
  status: string;
  sizeMb: number;
  durationSec: number | null;
  aspectRatio: string | null;
  createdAt: string;
  songTitle: string | null;
  artist: string | null;
  copyrightConfirmed: boolean;
  postCount: number;
  errors: string[];
};

const tone: Record<string, "green" | "amber" | "red" | "slate"> = { READY: "green", INVALID: "red", PENDING_UPLOAD: "amber", INSPECTING: "amber", UPLOADED: "amber" };

export function LibraryGrid({ slug, items, canEdit, canCreatePosts }: { slug: string; items: LibraryItem[]; canEdit: boolean; canCreatePosts: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const ids = Array.from(selected);
  const readyIds = ids.filter((id) => items.find((i) => i.id === id)?.status === "READY");

  return (
    <div className="space-y-3">
      {(canEdit || canCreatePosts) && items.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={selected.size === items.length && items.length > 0}
              onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
            />
            Select all
          </label>
          <span className="text-slate-500">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            {canEdit ? (
              <Button variant="secondary" disabled={!ids.length} onClick={() => router.push(`/w/${slug}/library/batch?ids=${ids.join(",")}`)}>
                Edit metadata
              </Button>
            ) : null}
            {canCreatePosts ? (
              <Button
                disabled={!readyIds.length || pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const r = await createPostsFromAssetsAction(slug, readyIds);
                    if (!r.ok) setError(r.error);
                    else router.push(r.data.postIds.length === 1 ? `/w/${slug}/posts/${r.data.postIds[0]}` : `/w/${slug}/posts`);
                  });
                }}
              >
                {pending ? "Creating…" : `Create ${readyIds.length || ""} post(s)`}
              </Button>
            ) : null}
          </div>
          {error ? <p className="w-full text-xs text-rose-600">{error}</p> : null}
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
            {canEdit || canCreatePosts ? (
              <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" checked={selected.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.filename}`} />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/w/${slug}/library/${i.id}`} className="truncate text-sm font-medium text-slate-900 hover:underline">
                  {i.songTitle || i.filename}
                </Link>
                <Badge tone={tone[i.status] ?? "slate"}>{i.status === "READY" ? "Ready" : i.status === "INVALID" ? "Rejected" : "Processing"}</Badge>
              </div>
              <p className="truncate text-xs text-slate-500">{i.artist ? `${i.artist} · ` : ""}{i.filename}</p>
              <p className="mt-1 text-xs text-slate-500">
                {i.durationSec ? `${Math.round(i.durationSec)}s · ` : ""}
                {i.aspectRatio ? `${i.aspectRatio} · ` : ""}
                {i.sizeMb.toFixed(1)} MB
                {i.postCount ? ` · ${i.postCount} post(s)` : ""}
              </p>
              {i.errors.length ? <p className="mt-1 text-xs text-rose-600">{i.errors[0]}</p> : null}
              {!i.copyrightConfirmed && i.status === "READY" ? <p className="mt-1 text-xs text-amber-700">Copyright not confirmed</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
