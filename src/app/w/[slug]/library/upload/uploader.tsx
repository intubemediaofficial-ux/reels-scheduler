"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Alert, Button } from "@/components/ui";
import { completeUploadAction, createBatchAction, initUploadAction } from "@/server/actions/media.actions";

type Item = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "hashing" | "uploading" | "processing" | "ready" | "invalid" | "error";
  message?: string;
  warnings?: string[];
  assetId?: string;
};

const CONCURRENCY = 3;

async function sha256(file: File): Promise<string | null> {
  if (file.size > 512 * 1024 * 1024 || !crypto?.subtle) return null;
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

export function Uploader({ slug, maxMb }: { slug: string; maxMb: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<Item>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      const ok = /\.(mp4|mov)$/i.test(file.name) || ["video/mp4", "video/quicktime"].includes(file.type);
      next.push({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: ok && file.size <= maxMb * 1048576 ? "queued" : "invalid",
        message: !ok ? "Only MP4/MOV files" : file.size > maxMb * 1048576 ? `Larger than ${maxMb} MB` : undefined,
      });
    }
    setItems((prev) => [...prev, ...next]);
  }, [maxMb]);

  async function uploadOne(item: Item, batchId: string) {
    try {
      update(item.id, { status: "hashing" });
      const hash = await sha256(item.file);
      const init = await initUploadAction(slug, {
        batchId,
        filename: item.file.name,
        contentType: item.file.type || "video/mp4",
        sizeBytes: item.file.size,
        sha256: hash,
      });
      if (!init.ok) throw new Error(init.error);
      update(item.id, { status: "uploading", progress: 0 });
      await putWithProgress(init.data.upload.url, init.data.upload.headers, item.file, (pct) => update(item.id, { progress: pct }));
      update(item.id, { status: "processing", progress: 100 });
      const done = await completeUploadAction(slug, init.data.assetId);
      if (!done.ok) throw new Error(done.error);
      update(item.id, {
        assetId: init.data.assetId,
        status: done.data.status === "READY" ? "ready" : "invalid",
        message: done.data.errors.join(" ") || undefined,
        warnings: done.data.warnings,
      });
    } catch (e) {
      update(item.id, { status: "error", message: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function start() {
    const queue = items.filter((i) => i.status === "queued" || i.status === "error");
    if (!queue.length) return;
    setRunning(true);
    setError(null);
    const batch = await createBatchAction(slug);
    if (!batch.ok) {
      setError(batch.error);
      setRunning(false);
      return;
    }
    let idx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (idx < queue.length) {
        const item = queue[idx++];
        await uploadOne(item, batch.data.batchId);
      }
    });
    await Promise.all(workers);
    setRunning(false);
    router.refresh();
  }

  const pending = items.filter((i) => i.status === "queued" || i.status === "error").length;
  const readyItems = items.filter((i) => i.status === "ready");
  const readyCount = readyItems.length;
  const readyAssetIds = readyItems.map((i) => i.assetId).filter((x): x is string => Boolean(x));

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={clsx(
          "cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400",
        )}
      >
        <p className="text-sm font-medium text-slate-900">Drag & drop Reel videos here, or click to choose</p>
        <p className="mt-1 text-xs text-slate-500">MP4 or MOV · up to {maxMb} MB each · select as many as you like</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {!running && readyCount > 0 && !pending ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">{readyCount} video(s) uploaded. What next?</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-emerald-900/90">
            <li><span className="font-medium">Add song details</span> (title, artist) and confirm copyright.</li>
            <li><span className="font-medium">Create a post</span> for each video — that opens the editor where you write the caption, pick Instagram / Facebook accounts and approve.</li>
            <li><span className="font-medium">Schedule</span> a date &amp; time (or Publish now). The publisher posts it automatically.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => router.push(`/w/${slug}/library/batch?ids=${readyAssetIds.join(",")}&next=posts`)}>
              Add song details → create posts
            </Button>
            <Button variant="secondary" type="button" onClick={() => router.push(`/w/${slug}/library`)}>
              Go to library
            </Button>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{i.file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(i.file.size / 1048576).toFixed(1)} MB · {label(i)}
                  </p>
                  {i.message ? <p className={clsx("mt-0.5 text-xs", i.status === "ready" ? "text-slate-500" : "text-rose-600")}>{i.message}</p> : null}
                  {i.warnings?.length ? <p className="mt-0.5 text-xs text-amber-700">{i.warnings.join(" ")}</p> : null}
                  {i.status === "uploading" || i.status === "processing" ? (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-slate-100">
                      <div className="h-full bg-indigo-600 transition-all" style={{ width: `${i.progress}%` }} />
                    </div>
                  ) : null}
                </div>
                {i.status === "queued" || i.status === "invalid" || i.status === "error" ? (
                  <button type="button" onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))} className="text-xs text-slate-500 hover:text-rose-600" disabled={running}>
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              {items.length} file(s) · {readyCount} ready
            </p>
            <div className="flex gap-2">
              {readyCount ? (
                <Button variant="secondary" type="button" onClick={() => router.push(`/w/${slug}/library`)}>
                  Go to library
                </Button>
              ) : null}
              <Button type="button" onClick={start} disabled={running || !pending}>
                {running ? "Uploading…" : `Upload ${pending} file(s)`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function label(i: Item): string {
  switch (i.status) {
    case "queued":
      return "Waiting";
    case "hashing":
      return "Checking for duplicates…";
    case "uploading":
      return `Uploading ${i.progress}%`;
    case "processing":
      return "Validating video…";
    case "ready":
      return "Ready";
    case "invalid":
      return "Rejected";
    case "error":
      return "Failed — click Upload to retry";
  }
}
