/**
 * Fixed-window in-memory rate limiter. Sufficient for a single Node process;
 * Milestone 5 swaps this for a Redis-backed implementation behind the same
 * signature so auth, AI generation and publishing share one policy.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}
