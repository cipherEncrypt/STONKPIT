import { STOCKS } from "./constants";
import { topTieGroup, ResultRow } from "./final-results";
import { displayPlayer, isDemoPlayer } from "./player-id";
import { prizePoolUsd } from "./payout-preview";
import { formatBpsHero } from "./scoring";
import { microToUsdc } from "./usdc";

export type ResultToastCopy = {
  title: string;
  body: string;
};

export function resultToastSessionKey(roomId: string, playerId: string): string {
  return `stonkpit-toast:${roomId}:${playerId}`;
}

export function hasSeenResultToast(roomId: string, playerId: string): boolean {
  try {
    return sessionStorage.getItem(resultToastSessionKey(roomId, playerId)) === "1";
  } catch {
    return true;
  }
}

export function markResultToastSeen(roomId: string, playerId: string): void {
  try {
    sessionStorage.setItem(resultToastSessionKey(roomId, playerId), "1");
  } catch {
    /* ignore */
  }
}

function labelFor(wallet: string, displayNames: Record<string, string>): string {
  return displayNames[wallet] ?? displayPlayer(wallet);
}

/** Outcome toast for a seated fighter after FINAL is stored. */
export function buildResultToastContent(params: {
  playerId: string;
  ranked: ResultRow[];
  displayNames: Record<string, string>;
  payingCount: number;
  stakeMicro: number;
  seatedWallets: string[];
}): ResultToastCopy | null {
  const { playerId, ranked, displayNames, payingCount, stakeMicro, seatedWallets } = params;
  if (!ranked.length || !seatedWallets.includes(playerId)) return null;

  const me = ranked.find((r) => r.wallet === playerId);
  if (!me) return null;

  const ticker = STOCKS[me.stock].label;
  const myBps = formatBpsHero(me.scoreBps);
  const tieGroup = topTieGroup(ranked);
  const inTopTie = tieGroup.some((r) => r.wallet === playerId);
  const multiWayTie = tieGroup.length >= 2;

  const stakeUsdc = microToUsdc(stakeMicro);
  const potUsd = prizePoolUsd(payingCount, stakeUsdc);
  const showPot = payingCount > 0 && potUsd > 0 && !isDemoPlayer(playerId);

  if (inTopTie) {
    if (multiWayTie) {
      const body = showPot
        ? `${ticker} ${myBps} · pot ${potUsd.toFixed(2)} USDC`
        : `${ticker} ${myBps}`;
      return { title: "Tied", body };
    }
    const body = showPot
      ? `${ticker} ${myBps} · pot ${potUsd.toFixed(2)} USDC`
      : `${ticker} ${myBps}`;
    return { title: "You won", body };
  }

  const winner = tieGroup[0];
  const winnerLabel = labelFor(winner.wallet, displayNames);
  const winnerBps = formatBpsHero(winner.scoreBps);
  return {
    title: "You lost",
    body: `${ticker} ${myBps} · winner ${winnerLabel} ${winnerBps}`,
  };
}
