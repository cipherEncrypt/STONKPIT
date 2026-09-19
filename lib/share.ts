import { STOCKS } from "./constants";
import { topTieGroup } from "./final-results";
import { displayPlayer } from "./player-id";
import { RankedResult } from "./payout-preview";
import { formatBpsHero } from "./scoring";

function labelFor(wallet: string, displayNames?: Record<string, string>): string {
  return displayNames?.[wallet] ?? displayPlayer(wallet);
}

/** Share card — tie-aware */
export function buildShareCard(
  ranked: RankedResult[],
  displayNames?: Record<string, string>,
): string {
  if (!ranked.length) return "StonkPit — pick a stock, best % move wins.";

  const tie = topTieGroup(ranked);
  const bpsLabel = formatBpsHero(tie[0]?.scoreBps ?? 0);

  if (tie.length >= 2) {
    const names = tie.map((r) => labelFor(r.wallet, displayNames)).join(" and ");
    return `${names} TIE at ${bpsLabel}`;
  }

  const first = tie[0];
  const name = labelFor(first.wallet, displayNames);
  const ticker = STOCKS[first.stock].label;
  return `${name}'s ${ticker} ${bpsLabel} wins StonkPit`;
}
