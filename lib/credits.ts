import { computeRankedPayouts, payoutPercents } from "./payout-preview";
import { ledgerId, WalletRow, withDbAsync } from "./db";
import { isDemoPlayer } from "./player-id";
import { PlayerResult } from "./room-store";
import {
  formatUsdcMicro,
  microToUsdc,
  STAKE_MICRO,
  usdcToMicro,
} from "./usdc";

export const TREASURY_LEDGER_PUBKEY = "treasury";

export type BalanceView = {
  pubkey: string;
  available: number;
  frozen: number;
  total: number;
  availableMicro: number;
  frozenMicro: number;
};

function touchWallet(state: { wallets: Record<string, WalletRow> }, pubkey: string): WalletRow {
  const now = Date.now();
  if (!state.wallets[pubkey]) {
    state.wallets[pubkey] = {
      pubkey,
      available: 0,
      frozen: 0,
      username: null,
      createdAt: now,
      updatedAt: now,
    };
  }
  state.wallets[pubkey].updatedAt = now;
  return state.wallets[pubkey];
}

export function getBalanceSync(
  state: { wallets: Record<string, WalletRow> },
  pubkey: string,
): BalanceView {
  const row = state.wallets[pubkey] ?? {
    pubkey,
    available: 0,
    frozen: 0,
    username: null,
    createdAt: 0,
    updatedAt: 0,
  };
  return {
    pubkey,
    availableMicro: row.available,
    frozenMicro: row.frozen,
    available: microToUsdc(row.available),
    frozen: microToUsdc(row.frozen),
    total: microToUsdc(row.available + row.frozen),
  };
}

export function ensureWallet(
  state: { wallets: Record<string, WalletRow> },
  pubkey: string,
): BalanceView {
  if (isDemoPlayer(pubkey)) {
    throw new Error("Demo names cannot hold USDC credits.");
  }
  touchWallet(state, pubkey);
  return getBalanceSync(state, pubkey);
}

/** Wallet players only — demo joins skip freeze. */
export function freezeForJoin(
  state: {
    wallets: Record<string, WalletRow>;
    ledger: import("./db").LedgerRow[];
  },
  pubkey: string,
  roomId: string,
): { ok: true } | { ok: false; error: string } {
  if (isDemoPlayer(pubkey)) return { ok: true };

  ensureWallet(state, pubkey);
  const bal = state.wallets[pubkey];
  if (bal.available < STAKE_MICRO) {
    return {
      ok: false,
      error: `Insufficient credits. Need ${formatUsdcMicro(STAKE_MICRO)} available.`,
    };
  }
  bal.available -= STAKE_MICRO;
  bal.frozen += STAKE_MICRO;
  bal.updatedAt = Date.now();
  state.ledger.push({
    id: ledgerId(),
    pubkey,
    type: "join_freeze",
    amount: -STAKE_MICRO,
    roomId,
    ref: null,
    createdAt: Date.now(),
  });
  return { ok: true };
}

export function creditDeposit(
  state: {
    wallets: Record<string, WalletRow>;
    deposits: Record<string, import("./db").DepositRow>;
    ledger: import("./db").LedgerRow[];
  },
  pubkey: string,
  amountMicro: number,
  signature: string,
  slot: number,
): { ok: true; balance: BalanceView } | { ok: false; error: string } {
  if (state.deposits[signature]) {
    return { ok: false, error: "Deposit already credited for this transaction." };
  }
  if (isDemoPlayer(pubkey)) {
    return { ok: false, error: "Demo names cannot receive deposits." };
  }

  ensureWallet(state, pubkey);
  const bal = state.wallets[pubkey];
  bal.available += amountMicro;
  bal.updatedAt = Date.now();

  state.deposits[signature] = {
    signature,
    pubkey,
    amount: amountMicro,
    slot,
    createdAt: Date.now(),
  };
  state.ledger.push({
    id: ledgerId(),
    pubkey,
    type: "deposit",
    amount: amountMicro,
    roomId: null,
    ref: signature,
    createdAt: Date.now(),
  });
  return { ok: true, balance: getBalanceSync(state, pubkey) };
}

export type SettleCreditsResult = {
  payouts: Record<string, number>;
  creditDeltas: Record<string, number>;
  feeMicro: number;
};

/** Wallet players only — demo seated fighters are scored but not paid. */
export function applySettleCredits(
  state: {
    wallets: Record<string, WalletRow>;
    ledger: import("./db").LedgerRow[];
    settledRooms: Record<string, boolean>;
  },
  roomId: string,
  results: PlayerResult[],
): SettleCreditsResult | null {
  if (state.settledRooms[roomId]) return null;

  const walletResults = results.filter((r) => !isDemoPlayer(r.wallet));
  const n = walletResults.length;
  if (!n) {
    state.settledRooms[roomId] = true;
    return { payouts: {}, creditDeltas: {}, feeMicro: 0 };
  }

  const rankedAll = computeRankedPayouts(results);
  const pcts = payoutPercents(n);
  const poolMicro = Math.round(n * STAKE_MICRO * 0.97);
  const feeMicro = n * STAKE_MICRO - poolMicro;

  for (const wr of walletResults) {
    ensureWallet(state, wr.wallet);
    const bal = state.wallets[wr.wallet];
    if (bal.frozen >= STAKE_MICRO) bal.frozen -= STAKE_MICRO;
    else bal.frozen = 0;
    bal.updatedAt = Date.now();
  }

  const payouts: Record<string, number> = {};
  const creditDeltas: Record<string, number> = {};
  const unclaimedMicro = new Map<number, number>();

  for (const row of rankedAll) {
    if (isDemoPlayer(row.wallet)) {
      const slot = row.rank - 1;
      const placePct = slot < pcts.length ? pcts[slot] : 0;
      if (placePct > 0) {
        const placeMicro = Math.round(poolMicro * (placePct / 100));
        unclaimedMicro.set(row.rank, (unclaimedMicro.get(row.rank) ?? 0) + placeMicro);
      }
      continue;
    }

    const bal = state.wallets[row.wallet];

    const slot = row.rank - 1;
    const placePct = slot < pcts.length ? pcts[slot] : 0;
    const tiedAtRank = rankedAll.filter((r) => r.rank === row.rank && !isDemoPlayer(r.wallet));
    const payoutMicro = tiedAtRank.length
      ? Math.round((poolMicro * (placePct / 100)) / tiedAtRank.length)
      : 0;

    payouts[row.wallet] = microToUsdc(payoutMicro);
    creditDeltas[row.wallet] = microToUsdc(payoutMicro - STAKE_MICRO);
    bal.available += payoutMicro;
    bal.updatedAt = Date.now();

    if (payoutMicro > 0) {
      state.ledger.push({
        id: ledgerId(),
        pubkey: row.wallet,
        type: "payout",
        amount: payoutMicro,
        roomId,
        ref: `rank_${row.rank}`,
        createdAt: Date.now(),
      });
    }
  }

  let treasuryExtra = feeMicro;
  for (const micro of unclaimedMicro.values()) treasuryExtra += micro;

  if (treasuryExtra > 0) {
    touchWallet(state, TREASURY_LEDGER_PUBKEY);
    state.wallets[TREASURY_LEDGER_PUBKEY].available += treasuryExtra;
    state.wallets[TREASURY_LEDGER_PUBKEY].updatedAt = Date.now();
    state.ledger.push({
      id: ledgerId(),
      pubkey: TREASURY_LEDGER_PUBKEY,
      type: "fee",
      amount: treasuryExtra,
      roomId,
      ref: null,
      createdAt: Date.now(),
    });
  }

  state.settledRooms[roomId] = true;
  return { payouts, creditDeltas, feeMicro: treasuryExtra };
}

export async function getBalance(pubkey: string): Promise<BalanceView> {
  return withDbAsync((state) => {
    if (isDemoPlayer(pubkey)) {
      return {
        pubkey,
        available: 0,
        frozen: 0,
        total: 0,
        availableMicro: 0,
        frozenMicro: 0,
      };
    }
    ensureWallet(state, pubkey);
    return getBalanceSync(state, pubkey);
  });
}

export async function requestWithdraw(
  pubkey: string,
  amountUsdc: number,
): Promise<{ ok: true; withdrawalId: string } | { ok: false; error: string }> {
  if (isDemoPlayer(pubkey)) {
    return { ok: false, error: "Connect a wallet to withdraw USDC." };
  }
  const amountMicro = usdcToMicro(amountUsdc);
  if (amountMicro <= 0) return { ok: false, error: "Amount must be positive." };

  return withDbAsync((state) => {
    ensureWallet(state, pubkey);
    const bal = state.wallets[pubkey];
    if (bal.available < amountMicro) {
      return {
        ok: false as const,
        error: `Only ${formatUsdcMicro(bal.available)} available.`,
      };
    }
    bal.available -= amountMicro;
    bal.updatedAt = Date.now();
    const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    state.withdrawals.push({
      id,
      pubkey,
      amount: amountMicro,
      status: "pending",
      outSignature: null,
      createdAt: Date.now(),
      sentAt: null,
    });
    state.ledger.push({
      id: ledgerId(),
      pubkey,
      type: "withdraw_request",
      amount: -amountMicro,
      roomId: null,
      ref: id,
      createdAt: Date.now(),
    });
    return { ok: true as const, withdrawalId: id };
  });
}

export function listDepositsForPubkey(
  state: { deposits: Record<string, import("./db").DepositRow> },
  pubkey: string,
  limit = 10,
) {
  return Object.values(state.deposits)
    .filter((d) => d.pubkey === pubkey)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((d) => ({
      signature: d.signature,
      amount: microToUsdc(d.amount),
      amountMicro: d.amount,
      slot: d.slot,
      createdAt: d.createdAt,
    }));
}
