/** Score in basis points: ((end - start) / start) * 10000 */
export function scoreBps(start: number, end: number): number {
  if (start <= 0) return 0;
  return Math.round(((end - start) / start) * 10_000);
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/** Pit / FINAL: integer bps + % to 4 decimals (sub-cent moves visible). */
export function moveBpsFromPrices(start: number, live: number): number {
  if (start <= 0) return 0;
  return ((live - start) / start) * 10_000;
}

export function formatMoveDisplay(bps: number): string {
  const bpsRounded = Math.round(bps);
  const pct = bps / 100;
  const signBps = bpsRounded >= 0 ? "+" : "";
  const signPct = pct >= 0 ? "+" : "";
  return `${signBps}${bpsRounded} bps (${signPct}${pct.toFixed(4)}%)`;
}

export function formatBpsHero(bps: number): string {
  const bpsRounded = Math.round(bps);
  const sign = bpsRounded >= 0 ? "+" : "";
  return `${sign}${bpsRounded} bps`;
}

export function formatUsd(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/** Live pit prices — at least 4 decimal places. */
export function formatUsdPit(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(price);
}

export function shortWallet(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function formatPublishTime(unixSec: number): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toLocaleString();
}
