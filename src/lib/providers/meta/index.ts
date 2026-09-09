import { env } from "@/lib/env";
import { GraphMetaProvider } from "./graph";
import { MockMetaProvider } from "./mock";
import type { MetaProvider } from "./types";

let cached: MetaProvider | null = null;

export function meta(): MetaProvider {
  if (cached) return cached;
  const e = env();
  if (e.META_PROVIDER === "graph") {
    if (!e.META_APP_ID || !e.META_APP_SECRET) throw new Error("META_PROVIDER=graph requires META_APP_ID and META_APP_SECRET");
    cached = new GraphMetaProvider(e.META_APP_ID, e.META_APP_SECRET, e.META_GRAPH_API_VERSION);
  } else {
    cached = new MockMetaProvider();
  }
  return cached;
}

export function metaScopes(): string[] {
  return env()
    .META_SCOPES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isMockMeta(): boolean {
  return env().META_PROVIDER === "mock";
}
