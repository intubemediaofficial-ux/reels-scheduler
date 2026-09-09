import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-6 text-lg font-semibold">
        Reels Scheduler
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
    </main>
  );
}
