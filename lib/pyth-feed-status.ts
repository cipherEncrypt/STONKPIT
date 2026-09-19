/** UI freshness from Pyth publishTime (unix seconds). */

export type FeedFreshness = "live" | "quiet" | "stale";

export function feedAgeSeconds(publishTime: number, nowSec = Math.floor(Date.now() / 1000)): number {
  if (!publishTime) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowSec - publishTime);
}

export function classifyFeedFreshness(
  publishTime: number,
  nowSec = Math.floor(Date.now() / 1000),
): FeedFreshness {
  const age = feedAgeSeconds(publishTime, nowSec);
  if (age <= 120) return "live";
  if (age <= 86_400) return "quiet";
  return "stale";
}

export function formatAgeShort(ageSec: number): string {
  if (!Number.isFinite(ageSec)) return "unknown";
  if (ageSec < 60) return `${ageSec}s`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m`;
  if (ageSec < 86_400) return `${Math.floor(ageSec / 3600)}h`;
  return `${Math.floor(ageSec / 86_400)}d`;
}

/** User-facing freshness — relative age only (no calendar dates). */
export function formatFeedStatusLine(publishTime: number, nowSec = Math.floor(Date.now() / 1000)): string {
  if (!publishTime) return "SYNCING";
  const age = feedAgeSeconds(publishTime, nowSec);
  const kind = classifyFeedFreshness(publishTime, nowSec);
  if (kind === "live") return `LIVE · ${formatAgeShort(age)} ago`;
  if (kind === "quiet") return `QUIET · ${formatAgeShort(age)} ago`;
  return `FEED STALE · ${formatAgeShort(age)} ago`;
}
