import { roomDurationSecs } from "./config";
import { CreateRoomSize, MIN_PLAYERS, StockId } from "./constants";
import {
  applySettleCredits,
  freezeForJoin,
  SettleCreditsResult,
} from "./credits";
import { withDbAsync } from "./db";
import { isDemoPlayer } from "./player-id";
import {
  nextRoomName,
  SEED_ROOMS,
  seedMaxForId,
  seedNameForId,
} from "./room-names";
import { microToUsdc, STAKE_MICRO } from "./usdc";
import { remainingMs, serverNowMs } from "./room-clock";
import { fetchAllCryptoPrices } from "./pyth";
import { scoreBps } from "./scoring";

export type RoomStatus = "open" | "locked" | "ended";

export type Player = {
  wallet: string;
  stock: StockId;
  joinedAt: number;
  ready: boolean;
};

export type PriceSnapshot = {
  price: number;
  publishTime: number;
  feedName: string;
};

export type PlayerResult = Player & {
  startPrice: number;
  endPrice: number;
  scoreBps: number;
  feedName: string;
  startPublishTime: number;
  endPublishTime: number;
  creditDelta?: number;
  payoutCredits?: number;
};

export type Room = {
  id: string;
  name: string;
  maxPlayers: number;
  status: RoomStatus;
  players: Player[];
  startTs: number | null;
  endTs: number | null;
  startPrices: Partial<Record<StockId, number>>;
  endPrices: Partial<Record<StockId, number>>;
  startQuotes: Partial<Record<StockId, PriceSnapshot>>;
  endQuotes: Partial<Record<StockId, PriceSnapshot>>;
  results: PlayerResult[];
  winners: string[];
  settleCredits?: SettleCreditsResult;
};

export type RoomSummary = {
  id: string;
  name: string;
  maxPlayers: number;
  seated: number;
  readyCount: number;
  status: RoomStatus;
  remainingMs: number;
};

function emptyRoom(id: string, maxPlayers: number, name: string): Room {
  return {
    id,
    name,
    maxPlayers,
    status: "open",
    players: [],
    startTs: null,
    endTs: null,
    startPrices: {},
    endPrices: {},
    startQuotes: {},
    endQuotes: {},
    results: [],
    winners: [],
  };
}

function migrateRoom(raw: Room & { lockTs?: number | null }): Room {
  const r = { ...raw };
  if (!r.name) {
    r.name = seedNameForId(r.id) ?? `Pit ${r.id}`;
  }
  if (r.maxPlayers == null) {
    r.maxPlayers = seedMaxForId(r.id) ?? 5;
  }
  r.players = r.players.map((p) => ({
    ...p,
    ready: p.ready ?? false,
  }));
  if (r.startTs == null && raw.lockTs != null) {
    r.startTs = raw.lockTs * 1000;
  }
  if (r.endTs != null && r.endTs < 1_000_000_000_000) {
    r.endTs = r.endTs * 1000;
  }
  return r;
}

function ensureSeedRooms(state: { rooms: Record<string, Room> }): void {
  for (const seed of SEED_ROOMS) {
    if (!state.rooms[seed.id]) {
      state.rooms[seed.id] = emptyRoom(seed.id, seed.maxPlayers, seed.name);
    } else {
      const r = migrateRoom(state.rooms[seed.id]);
      if (!state.rooms[seed.id].name) r.name = seed.name;
      if (!state.rooms[seed.id].maxPlayers) r.maxPlayers = seed.maxPlayers;
      state.rooms[seed.id] = r;
    }
  }
}

function nextRoomHint(state: { rooms: Record<string, Room> }, currentId: string): string {
  const n = parseInt(currentId, 10);
  const start = Number.isFinite(n) ? n + 1 : 2;
  for (let i = start; i <= start + 50; i++) {
    const id = String(i);
    const raw = state.rooms[id];
    if (!raw) return id;
    const r = migrateRoom(raw);
    if (r.status === "open" && r.players.length < r.maxPlayers) return id;
  }
  const ids = Object.keys(state.rooms).map(Number).filter(Number.isFinite);
  return String(ids.length ? Math.max(...ids) + 1 : 6);
}

function cloneRoom(r: Room): Room {
  return structuredClone(r);
}

function getRoomFromState(state: { rooms: Record<string, Room> }, id: string): Room {
  ensureSeedRooms(state);
  if (!state.rooms[id]) {
    const name = seedNameForId(id) ?? nextRoomName(
      Object.values(state.rooms).map((r) => migrateRoom(r).name),
      5,
    );
    state.rooms[id] = emptyRoom(id, seedMaxForId(id) ?? 5, name);
  } else {
    state.rooms[id] = migrateRoom(state.rooms[id]);
  }
  return state.rooms[id];
}

function walletHasUsername(
  state: { wallets: Record<string, { username?: string | null }> },
  wallet: string,
): boolean {
  if (isDemoPlayer(wallet)) return true;
  return !!state.wallets[wallet]?.username;
}

async function lockRoom(state: { rooms: Record<string, Room> }, id: string): Promise<void> {
  const r = getRoomFromState(state, id);
  if (r.status !== "open") return;

  const stocks = [...new Set(r.players.map((p) => p.stock))];
  const quotes = await fetchAllCryptoPrices();
  const startPrices: Partial<Record<StockId, number>> = {};
  const startQuotes: Partial<Record<StockId, PriceSnapshot>> = {};
  for (const s of stocks) {
    const q = quotes[s];
    if (q) {
      startPrices[s] = q.price;
      startQuotes[s] = {
        price: q.price,
        publishTime: q.publishTime,
        feedName: q.feedName,
      };
    }
  }

  const now = serverNowMs();
  r.status = "locked";
  r.startTs = now;
  r.endTs = now + roomDurationSecs() * 1000;
  r.startPrices = startPrices;
  r.startQuotes = startQuotes;
}

async function tryStart(
  state: { rooms: Record<string, Room> },
  id: string,
): Promise<boolean> {
  const r = getRoomFromState(state, id);
  if (r.status !== "open" || !shouldStart(r)) return false;
  await lockRoom(state, id);
  return true;
}

function shouldStart(r: Room): boolean {
  const n = r.players.length;
  if (n < MIN_PLAYERS) return false;
  if (n >= r.maxPlayers) return true;
  return r.players.every((p) => p.ready);
}

async function settleRoom(
  state: {
    rooms: Record<string, Room>;
    wallets: Record<string, import("./db").WalletRow>;
    ledger: import("./db").LedgerRow[];
    settledRooms: Record<string, boolean>;
  },
  id: string,
): Promise<void> {
  const r = getRoomFromState(state, id);
  if (r.status !== "locked") return;

  const stocks = [...new Set(r.players.map((p) => p.stock))];
  const quotes = await fetchAllCryptoPrices();
  const endPrices: Partial<Record<StockId, number>> = {};
  const endQuotes: Partial<Record<StockId, PriceSnapshot>> = {};
  for (const s of stocks) {
    const q = quotes[s];
    if (q) {
      endPrices[s] = q.price;
      endQuotes[s] = {
        price: q.price,
        publishTime: q.publishTime,
        feedName: q.feedName,
      };
    }
  }
  r.endPrices = endPrices;
  r.endQuotes = endQuotes;

  const results: PlayerResult[] = r.players.map((p) => {
    const startQ = r.startQuotes[p.stock];
    const endQ = endQuotes[p.stock];
    const start = r.startPrices[p.stock] ?? 0;
    const end = endPrices[p.stock] ?? 0;
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

  let best = -Infinity;
  for (const res of results) {
    if (res.scoreBps > best) best = res.scoreBps;
  }

  const settleCredits = applySettleCredits(state, id, results);
  if (settleCredits) {
    for (const res of results) {
      if (isDemoPlayer(res.wallet)) {
        res.creditDelta = 0;
        res.payoutCredits = 0;
      } else {
        res.creditDelta =
          settleCredits.creditDeltas[res.wallet] ?? -microToUsdc(STAKE_MICRO);
        res.payoutCredits = settleCredits.payouts[res.wallet] ?? 0;
      }
    }
    r.settleCredits = settleCredits;
  }

  r.results = results;
  r.winners = results.filter((res) => res.scoreBps === best).map((res) => res.wallet);
  r.status = "ended";
}

function toSummary(room: Room, nowMs: number): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    maxPlayers: room.maxPlayers,
    seated: room.players.length,
    readyCount: room.players.filter((p) => p.ready).length,
    status: room.status,
    remainingMs: remainingMs(room, nowMs),
  };
}

export const roomStore = {
  async get(id: string): Promise<{ room: Room; serverNow: number; remainingMs: number }> {
    return withDbAsync(async (state) => {
      const now = serverNowMs();
      const r = getRoomFromState(state, id);
      if (r.status === "locked" && r.endTs && now >= r.endTs) {
        try {
          await settleRoom(state, id);
        } catch {
          /* retry next tick */
        }
      }
      const room = cloneRoom(getRoomFromState(state, id));
      return { room, serverNow: now, remainingMs: remainingMs(room, now) };
    });
  },

  async list(): Promise<{ rooms: RoomSummary[]; serverNow: number }> {
    return withDbAsync(async (state) => {
      const now = serverNowMs();
      ensureSeedRooms(state);
      for (const id of Object.keys(state.rooms)) {
        const r = getRoomFromState(state, id);
        if (r.status === "locked" && r.endTs && now >= r.endTs) {
          try {
            await settleRoom(state, id);
          } catch {
            /* retry */
          }
        }
      }
      const rooms = Object.values(state.rooms)
        .map((r) => migrateRoom(r))
        .sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10))
        .map((r) => toSummary(r, now));
      return { rooms, serverNow: now };
    });
  },

  async create(maxPlayers: CreateRoomSize): Promise<Room> {
    return withDbAsync((state) => {
      ensureSeedRooms(state);
      const ids = Object.keys(state.rooms).map(Number).filter(Number.isFinite);
      const id = String(ids.length ? Math.max(...ids) + 1 : 6);
      const names = Object.values(state.rooms).map((r) => migrateRoom(r).name);
      const name = nextRoomName(names, maxPlayers);
      state.rooms[id] = emptyRoom(id, maxPlayers, name);
      return cloneRoom(state.rooms[id]);
    });
  },

  async reset(id: string): Promise<Room> {
    return withDbAsync((state) => {
      const prev = migrateRoom(getRoomFromState(state, id));
      state.rooms[id] = emptyRoom(id, prev.maxPlayers, prev.name);
      return cloneRoom(state.rooms[id]);
    });
  },

  async join(
    id: string,
    wallet: string,
    stock: StockId,
  ): Promise<{ room: Room; error?: string; nextRoom?: string }> {
    return withDbAsync(async (state) => {
      const r = getRoomFromState(state, id);
      if (!walletHasUsername(state, wallet)) {
        return {
          room: cloneRoom(r),
          error: "Choose your handle before joining a pit.",
        };
      }
      if (r.status !== "open") {
        const next = nextRoomHint(state, id);
        return {
          room: cloneRoom(r),
          error: `${r.name} is live. Try another room.`,
          nextRoom: next,
        };
      }
      if (r.players.some((p) => p.wallet === wallet)) {
        return { room: cloneRoom(r), error: "Already in this room." };
      }
      if (r.players.length >= r.maxPlayers) {
        const next = nextRoomHint(state, id);
        return {
          room: cloneRoom(r),
          error: `${r.name} is full (${r.maxPlayers}/${r.maxPlayers}).`,
          nextRoom: next,
        };
      }

      const freeze = freezeForJoin(state, wallet, id);
      if (!freeze.ok) {
        return { room: cloneRoom(r), error: freeze.error };
      }

      r.players.push({ wallet, stock, joinedAt: Date.now(), ready: false });

      try {
        await tryStart(state, id);
      } catch {
        /* Pyth unavailable — stay open */
      }

      return { room: cloneRoom(getRoomFromState(state, id)) };
    });
  },

  async setReady(
    id: string,
    wallet: string,
  ): Promise<{ room: Room; error?: string; started?: boolean }> {
    return withDbAsync(async (state) => {
      const r = getRoomFromState(state, id);
      if (r.status !== "open") {
        return {
          room: cloneRoom(r),
          error: `Pit is ${r.status === "locked" ? "live" : "final"}.`,
        };
      }
      const player = r.players.find((p) => p.wallet === wallet);
      if (!player) {
        return { room: cloneRoom(r), error: "You are not seated in this room." };
      }
      player.ready = true;

      let started = false;
      try {
        started = await tryStart(state, id);
      } catch (e) {
        return {
          room: cloneRoom(r),
          error: e instanceof Error ? e.message : "Could not start pit (Pyth unavailable).",
        };
      }

      return { room: cloneRoom(getRoomFromState(state, id)), started };
    });
  },

  async suggestOpenRoom(preferredId: string): Promise<string> {
    return withDbAsync((state) => {
      ensureSeedRooms(state);
      const tryId = (id: string): string | null => {
        const raw = state.rooms[id];
        if (!raw) return null;
        const r = migrateRoom(raw);
        if (r.status === "open" && r.players.length < r.maxPlayers) return id;
        return null;
      };
      const direct = tryId(preferredId);
      if (direct) return direct;
      const base = parseInt(preferredId, 10);
      const start = Number.isFinite(base) ? base : 1;
      for (let i = start; i <= start + 50; i++) {
        const open = tryId(String(i));
        if (open) return open;
      }
      const ids = Object.keys(state.rooms).map(Number).filter(Number.isFinite);
      return String(ids.length ? Math.max(...ids) + 1 : 6);
    });
  },
};
