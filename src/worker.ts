import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { tick } from "@/server/services/publish.service";

/**
 * Publishing worker: polls Postgres for due jobs (SKIP LOCKED) so multiple
 * instances can run safely. Run with `npm run worker` (PM2 in production).
 */
const POLL_MS = 10_000;
let stopping = false;

async function loop() {
  const workerId = `${env().PUBLISH_WORKER_ID}-${process.pid}`;
  console.log(`[publisher] started as ${workerId}, provider=${env().META_PROVIDER}`);
  while (!stopping) {
    try {
      const n = await tick(workerId);
      if (n) console.log(`[publisher] handled ${n} job(s)`);
    } catch (e) {
      console.error("[publisher] tick failed", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await db.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[publisher] ${sig} received, finishing current tick`);
    stopping = true;
  });
}

loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
