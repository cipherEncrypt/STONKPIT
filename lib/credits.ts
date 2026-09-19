import { computeSettlement } from "./payout-preview";
import { ledgerId, WalletRow, withdrawalId, withDbAsync } from "./db";
import { isDemoPlayer } from "./player-id";
import { PlayerResult } from "./room-store";
import { formatStakeUsd } from "./format-stake";
import { microToUsdc, usdcToMicro } from "./usdc";

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
  stakeMicro: number,
  roomName: string,
): { ok: true } | { ok: false; error: string } {
  if (isDemoPlayer(pubkey)) return { ok: true };

  ensureWallet(state, pubkey);
  const bal = state.wallets[pubkey];
  if (bal.available < stakeMicro) {
    return {
      ok: false,
      error: `Need ${formatStakeUsd(stakeMicro)} for ${roomName}.`,
    };
  }
  bal.available -= stakeMicro;
  bal.frozen += stakeMicro;
  bal.updatedAt = Date.now();
  state.ledger.push({
    id: ledgerId(),
    pubkey,
    type: "join_freeze",
    amount: -stakeMicro,
    roomId,
    ref: null,
    createdAt: Date.now(),
  });
  return { ok: true };
}

/** Return frozen seat stakes when a pit resets before settlement. */
export function refundFrozenStakes(
  state: {
    wallets: Record<string, WalletRow>;
    ledger: import("./db").LedgerRow[];
  },
  roomId: string,
  wallets: string[],
  stakeMicro: number,
): void {
  for (const pubkey of wallets) {
    if (isDemoPlayer(pubkey)) continue;
    ensureWallet(state, pubkey);
    const bal = state.wallets[pubkey];
    const release = Math.min(bal.frozen, stakeMicro);
    if (release <= 0) continue;
    bal.frozen -= release;
    bal.available += release;
    bal.updatedAt = Date.now();
    state.ledger.push({
      id: ledgerId(),
      pubkey,
      type: "unfreeze",
      amount: release,
      roomId,
      ref: "room_reset",
      createdAt: Date.now(),
    });
  }
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
  stakeMicro: number,
): SettleCreditsResult | null {
  if (state.settledRooms[roomId]) return null;

  const settlement = computeSettlement(results, stakeMicro);
  const { walletPayoutsMicro, creditDeltasMicro, treasuryMicro, n } = settlement;

  if (!n) {
    state.settledRooms[roomId] = true;
    return { payouts: {}, creditDeltas: {}, feeMicro: 0 };
  }

  for (const wr of results.filter((r) => !isDemoPlayer(r.wallet))) {
    ensureWallet(state, wr.wallet);
    const bal = state.wallets[wr.wallet];
    if (bal.frozen >= stakeMicro) bal.frozen -= stakeMicro;
    else bal.frozen = 0;
    bal.updatedAt = Date.now();
  }

  const payouts: Record<string, number> = {};
  const creditDeltas: Record<string, number> = {};

  for (const [wallet, payoutMicro] of Object.entries(walletPayoutsMicro)) {
    const bal = state.wallets[wallet];
    payouts[wallet] = microToUsdc(payoutMicro);
    creditDeltas[wallet] = microToUsdc(creditDeltasMicro[wallet]);
    bal.available += payoutMicro;
    bal.updatedAt = Date.now();

    if (payoutMicro > 0) {
      state.ledger.push({
        id: ledgerId(),
        pubkey: wallet,
        type: "payout",
        amount: payoutMicro,
        roomId,
        ref: null,
        createdAt: Date.now(),
      });
    }
  }

  if (treasuryMicro > 0) {
    touchWallet(state, TREASURY_LEDGER_PUBKEY);
    state.wallets[TREASURY_LEDGER_PUBKEY].available += treasuryMicro;
    state.wallets[TREASURY_LEDGER_PUBKEY].updatedAt = Date.now();
    state.ledger.push({
      id: ledgerId(),
      pubkey: TREASURY_LEDGER_PUBKEY,
      type: "fee",
      amount: treasuryMicro,
      roomId,
      ref: null,
      createdAt: Date.now(),
    });
  }

  state.settledRooms[roomId] = true;
  return { payouts, creditDeltas, feeMicro: treasuryMicro };
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

export type WithdrawalView = {
  id: string;
  amount: number;
  amountMicro: number;
  status: "pending" | "sent" | "failed";
  outSignature: string | null;
  createdAt: number;
  sentAt: number | null;
};

/**
 * Ledger-only withdraw — moves available → pending. Caller must verify wallet signature.
 * Never accepts a destination other than pubkey (on-chain send uses row.pubkey only).
 */
export function requestWithdrawMicro(
  state: {
    wallets: Record<string, WalletRow>;
    withdrawals: import("./db").WithdrawalRow[];
    ledger: import("./db").LedgerRow[];
  },
  pubkey: string,
  amountMicro: number,
): { ok: true; withdrawalId: string } | { ok: false; error: string } {
  if (isDemoPlayer(pubkey)) {
    return { ok: false, error: "Connect a wallet to withdraw USDC." };
  }
  if (!Number.isInteger(amountMicro) || amountMicro <= 0) {
    return { ok: false, error: "Amount must be a positive integer (micro-USDC)." };
  }

  ensureWallet(state, pubkey);
  const bal = state.wallets[pubkey];
  if (amountMicro > bal.available) {
    return {
      ok: false,
      error: `Only ${microToUsdc(bal.available).toFixed(2)} USDC available (${bal.frozen > 0 ? `${microToUsdc(bal.frozen).toFixed(2)} frozen in pits` : "no frozen stake"}).`,
    };
  }

  bal.available -= amountMicro;
  bal.updatedAt = Date.now();
  const id = withdrawalId();
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
  return { ok: true, withdrawalId: id };
}

export async function requestWithdrawMicroAsync(
  pubkey: string,
  amountMicro: number,
): Promise<{ ok: true; withdrawalId: string } | { ok: false; error: string }> {
  return withDbAsync((state) => requestWithdrawMicro(state, pubkey, amountMicro));
}

export function listWithdrawalsForPubkey(
  state: { withdrawals: import("./db").WithdrawalRow[] },
  pubkey: string,
  limit = 20,
): WithdrawalView[] {
  return state.withdrawals
    .filter((w) => w.pubkey === pubkey)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((w) => ({
      id: w.id,
      amount: microToUsdc(w.amount),
      amountMicro: w.amount,
      status: w.status,
      outSignature: w.outSignature,
      createdAt: w.createdAt,
      sentAt: w.sentAt,
    }));
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
