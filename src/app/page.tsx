import Link from "next/link";
import { auth } from "@/lib/auth";
import { ButtonLink } from "@/components/ui";

const FEATURES = [
  ["Official Meta APIs only", "OAuth via Facebook Login; tokens encrypted at rest. No passwords, no browser automation."],
  ["Bulk Reel uploads", "Drag in dozens of videos, validated with ffprobe against configurable Reel specs."],
  ["AI captions from song metadata", "Hindi, English or Hinglish captions, hashtags and CTAs from your Brand Kit."],
  ["Approval workflow", "Editors submit, Owners/Admins approve. Every transition is audit-logged."],
  ["Timezone-aware calendar", "Schedule per destination, stored in UTC, rendered in your workspace timezone."],
  ["Durable publishing queue", "Idempotent jobs, per-destination retries and human-readable error classes."],
];

export default async function LandingPage() {
  const session = await auth();
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold">Reels Scheduler</span>
        <nav className="flex items-center gap-3 text-sm">
          {session?.user ? (
            <ButtonLink href="/onboarding">Open app</ButtonLink>
          ) : (
            <>
              <Link href="/sign-in" className="text-slate-600 hover:text-slate-900">
                Sign in
              </Link>
              <ButtonLink href="/sign-up">Get started</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Publish Reels to every Instagram account and Facebook Page you manage — on schedule.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Upload in bulk, add song metadata, generate captions, get approvals and let the queue publish through Meta&apos;s official
          Graph API.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/sign-up">Create a workspace</ButtonLink>
          <ButtonLink href="/sign-in" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Publishing to real accounts requires a Meta app in Live mode with approved permissions. See the Data Deletion and Privacy
          pages for how we handle your Meta data.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <Link href="/privacy" className="hover:text-slate-800">
          Privacy Policy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:text-slate-800">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/data-deletion" className="hover:text-slate-800">
          Data Deletion
        </Link>
      </footer>
    </main>
  );
}
