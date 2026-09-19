import { isDemoPlayer } from "./player-id";
import { PlayerResult } from "./room-store";
import { microToUsdc, usdcToMicro } from "./usdc";

export type RankedResult = PlayerResult & {
  rank: number;
  previewUsdc: number;
};

export type SettlementResult = {
  ranked: RankedResult[];
  walletPayoutsMicro: Record<string, number>;
  creditDeltasMicro: Record<string, number>;
  treasuryMicro: number;
  n: number;
  potMicro: number;
  prizePoolMicro: number;
};

export function walletPlayerCount(results: PlayerResult[]): number {
  return results.filter((r) => !isDemoPlayer(r.wallet)).length;
}

export function potMicro(n: number, stakeMicro: number): number {
  return n * stakeMicro;
}

/** pot × 97 / 100 — integer micro-USDC */
export function prizePoolMicro(n: number, stakeMicro: number): number {
  if (n <= 0) return 0;
  return Math.floor((potMicro(n, stakeMicro) * 97) / 100);
}

export function prizePoolUsd(n: number, stakeUsdc: number): number {
  return microToUsdc(prizePoolMicro(n, usdcToMicro(stakeUsdc)));
}

/** Payout % by finishing place (index 0 = 1st). Based on wallet n seated, not maxPlayers. */
export function payoutPercents(n: number): number[] {
  if (n === 2) return [100];
  if (n === 3) return [60, 30, 10];
  if (n === 4 || n === 5) return [50, 30, 20];
  if (n >= 6 && n <= 10) return [40, 25, 15, 10, 10];
  const tailEach = 20 / 5;
  return [40, 25, 15, tailEach, tailEach, tailEach, tailEach, tailEach];
}

/** Sum of place percents consumed when tieSize players share ranks starting at rank. */
function combinedPlacePercent(pcts: number[], rank: number, tieSize: number): number {
  let sum = 0;
  for (let i = 0; i < tieSize; i++) {
    const slot = rank - 1 + i;
    if (slot < pcts.length) sum += pcts[slot];
  }
  return sum;
}

/**
 * Settle a fight in integer micro-USDC.
 * n = wallet players seated. Demo/spectate scored but not paid.
 * Ties combine place pots (e.g. two-way tie for 1st splits 1st+2nd %).
 * Dust + 3% fee + demo-only place pots → treasury.
 */
export function computeSettlement(
  results: PlayerResult[],
  stakeMicro: number,
): SettlementResult {
  const ranked: RankedResult[] = [];
  const walletPayoutsMicro: Record<string, number> = {};
  const creditDeltasMicro: Record<string, number> = {};

  const n = walletPlayerCount(results);
  const pot = potMicro(n, stakeMicro);
  const prize = prizePoolMicro(n, stakeMicro);

  if (!results.length) {
    return {
      ranked: [],
      walletPayoutsMicro: {},
      creditDeltasMicro: {},
      treasuryMicro: 0,
      n: 0,
      potMicro: pot,
      prizePoolMicro: prize,
    };
  }

  const pcts = n > 0 ? payoutPercents(n) : [];
  const sorted = [...results].sort((a, b) => b.scoreBps - a.scoreBps);

  let idx = 0;
  let rank = 1;
  let totalPaidMicro = 0;

  while (idx < sorted.length) {
    const score = sorted[idx].scoreBps;
    const group: PlayerResult[] = [];
    while (idx < sorted.length && sorted[idx].scoreBps === score) {
      group.push(sorted[idx]);
      idx++;
    }

    const tieSize = group.length;
    const pctSum = n > 0 ? combinedPlacePercent(pcts, rank, tieSize) : 0;
    const placePotMicro =
      n > 0 && pctSum > 0 ? Math.round((prize * pctSum) / 100) : 0;

    const walletsInGroup = group.filter((p) => !isDemoPlayer(p.wallet));

    if (n > 0 && walletsInGroup.length > 0 && placePotMicro > 0) {
      const eachMicro = Math.floor(placePotMicro / walletsInGroup.length);
      for (const p of walletsInGroup) {
        walletPayoutsMicro[p.wallet] = eachMicro;
        totalPaidMicro += eachMicro;
      }
    }

    for (const p of group) {
      const payoutMicro = isDemoPlayer(p.wallet) ? 0 : (walletPayoutsMicro[p.wallet] ?? 0);
      ranked.push({
        ...p,
        rank,
        previewUsdc: microToUsdc(payoutMicro),
      });
    }

    rank += tieSize;
  }

  // Fee + unclaimed place pots + integer dust → treasury
  const treasuryMicro = pot - totalPaidMicro;

  for (const [wallet, payoutMicro] of Object.entries(walletPayoutsMicro)) {
    creditDeltasMicro[wallet] = payoutMicro - stakeMicro;
  }

  return {
    ranked,
    walletPayoutsMicro,
    creditDeltasMicro,
    treasuryMicro,
    n,
    potMicro: pot,
    prizePoolMicro: prize,
  };
}

/** UI preview — same math as settlement. */
export function computeRankedPayouts(
  results: PlayerResult[],
  stakeMicro: number,
): RankedResult[] {
  return computeSettlement(results, stakeMicro).ranked;
}

export function formatPreviewUsdc(amount: number): string {
  return `${amount.toFixed(2)} USDC`;
}

export function payoutSummaryLine(
  payingN: number,
  stakeMicro: number,
  totalFighters?: number,
): string {
  const fighters = totalFighters ?? payingN;
  const stakeUsdc = microToUsdc(stakeMicro);
  const pool = microToUsdc(prizePoolMicro(payingN, stakeMicro));
  const stakeLabel =
    stakeUsdc >= 1 && stakeUsdc % 1 === 0
      ? `$${stakeUsdc.toFixed(0)}`
      : `$${stakeUsdc.toFixed(2)}`;
  if (payingN === 0 || fighters !== payingN) {
    return `${fighters} fighters · ${payingN} paying · ${stakeLabel} seats · prize pool $${pool.toFixed(2)}`;
  }
  return `${fighters} players · ${stakeLabel} seats · prize pool $${pool.toFixed(2)} credits (3% fee)`;
}

export function formatCreditDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} credits`;
}

export function stakeUsdcFromMicro(stakeMicro: number): number {
  return microToUsdc(stakeMicro);
}
