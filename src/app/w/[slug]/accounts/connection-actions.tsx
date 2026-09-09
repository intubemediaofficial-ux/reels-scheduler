"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { checkConnectionAction, disconnectConnectionAction } from "@/server/actions/accounts.actions";

export function ConnectionActions({ slug, connectionId, connectHref }: { slug: string; connectionId: string; connectHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await checkConnectionAction(slug, connectionId); if (!r.ok) setError(r.error); router.refresh(); })}>
          Check health
        </Button>
        <a href={connectHref} className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">Reconnect</a>
        {armed ? (
          <>
            <Button variant="danger" disabled={pending} onClick={() => start(async () => { const r = await disconnectConnectionAction(slug, connectionId); if (!r.ok) setError(r.error); setArmed(false); router.refresh(); })}>
              Confirm disconnect
            </Button>
            <Button variant="ghost" onClick={() => setArmed(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setArmed(true)}>Disconnect</Button>
        )}
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
