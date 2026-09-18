import { FEE_BPS, STAKE_USDC } from "./constants";
import { PlayerResult } from "./room-store";

export type RankedResult = PlayerResult & {
  rank: number;
  previewUsdc: number;
};

/** pot = n × stake; prize pool after 3% fee */
export function prizePoolUsd(playerCount: number): number {
  const pot = playerCount * STAKE_USDC;
  return pot * (1 - FEE_BPS / 10_000);
}

/** Payout % by finishing place (index 0 = 1st). */
export function payoutPercents(playerCount: number): number[] {
  if (playerCount === 2) return [100];
  if (playerCount === 3) return [60, 30, 10];
  if (playerCount <= 5) return [50, 30, 20];
  if (playerCount <= 10) return [40, 25, 15, 10, 10];
  const tailEach = 20 / 5;
  return [40, 25, 15, tailEach, tailEach, tailEach, tailEach, tailEach];
}

/** Competition ranks with ties; each player gets preview USDC for their place. */
export function computeRankedPayouts(results: PlayerResult[]): RankedResult[] {
  if (!results.length) return [];

  const pool = prizePoolUsd(results.length);
  const pcts = payoutPercents(results.length);
  const sorted = [...results].sort((a, b) => b.scoreBps - a.scoreBps);
  const ranked: RankedResult[] = [];

  let idx = 0;
  let rank = 1;

  while (idx < sorted.length) {
    const score = sorted[idx].scoreBps;
    const group: PlayerResult[] = [];
    while (idx < sorted.length && sorted[idx].scoreBps === score) {
      group.push(sorted[idx]);
      idx++;
    }

    const slot = rank - 1;
    const placePct = slot < pcts.length ? pcts[slot] : 0;
    const eachUsd = (pool * (placePct / 100)) / group.length;

    for (const p of group) {
      ranked.push({ ...p, rank, previewUsdc: eachUsd });
    }
    rank += group.length;
  }

  return ranked;
}

export function formatPreviewUsdc(amount: number): string {
  return `${amount.toFixed(2)} USDC`;
}

export function payoutSummaryLine(playerCount: number): string {
  const pool = prizePoolUsd(playerCount);
  return `${playerCount} players · ${STAKE_USDC} USDC seats · prize pool ${pool.toFixed(2)} credits (custodial, 3% fee)`;
}

export function formatCreditDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} credits`;
}
