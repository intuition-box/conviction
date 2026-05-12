/**
 * In-memory TTL cache for /api/me/* endpoints whose computation is expensive
 * (thumbvote aggregation, full portfolio scan, etc.).
 *
 * Scope: process-local. Survives across requests in the same Node process but
 * not across server restarts or replicas. Acceptable for read-only user-facing
 * stats with short freshness needs (~60s).
 */

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();

export async function getCachedOrCompute<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await factory();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidate(key: string): void {
  store.delete(key);
}
