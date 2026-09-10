"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountHealth, AudioMode, CaptionKind, CaptionLanguage, DestinationStatus, PostStatus, PublishErrorClass, PublishJobStatus, SocialPlatform } from "@prisma/client";
import { Alert, Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { CAPTION_TONES } from "@/lib/providers/ai/types";
import { DEST_STATUS_TONE } from "@/lib/post-status";
import type { ActionResult } from "@/lib/errors";
import {
  approvePostAction,
  backToDraftAction,
  cancelPostAction,
  deleteCaptionAction,
  deletePostAction,
  generateCaptionAction,
  rejectPostAction,
  retryFailedAction,
  saveCaptionAction,
  schedulePostAction,
  selectCaptionAction,
  setDestinationsAction,
  submitForApprovalAction,
  unschedulePostAction,
  updatePostBasicsAction,
} from "@/server/actions/post.actions";

export type PostEditorData = {
  id: string;
  title: string;
  status: PostStatus;
  audioMode: AudioMode;
  rejectionComment: string | null;
  approvedBy: string | null;
  createdBy: string;
  previewUrl: string | null;
  asset: { id: string; filename: string; status: string; durationSec: number | null; aspectRatio: string | null; copyrightConfirmed: boolean; songTitle: string | null; artist: string | null };
  captions: { id: string; platform: SocialPlatform | null; kind: CaptionKind; language: CaptionLanguage; text: string; hashtags: string[]; callToAction: string | null; aiGenerated: boolean; aiModel: string | null; isSelected: boolean; createdAt: string }[];
  destinations: {
    id: string;
    socialAccountId: string;
    status: DestinationStatus;
    permalink: string | null;
    metaMediaId: string | null;
    publishedAt: string | null;
    lastErrorClass: PublishErrorClass | null;
    lastErrorMessage: string | null;
    job: { status: PublishJobStatus; attemptCount: number; maxAttempts: number; nextRetryAt: string | null; runAt: string; attempts: { n: number; success: boolean | null; errorClass: PublishErrorClass | null; errorMessage: string | null; at: string }[] } | null;
  }[];
  accounts: { id: string; platform: SocialPlatform; displayName: string; username: string | null; health: AccountHealth }[];
  schedule: { scheduledAt: string; timezone: string } | null;
  workspaceTimezone: string;
  approvalRequired: boolean;
  can: { edit: boolean; generate: boolean; submit: boolean; approve: boolean; schedule: boolean; publish: boolean; cancel: boolean };
};

const EDITABLE: PostStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "FAILED", "CANCELLED"];
const LANG_LABEL: Record<CaptionLanguage, string> = { EN: "English", HI: "Hindi", HINGLISH: "Hinglish" };

function toLocalInput(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

/** Convert a wall-clock "YYYY-MM-DDTHH:mm" in `tz` to a UTC ISO string. */
function fromLocalInput(local: string, tz: string): string {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const asTz = new Date(new Date(guess).toLocaleString("en-US", { timeZone: tz })).getTime();
  const asUtc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess - (asTz - asUtc)).toISOString();
}

export function PostEditor({ slug, post }: { slug: string; post: PostEditorData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = EDITABLE.includes(post.status) && post.can.edit;

  const run = <T,>(fn: () => Promise<ActionResult<T>>, after?: (r: T) => void) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else after?.(r.data);
      router.refresh();
    });

  // --- destinations ---
  const [destIds, setDestIds] = useState<string[]>(post.destinations.map((d) => d.socialAccountId));
  const destDirty = useMemo(() => JSON.stringify([...destIds].sort()) !== JSON.stringify(post.destinations.map((d) => d.socialAccountId).sort()), [destIds, post.destinations]);

  // --- caption generation ---
  const [gen, setGen] = useState({ language: "HINGLISH" as CaptionLanguage, tone: "Friendly" as (typeof CAPTION_TONES)[number], length: "standard" as "short" | "standard" | "promotional", hashtagCount: 12, emojiLevel: "light" as "none" | "light" | "heavy", platform: "" as "" | SocialPlatform });

  // --- caption editing ---
  const [editing, setEditing] = useState<{ id: string | null; text: string; hashtags: string; cta: string; language: CaptionLanguage; platform: "" | SocialPlatform } | null>(null);

  // --- scheduling ---
  const [tz, setTz] = useState(post.schedule?.timezone ?? post.workspaceTimezone);
  const [when, setWhen] = useState(() => toLocalInput(post.schedule?.scheduledAt ?? new Date(Date.now() + 3600_000).toISOString(), post.schedule?.timezone ?? post.workspaceTimezone));
  const [rejectComment, setRejectComment] = useState("");
  const timezones = useMemo(() => Array.from(new Set([post.workspaceTimezone, post.schedule?.timezone ?? post.workspaceTimezone, ...Intl.supportedValuesOf("timeZone")])), [post.workspaceTimezone, post.schedule?.timezone]);

  const readiness: string[] = [];
  if (post.asset.status !== "READY") readiness.push("Video is still processing or invalid.");
  if (!post.asset.copyrightConfirmed) readiness.push("Copyright not confirmed in song metadata.");
  if (post.destinations.length === 0) readiness.push("No destination accounts selected.");
  if (!post.captions.some((c) => c.isSelected)) readiness.push("No caption selected.");

  const captionLimit = 2200;

  const isScheduledOrLater = ["SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIALLY_PUBLISHED", "FAILED"].includes(post.status);
  const steps = [
    { id: "video", label: "Video & song", done: post.asset.status === "READY" && post.asset.copyrightConfirmed, hint: post.asset.copyrightConfirmed ? `${post.asset.songTitle ?? post.asset.filename}` : "Add song details + confirm copyright" },
    { id: "destinations", label: "Destinations", done: post.destinations.length > 0, hint: post.destinations.length ? `${post.destinations.length} account(s)` : "Tick Instagram / Facebook accounts" },
    { id: "caption", label: "Caption", done: post.captions.some((c) => c.isSelected), hint: post.captions.some((c) => c.isSelected) ? "Selected" : "Generate or write, then Select" },
    { id: "approve", label: "Approve", done: ["APPROVED"].includes(post.status) || isScheduledOrLater, hint: post.status === "PENDING_APPROVAL" ? "Waiting for approver" : post.status === "REJECTED" ? "Rejected — fix & resubmit" : "" },
    { id: "schedule", label: "Schedule / publish", done: isScheduledOrLater, hint: post.schedule ? new Date(post.schedule.scheduledAt).toLocaleString("en-IN", { timeZone: post.schedule.timezone, dateStyle: "medium", timeStyle: "short" }) : "Pick a date & time or Publish now" },
  ];
  const currentStep = steps.findIndex((s) => !s.done);

  return (
    <>
    <ol className="mb-6 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5">
      {steps.map((s, i) => {
        const current = i === currentStep;
        return (
          <li key={s.id}>
            <a href={`#${s.id}`} className={`flex h-full items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${current ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"}`}>
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${s.done ? "bg-emerald-500 text-white" : current ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>{s.done ? "✓" : i + 1}</span>
              <span className="min-w-0">
                <span className={`block font-medium ${s.done ? "text-slate-700" : "text-slate-900"}`}>{s.label}</span>
                {s.hint ? <span className="block truncate text-xs text-slate-500">{s.hint}</span> : null}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: video + status */}
      <div className="space-y-4">
        <Card title="Video" className="scroll-mt-4" id="video">
          {post.previewUrl ? <video src={post.previewUrl} controls playsInline className="max-h-[420px] w-full rounded-lg bg-black" /> : <div className="flex h-48 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">Preview unavailable ({post.asset.status.toLowerCase()})</div>}
          <dl className="mt-3 space-y-1 text-xs text-slate-600">
            <div className="flex justify-between"><dt>File</dt><dd className="truncate pl-2">{post.asset.filename}</dd></div>
            {post.asset.durationSec ? <div className="flex justify-between"><dt>Duration</dt><dd>{Math.round(post.asset.durationSec)}s</dd></div> : null}
            {post.asset.aspectRatio ? <div className="flex justify-between"><dt>Aspect</dt><dd>{post.asset.aspectRatio}</dd></div> : null}
            <div className="flex justify-between"><dt>Song</dt><dd>{post.asset.songTitle ? `${post.asset.songTitle}${post.asset.artist ? ` — ${post.asset.artist}` : ""}` : <Link href={`/w/${slug}/library/${post.asset.id}`} className="text-indigo-600 hover:underline">Add song details</Link>}</dd></div>
            <div className="flex justify-between"><dt>Copyright</dt><dd>{post.asset.copyrightConfirmed ? <Badge tone="green">Confirmed</Badge> : <Link href={`/w/${slug}/library/${post.asset.id}`} className="text-rose-600 hover:underline">Not confirmed</Link>}</dd></div>
          </dl>
        </Card>

        <Card title="Title & audio">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => updatePostBasicsAction(slug, post.id, { title: String(fd.get("title") ?? ""), audioMode: fd.get("audioMode") as AudioMode }));
            }}
          >
            <Field label="Internal title" htmlFor="title"><Input id="title" name="title" defaultValue={post.title} disabled={!editable} /></Field>
            <Field label="Audio" htmlFor="audioMode" hint="Embedded = the audio inside your video file (recommended for your own songs).">
              <Select id="audioMode" name="audioMode" defaultValue={post.audioMode} disabled={!editable}>
                <option value="EMBEDDED">Embedded audio in video</option>
                <option value="PLATFORM">Platform audio (attach later in app)</option>
              </Select>
            </Field>
            {editable ? <Button type="submit" variant="secondary" disabled={pending}>Save</Button> : null}
          </form>
        </Card>

        <Card title="Destinations" description="Where this Reel will be published." className="scroll-mt-4" id="destinations">
          {post.accounts.length === 0 ? (
            <p className="text-sm text-slate-600">No accounts connected yet. <Link href={`/w/${slug}/accounts`} className="text-indigo-600 hover:underline">Connect Facebook / Instagram</Link>.</p>
          ) : (
            <div className="space-y-2">
              {post.accounts.map((a) => {
                const d = post.destinations.find((x) => x.socialAccountId === a.id);
                const locked = d && !["PENDING", "FAILED", "CANCELLED"].includes(d.status);
                return (
                  <label key={a.id} className={`flex items-start gap-2 rounded-md border p-2 text-sm ${destIds.includes(a.id) ? "border-indigo-300 bg-indigo-50/40" : "border-slate-200"}`}>
                    <input type="checkbox" className="mt-0.5" checked={destIds.includes(a.id)} disabled={!editable || Boolean(locked) || a.health === "DISCONNECTED"} onChange={(e) => setDestIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{a.platform === "INSTAGRAM" ? "Instagram" : "Facebook Page"}: {a.displayName}</span>
                      {a.username ? <span className="text-slate-500"> @{a.username}</span> : null}
                      {a.health !== "CONNECTED" ? <span className="ml-1 text-xs text-amber-700">({a.health.toLowerCase().replace("_", " ")})</span> : null}
                      {d ? (
                        <span className="mt-1 block text-xs">
                          <Badge tone={DEST_STATUS_TONE[d.status]}>{d.status}</Badge>
                          {d.permalink ? <a href={d.permalink} target="_blank" rel="noreferrer" className="ml-2 text-indigo-600 hover:underline">View on {a.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}</a> : null}
                          {d.lastErrorMessage ? <span className="mt-1 block text-rose-600">{d.lastErrorClass}: {d.lastErrorMessage}</span> : null}
                          {d.job && (d.job.status === "RETRY_SCHEDULED" || d.job.status === "QUEUED") ? <span className="block text-slate-500">Attempt {d.job.attemptCount}/{d.job.maxAttempts}{d.job.nextRetryAt ? ` · next try ${new Date(d.job.nextRetryAt).toLocaleString("en-IN", { timeZone: post.workspaceTimezone })}` : ""}</span> : null}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
              {editable && destDirty ? <Button variant="secondary" disabled={pending} onClick={() => run(() => setDestinationsAction(slug, post.id, destIds))}>Save destinations</Button> : null}
            </div>
          )}
        </Card>
      </div>

      {/* Middle: captions */}
      <div className="space-y-4 scroll-mt-4" id="caption">
        {post.can.generate && editable ? (
          <Card title="Generate caption" description="AI drafts a caption from the song metadata; you always review before anything is published.">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Field label="Language" htmlFor="g-lang"><Select id="g-lang" value={gen.language} onChange={(e) => setGen({ ...gen, language: e.target.value as CaptionLanguage })}>{(["HINGLISH", "HI", "EN"] as CaptionLanguage[]).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</Select></Field>
              <Field label="Tone" htmlFor="g-tone"><Select id="g-tone" value={gen.tone} onChange={(e) => setGen({ ...gen, tone: e.target.value as (typeof CAPTION_TONES)[number] })}>{CAPTION_TONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
              <Field label="Length" htmlFor="g-len"><Select id="g-len" value={gen.length} onChange={(e) => setGen({ ...gen, length: e.target.value as typeof gen.length })}><option value="short">Short</option><option value="standard">Standard</option><option value="promotional">Promotional</option></Select></Field>
              <Field label="Hashtags" htmlFor="g-tags"><Input id="g-tags" type="number" min={0} max={30} value={gen.hashtagCount} onChange={(e) => setGen({ ...gen, hashtagCount: Number(e.target.value) })} /></Field>
              <Field label="Emojis" htmlFor="g-emoji"><Select id="g-emoji" value={gen.emojiLevel} onChange={(e) => setGen({ ...gen, emojiLevel: e.target.value as typeof gen.emojiLevel })}><option value="none">None</option><option value="light">Light</option><option value="heavy">Heavy</option></Select></Field>
              <Field label="For" htmlFor="g-platform"><Select id="g-platform" value={gen.platform} onChange={(e) => setGen({ ...gen, platform: e.target.value as typeof gen.platform })}><option value="">All platforms</option><option value="INSTAGRAM">Instagram only</option><option value="FACEBOOK_PAGE">Facebook only</option></Select></Field>
            </div>
            <Button className="mt-3" disabled={pending} onClick={() => run(() => generateCaptionAction(slug, post.id, { ...gen, platform: gen.platform || null }), () => setNotice("Caption generated — review and select it below."))}>
              {pending ? "Generating…" : "Generate caption"}
            </Button>
          </Card>
        ) : null}

        <Card
          title={`Captions (${post.captions.length})`}
          description="The selected caption is published. Platform-specific captions override the general one."
          actions={editable ? <Button variant="secondary" onClick={() => setEditing({ id: null, text: "", hashtags: "", cta: "", language: "HINGLISH", platform: "" })}>Write manually</Button> : undefined}
        >
          {editing ? (
            <form
              className="mb-4 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () => saveCaptionAction(slug, post.id, { captionId: editing.id, text: editing.text, hashtags: editing.hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean), callToAction: editing.cta || null, language: editing.language, platform: editing.platform || null, select: true }),
                  () => setEditing(null),
                );
              }}
            >
              <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={6} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} placeholder="Caption text" required />
              <p className={`text-right text-xs ${editing.text.length + editing.hashtags.length > captionLimit ? "text-rose-600" : "text-slate-500"}`}>{editing.text.length + editing.hashtags.length}/{captionLimit}</p>
              <Input value={editing.hashtags} onChange={(e) => setEditing({ ...editing, hashtags: e.target.value })} placeholder="#hashtags separated by spaces (max 30)" />
              <Input value={editing.cta} onChange={(e) => setEditing({ ...editing, cta: e.target.value })} placeholder="Call to action (optional)" />
              <div className="grid grid-cols-2 gap-2">
                <Select value={editing.language} onChange={(e) => setEditing({ ...editing, language: e.target.value as CaptionLanguage })}>{(["HINGLISH", "HI", "EN"] as CaptionLanguage[]).map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}</Select>
                <Select value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value as typeof editing.platform })}><option value="">All platforms</option><option value="INSTAGRAM">Instagram only</option><option value="FACEBOOK_PAGE">Facebook only</option></Select>
              </div>
              <div className="flex gap-2"><Button type="submit" disabled={pending}>Save & select</Button><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
            </form>
          ) : null}

          {post.captions.length === 0 && !editing ? <p className="text-sm text-slate-500">No captions yet. Generate one or write manually.</p> : null}
          <ul className="space-y-3">
            {post.captions.map((c) => (
              <li key={c.id} className={`rounded-lg border p-3 text-sm ${c.isSelected ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
                <div className="mb-1 flex flex-wrap items-center gap-1 text-xs">
                  {c.isSelected ? <Badge tone="green">Selected</Badge> : null}
                  <Badge>{LANG_LABEL[c.language]}</Badge>
                  <Badge tone="sky">{c.platform ? (c.platform === "INSTAGRAM" ? "Instagram" : "Facebook") : "All platforms"}</Badge>
                  <Badge tone={c.aiGenerated ? "indigo" : "slate"}>{c.aiGenerated ? `AI · ${c.kind.toLowerCase()}` : "Manual"}</Badge>
                </div>
                <p className="whitespace-pre-wrap text-slate-800">{c.text}</p>
                {c.callToAction ? <p className="mt-1 text-slate-700">{c.callToAction}</p> : null}
                {c.hashtags.length ? <p className="mt-1 break-words text-indigo-700">{c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p> : null}
                {editable ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!c.isSelected ? <Button variant="secondary" disabled={pending} onClick={() => run(() => selectCaptionAction(slug, post.id, c.id))}>Select</Button> : null}
                    <Button variant="ghost" onClick={() => setEditing({ id: c.id, text: c.text, hashtags: c.hashtags.join(" "), cta: c.callToAction ?? "", language: c.language, platform: c.platform ?? "" })}>Edit</Button>
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => deleteCaptionAction(slug, post.id, c.id))}>Delete</Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Right: workflow */}
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert kind="success">{notice}</Alert> : null}
        {post.rejectionComment && post.status === "REJECTED" ? <Alert kind="warning"><strong>Rejected:</strong> {post.rejectionComment}</Alert> : null}

        <Card title="Publish checklist">
          {readiness.length === 0 ? <p className="text-sm text-emerald-700">Ready to schedule.</p> : <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">{readiness.map((r) => <li key={r}>{r}</li>)}</ul>}
        </Card>

        <Card title="Approval" className="scroll-mt-4" id="approve">
          <div className="flex flex-wrap gap-2">
            {post.status === "DRAFT" || post.status === "REJECTED" ? (
              <>
                {post.can.submit ? <Button disabled={pending || readiness.length > 0} onClick={() => run(() => submitForApprovalAction(slug, post.id), () => setNotice("Submitted for approval."))}>Submit for approval</Button> : null}
                {post.can.approve ? <Button variant="secondary" disabled={pending || readiness.length > 0} onClick={() => run(() => approvePostAction(slug, post.id), () => setNotice("Approved."))}>Approve directly</Button> : null}
              </>
            ) : null}
            {post.status === "PENDING_APPROVAL" && post.can.approve ? (
              <div className="w-full space-y-2">
                <Button disabled={pending} onClick={() => run(() => approvePostAction(slug, post.id), () => setNotice("Approved."))}>Approve</Button>
                <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} placeholder="Reason for rejection (required)" value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} />
                <Button variant="danger" disabled={pending || !rejectComment.trim()} onClick={() => run(() => rejectPostAction(slug, post.id, rejectComment), () => setRejectComment(""))}>Reject with comment</Button>
              </div>
            ) : null}
            {(post.status === "APPROVED" || post.status === "PENDING_APPROVAL") && post.can.edit ? <Button variant="ghost" disabled={pending} onClick={() => run(() => backToDraftAction(slug, post.id))}>Back to draft</Button> : null}
            {post.status === "PENDING_APPROVAL" && !post.can.approve ? <p className="text-sm text-slate-600">Waiting for an Admin/Owner to approve.</p> : null}
          </div>
        </Card>

        {post.can.schedule ? (
          <Card title="Schedule" className="scroll-mt-4" id="schedule" description={post.approvalRequired ? "Approval is required before scheduling." : "Approval optional in this workspace."}>
            {post.schedule ? <p className="mb-2 text-sm text-slate-700">Currently: <strong>{new Date(post.schedule.scheduledAt).toLocaleString("en-IN", { timeZone: post.schedule.timezone })}</strong> ({post.schedule.timezone})</p> : null}
            {["APPROVED", "SCHEDULED", "DRAFT", "PENDING_APPROVAL", "FAILED", "PARTIALLY_PUBLISHED"].includes(post.status) ? (
              <div className="space-y-2">
                <Field label="Date & time" htmlFor="when"><Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
                <Field label="Timezone" htmlFor="tz"><Select id="tz" value={tz} onChange={(e) => setTz(e.target.value)}>{timezones.map((t) => <option key={t}>{t}</option>)}</Select></Field>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending || readiness.length > 0 || !when} onClick={() => run(() => schedulePostAction(slug, post.id, { scheduledAt: fromLocalInput(when, tz), timezone: tz }), (r) => setNotice(r.warnings.length ? `Scheduled. ${r.warnings.join(" ")}` : "Scheduled."))}>
                    {post.status === "SCHEDULED" ? "Reschedule" : "Schedule"}
                  </Button>
                  {post.can.publish ? <Button variant="secondary" disabled={pending || readiness.length > 0} onClick={() => run(() => schedulePostAction(slug, post.id, { scheduledAt: new Date().toISOString(), timezone: tz, immediately: true }), () => setNotice("Queued — publishing starts within a minute."))}>Publish now</Button> : null}
                  {post.status === "SCHEDULED" ? <Button variant="ghost" disabled={pending} onClick={() => run(() => unschedulePostAction(slug, post.id))}>Unschedule</Button> : null}
                </div>
                {post.status === "DRAFT" || post.status === "PENDING_APPROVAL" ? <p className="text-xs text-slate-500">Scheduling as Admin/Owner approves the post automatically.</p> : null}
              </div>
            ) : post.status === "PUBLISHING" ? <p className="text-sm text-indigo-700">Publishing in progress… this page refreshes when you reload.</p> : <p className="text-sm text-slate-500">Nothing to schedule in this state.</p>}
          </Card>
        ) : null}

        {(post.status === "FAILED" || post.status === "PARTIALLY_PUBLISHED") && post.can.publish ? (
          <Card title="Failures">
            <ul className="mb-2 space-y-2 text-sm">
              {post.destinations.filter((d) => d.status === "FAILED").map((d) => (
                <li key={d.id} className="rounded-md bg-rose-50 p-2 text-rose-800">
                  <strong>{post.accounts.find((a) => a.id === d.socialAccountId)?.displayName}</strong>: {d.lastErrorMessage}
                  {d.job?.attempts.length ? <ul className="mt-1 list-disc pl-5 text-xs text-rose-700">{d.job.attempts.map((a) => <li key={a.n}>#{a.n} {new Date(a.at).toLocaleString("en-IN", { timeZone: post.workspaceTimezone })} — {a.success ? "ok" : a.errorMessage}</li>)}</ul> : null}
                </li>
              ))}
            </ul>
            <Button disabled={pending} onClick={() => run(() => retryFailedAction(slug, post.id), () => setNotice("Retrying failed destinations."))}>Retry failed destinations</Button>
          </Card>
        ) : null}

        {post.can.cancel ? (
          <Card title="Danger zone">
            <div className="flex flex-wrap gap-2">
              {!["PUBLISHED", "CANCELLED", "PUBLISHING"].includes(post.status) ? <Button variant="danger" disabled={pending} onClick={() => run(() => cancelPostAction(slug, post.id))}>Cancel post</Button> : null}
              {!["SCHEDULED", "PUBLISHING"].includes(post.status) ? <Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Delete this post? The video stays in your library.")) run(() => deletePostAction(slug, post.id), () => router.push(`/w/${slug}/posts`)); }}>Delete post</Button> : null}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
    </>
  );
}
