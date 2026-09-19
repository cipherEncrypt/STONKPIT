import { computeSettlement, RankedResult } from "./payout-preview";
import { PlayerResult, Room } from "./room-store";
import { scoreBps } from "./scoring";
import { microToUsdc } from "./usdc";

/** Build scored rows for FINAL — never drop seated fighters. */
export function fightResultRows(room: Room): PlayerResult[] {
  if (room.results.length > 0) return room.results;
  if (room.status !== "ended" || room.players.length === 0) return [];

  return room.players.map((p) => {
    const start = room.startPrices[p.stock] ?? 0;
    const end = room.endPrices[p.stock] ?? 0;
    const startQ = room.startQuotes[p.stock];
    const endQ = room.endQuotes[p.stock];
    return {
      ...p,
      startPrice: start,
      endPrice: end,
      scoreBps: scoreBps(start, end),
      feedName: startQ?.feedName ?? endQ?.feedName ?? "",
      startPublishTime: startQ?.publishTime ?? 0,
      endPublishTime: endQ?.publishTime ?? 0,
    };
  });
}

export type ResultRow = RankedResult & {
  creditDelta: number;
  payoutCredits: number;
};

export function buildFinalRanked(room: Room, stakeMicro: number): ResultRow[] {
  const rows = fightResultRows(room);
  if (!rows.length) return [];

  const settlement = computeSettlement(rows, stakeMicro);
  return settlement.ranked.map((r) => {
    const fromResult = rows.find((p) => p.wallet === r.wallet);
    const payoutMicro = settlement.walletPayoutsMicro[r.wallet] ?? 0;
    return {
      ...r,
      creditDelta:
        fromResult?.creditDelta ??
        microToUsdc(settlement.creditDeltasMicro[r.wallet] ?? -stakeMicro),
      payoutCredits: fromResult?.payoutCredits ?? microToUsdc(payoutMicro),
    };
  });
}

/** All fighters tied for 1st (same top scoreBps). */
export function topTieGroup(ranked: RankedResult[]): RankedResult[] {
  if (!ranked.length) return [];
  const best = Math.max(...ranked.map((r) => r.scoreBps));
  return ranked.filter((r) => r.scoreBps === best);
}
