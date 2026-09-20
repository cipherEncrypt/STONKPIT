type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = {
  deposit: 12,
  withdraw: 8,
  join: 30,
};

export function checkRateLimit(action: keyof typeof LIMITS, pubkey: string): boolean {
  const key = `${action}:${pubkey}`;
  const now = Date.now();
  const limit = LIMITS[action] ?? 20;
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
