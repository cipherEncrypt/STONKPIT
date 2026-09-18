import { STOCKS } from "./constants";
import { displayPlayer } from "./player-id";
import { RankedResult } from "./payout-preview";
import { formatBps } from "./scoring";

/** Share card — 1st place only */
export function buildShareCard(
  ranked: RankedResult[],
  displayNames?: Record<string, string>,
): string {
  if (!ranked.length) return "StonkPit — pick a stock, best % move wins.";
  const first = ranked.find((r) => r.rank === 1) ?? ranked[0];
  const name = displayNames?.[first.wallet] ?? displayPlayer(first.wallet);
  const label = STOCKS[first.stock].label;
  return `${name}'s ${label} ${formatBps(first.scoreBps)} wins StonkPit`;
}
