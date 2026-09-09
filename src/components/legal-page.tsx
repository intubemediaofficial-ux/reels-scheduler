import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <Link href="/" className="text-sm text-indigo-600 hover:underline">
        ← Reels Scheduler
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated: {updated}</p>
      <div className="prose prose-slate mt-8 max-w-none text-slate-800 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
      <nav className="mt-12 flex gap-6 text-sm text-slate-500">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Service</Link>
        <Link href="/data-deletion">Data Deletion</Link>
      </nav>
    </main>
  );
}
