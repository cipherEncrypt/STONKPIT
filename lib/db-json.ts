import fs from "fs";
import path from "path";
import { isDemoPlayer } from "./player-id";
import type {
  DbState,
  DepositRow,
  LedgerRow,
  WalletRow,
  WithdrawalRow,
} from "./db";
import { usdcToMicro } from "./usdc";

type LegacyBalanceRow = { available: number; frozen: number };
type LegacyDepositRow = { userId: string; amount: number; creditedAt: number };
type LegacyWithdrawalRow = {
  id: string;
  userId: string;
  amount: number;
  status: "pending" | "sent" | "failed";
  signature: string | null;
  createdAt: number;
  sentAt: number | null;
};

type LegacyDbState = {
  version?: number;
  balances?: Record<string, LegacyBalanceRow>;
  wallets?: Record<string, WalletRow>;
  rooms?: DbState["rooms"];
  deposits?: Record<string, LegacyDepositRow | DepositRow>;
  withdrawals?: LegacyWithdrawalRow[];
  ledger?: Array<{ userId?: string; pubkey?: string } & LedgerRow>;
  settledRooms?: Record<string, boolean>;
};

export const DEFAULT_STATE: DbState = {
  version: 2,
  wallets: {},
  rooms: {},
  deposits: {},
  withdrawals: [],
  ledger: [],
  settledRooms: {},
};

export function jsonDbPath(): string {
  const raw = process.env.DATABASE_PATH;
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), "data", "stonkpit.json");
}

function ensureDir(file: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function migrateLegacy(raw: LegacyDbState): DbState {
  const now = Date.now();
  const wallets: Record<string, WalletRow> = {};
  for (const [pubkey, w] of Object.entries(raw.wallets ?? {})) {
    wallets[pubkey] = { ...w, username: w.username ?? null };
  }

  if (raw.balances) {
    for (const [pubkey, bal] of Object.entries(raw.balances)) {
      if (pubkey.startsWith("demo:")) continue;
      const avail =
        bal.available < 1_000_000 ? usdcToMicro(bal.available) : Math.round(bal.available);
      const fr =
        bal.frozen < 1_000_000 ? usdcToMicro(bal.frozen) : Math.round(bal.frozen);
      wallets[pubkey] = {
        pubkey,
        available: avail,
        frozen: fr,
        username: null,
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  const deposits: Record<string, DepositRow> = {};
  if (raw.deposits) {
    for (const [sig, d] of Object.entries(raw.deposits)) {
      if ("pubkey" in d && d.pubkey) {
        deposits[sig] = d as DepositRow;
      } else {
        const leg = d as LegacyDepositRow;
        if (leg.userId.startsWith("demo:")) continue;
        deposits[sig] = {
          signature: sig,
          pubkey: leg.userId,
          amount: leg.amount < 1_000_000 ? usdcToMicro(leg.amount) : Math.round(leg.amount),
          slot: 0,
          createdAt: leg.creditedAt ?? now,
        };
      }
    }
  }

  const withdrawals: WithdrawalRow[] = (raw.withdrawals ?? []).map((w) => {
    if ("outSignature" in w && "pubkey" in w) return w as WithdrawalRow;
    const leg = w as LegacyWithdrawalRow;
    return {
      id: leg.id,
      pubkey: leg.userId,
      amount:
        leg.amount < 1_000_000 ? usdcToMicro(leg.amount) : Math.round(leg.amount),
      status: leg.status,
      outSignature: leg.signature,
      createdAt: leg.createdAt,
      sentAt: leg.sentAt,
    };
  });

  const ledger: LedgerRow[] = (raw.ledger ?? []).map((e) => ({
    id: e.id,
    pubkey: e.pubkey ?? (e as { userId: string }).userId,
    type: e.type as LedgerRow["type"],
    amount: e.amount < 1_000_000 && e.type !== "join_freeze" ? usdcToMicro(e.amount) : e.amount,
    roomId: e.roomId,
    ref: e.ref,
    createdAt: e.createdAt,
  }));

  return {
    version: 2,
    wallets,
    rooms: raw.rooms ?? {},
    deposits,
    withdrawals,
    ledger,
    settledRooms: raw.settledRooms ?? {},
  };
}

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;

let cached: DbState | null = null;
let cacheMtime = 0;

function lockPath(file: string): string {
  return `${file}.lock`;
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function acquireFileLock(file: string): void {
  const lock = lockPath(file);
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(lock, `${process.pid}:${Date.now()}`, { flag: "wx" });
      return;
    } catch {
      try {
        const stat = fs.statSync(lock);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lock);
      } catch {
        /* lock released */
      }
      sleepMs(25);
    }
  }
  throw new Error(`Database lock timeout: ${file}`);
}

function releaseFileLock(file: string): void {
  try {
    fs.unlinkSync(lockPath(file));
  } catch {
    /* already released */
  }
}

function sanitizeState(state: DbState): void {
  for (const key of Object.keys(state.wallets)) {
    if (isDemoPlayer(key)) delete state.wallets[key];
  }
  for (const w of Object.values(state.wallets)) {
    if (w.username === undefined) w.username = null;
    w.available = Math.round(w.available);
    w.frozen = Math.round(w.frozen);
  }
}

export function readStateFromDiskForImport(file: string): DbState {
  if (!fs.existsSync(file)) return structuredClone(DEFAULT_STATE);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LegacyDbState;
  const state =
    raw.version === 2 && raw.wallets ? (raw as unknown as DbState) : migrateLegacy(raw);
  sanitizeState(state);
  return state;
}

function readStateFromDisk(): DbState {
  return readStateFromDiskForImport(jsonDbPath());
}

function loadState(forceReload = false): DbState {
  const file = jsonDbPath();
  if (!fs.existsSync(file)) {
    cached = structuredClone(DEFAULT_STATE);
    cacheMtime = 0;
    return cached;
  }
  const stat = fs.statSync(file);
  if (!forceReload && cached && stat.mtimeMs === cacheMtime) return cached;
  cached = readStateFromDisk();
  cacheMtime = stat.mtimeMs;
  return cached;
}

function saveState(state: DbState): void {
  const file = jsonDbPath();
  ensureDir(file);
  sanitizeState(state);
  state.version = 2;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, file);
  cached = state;
  cacheMtime = fs.statSync(file).mtimeMs;
}

let writeChain: Promise<void> = Promise.resolve();

export async function withJsonAsync<T>(fn: (state: DbState) => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    writeChain = writeChain
      .then(async () => {
        const file = jsonDbPath();
        acquireFileLock(file);
        try {
          const state = loadState(true);
          const result = await fn(state);
          saveState(state);
          resolve(result);
        } finally {
          releaseFileLock(file);
        }
      })
      .catch(reject);
  });
}
