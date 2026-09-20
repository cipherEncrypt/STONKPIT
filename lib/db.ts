import { Room } from "./room-store";
import { withJsonAsync, jsonDbPath } from "./db-json";
import { usePostgres, withPgAsync } from "./db-pg";

export type WalletRow = {
  pubkey: string;
  available: number;
  frozen: number;
  username: string | null;
  createdAt: number;
  updatedAt: number;
};

export type DepositRow = {
  signature: string;
  pubkey: string;
  amount: number;
  slot: number;
  createdAt: number;
};

export type WithdrawalRow = {
  id: string;
  pubkey: string;
  amount: number;
  status: "pending" | "sent" | "failed";
  outSignature: string | null;
  createdAt: number;
  sentAt: number | null;
};

export type LedgerRow = {
  id: string;
  pubkey: string;
  type:
    | "deposit"
    | "join_freeze"
    | "unfreeze"
    | "payout"
    | "fee"
    | "withdraw_request"
    | "withdraw_sent"
    | "withdraw_refund";
  amount: number;
  roomId: string | null;
  ref: string | null;
  createdAt: number;
};

export type DbState = {
  version: 2;
  wallets: Record<string, WalletRow>;
  rooms: Record<string, Room>;
  deposits: Record<string, DepositRow>;
  withdrawals: WithdrawalRow[];
  ledger: LedgerRow[];
  settledRooms: Record<string, boolean>;
};

export async function withDbAsync<T>(fn: (state: DbState) => T | Promise<T>): Promise<T> {
  if (usePostgres()) {
    return withPgAsync(fn);
  }
  return withJsonAsync(fn);
}

/** In-memory DB for tests — bypasses disk. */
export function createTestDbState(): DbState {
  return {
    version: 2,
    wallets: {},
    rooms: {},
    deposits: {},
    withdrawals: [],
    ledger: [],
    settledRooms: {},
  };
}

export function ledgerId(): string {
  return `l_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function withdrawalId(): string {
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getDbPath(): string {
  return jsonDbPath();
}

export { usePostgres } from "./db-pg";
