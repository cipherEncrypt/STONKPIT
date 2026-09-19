import { roomDurationSecs } from "./config";
import { MIN_PLAYERS, StockId } from "./constants";
import {
  applySettleCredits,
  freezeForJoin,
  refundFrozenStakes,
  SettleCreditsResult,
} from "./credits";
import { withDbAsync } from "./db";
import { isDemoPlayer } from "./player-id";
import {
  PIT_ROOM_IDS,
  PIT_ROOMS,
  pitRoomDef,
  PitRoomDef,
} from "./room-names";
import { microToUsdc } from "./usdc";
import { remainingMs, serverNowMs } from "./room-clock";
import { fightMarketQuote, PriceSource, resolveMarketPrice } from "./market-price";
import { feedAgeSeconds } from "./pyth-feed-status";
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
  priceSource: PriceSource;
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
  stakeMicro: number;
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
  stakeMicro: number;
  seated: number;
  readyCount: number;
  status: RoomStatus;
  remainingMs: number;
};

function emptyRoom(def: PitRoomDef): Room {
  return {
    id: def.id,
    name: def.name,
    maxPlayers: def.maxPlayers,
    stakeMicro: def.stakeMicro,
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

function applyDefConfig(r: Room, def: PitRoomDef): Room {
  r.name = def.name;
  r.maxPlayers = def.maxPlayers;
  r.stakeMicro = def.stakeMicro;
  return r;
}

function migrateRoom(raw: Room & { lockTs?: number | null }): Room {
  const def = pitRoomDef(raw.id);
  const r = { ...raw };
  if (def) {
    applyDefConfig(r, def);
  } else {
    r.name = r.name ?? `Pit ${r.id}`;
    r.maxPlayers = r.maxPlayers ?? 5;
    r.stakeMicro = r.stakeMicro ?? 1_000_000;
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

const PYTH_LIVE_MAX_AGE_SEC = 120;

/** Re-freeze fights that locked on stale on-chain Pyth before Jupiter wiring. */
async function repairLegacyLockedQuotes(r: Room): Promise<void> {
  if (r.status !== "locked") return;
  const nowSec = Math.floor(Date.now() / 1000);
  const stocks = [...new Set(r.players.map((p) => p.stock))];
  for (const s of stocks) {
    const tier = await resolveMarketPrice(s);
    const q = r.startQuotes[s];
    const age = q?.publishTime ? feedAgeSeconds(q.publishTime, nowSec) : Number.POSITIVE_INFINITY;
    const needsRepair =
      !q ||
      !q.priceSource ||
      q.priceSource === "PYTH_STALE" ||
      (age > 120 && tier.priceSource === "JUPITER" && q.priceSource !== "JUPITER") ||
      (q.priceSource === "PYTH" && age > PYTH_LIVE_MAX_AGE_SEC && tier.priceSource === "JUPITER");
    if (!needsRepair) continue;
    r.startPrices[s] = tier.price;
    r.startQuotes[s] = {
      price: tier.price,
      publishTime: tier.publishTime,
      feedName: tier.feedName,
      priceSource: tier.priceSource,
    };
  }
}

function ensureSeedRooms(state: { rooms: Record<string, Room> }): void {
  for (const def of PIT_ROOMS) {
    if (!state.rooms[def.id]) {
      state.rooms[def.id] = emptyRoom(def);
    } else {
      const r = migrateRoom(state.rooms[def.id]);
      applyDefConfig(r, def);
      state.rooms[def.id] = r;
    }
  }
}

function nextOpenRoomHint(state: { rooms: Record<string, Room> }, afterId: string): string {
  const startIdx = PIT_ROOM_IDS.indexOf(afterId);
  const order =
    startIdx >= 0
      ? [...PIT_ROOM_IDS.slice(startIdx + 1), ...PIT_ROOM_IDS.slice(0, startIdx + 1)]
      : PIT_ROOM_IDS;

  for (const id of order) {
    const raw = state.rooms[id];
    if (!raw) continue;
    const r = migrateRoom(raw);
    if (r.status === "open" && r.players.length < r.maxPlayers) return id;
  }
  return PIT_ROOM_IDS[0];
}

function cloneRoom(r: Room): Room {
  return structuredClone(r);
}

function getRoomFromState(state: { rooms: Record<string, Room> }, id: string): Room {
  ensureSeedRooms(state);
  const def = pitRoomDef(id) ?? PIT_ROOMS[0];
  const roomId = def.id;
  if (!state.rooms[roomId]) {
    state.rooms[roomId] = emptyRoom(def);
  } else {
    const r = migrateRoom(state.rooms[roomId]);
    applyDefConfig(r, def);
    state.rooms[roomId] = r;
  }
  return state.rooms[roomId];
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
  const startPrices: Partial<Record<StockId, number>> = {};
  const startQuotes: Partial<Record<StockId, PriceSnapshot>> = {};
  for (const s of stocks) {
    const q = await fightMarketQuote(s);
    startPrices[s] = q.price;
    startQuotes[s] = {
      price: q.price,
      publishTime: q.publishTime,
      feedName: q.feedName,
      priceSource: q.priceSource,
    };
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
  if (r.status === "ended") return;
  if (r.status !== "locked") return;
  if (state.settledRooms[id]) {
    r.status = "ended";
    return;
  }

  const stocks = [...new Set(r.players.map((p) => p.stock))];
  const endPrices: Partial<Record<StockId, number>> = {};
  const endQuotes: Partial<Record<StockId, PriceSnapshot>> = {};
  for (const s of stocks) {
    const src = r.startQuotes[s]?.priceSource;
    if (!src) continue;
    const q = await fightMarketQuote(s, src);
    endPrices[s] = q.price;
    endQuotes[s] = {
      price: q.price,
      publishTime: q.publishTime,
      feedName: q.feedName,
      priceSource: q.priceSource,
    };
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

  const settleCredits = applySettleCredits(state, id, results, r.stakeMicro);
  if (settleCredits) {
    for (const res of results) {
      if (isDemoPlayer(res.wallet)) {
        res.creditDelta = 0;
        res.payoutCredits = 0;
      } else {
        res.creditDelta =
          settleCredits.creditDeltas[res.wallet] ?? -microToUsdc(r.stakeMicro);
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
    stakeMicro: room.stakeMicro,
    seated: room.players.length,
    readyCount: room.players.filter((p) => p.ready).length,
    status: room.status,
    remainingMs: remainingMs(room, nowMs),
  };
}

export const roomStore = {
  async liveMarketQuotes(
    id: string,
  ): Promise<{
    room: Room;
    live: Partial<Record<StockId, import("./market-price").MarketQuote>>;
  }> {
    return withDbAsync(async (state) => {
      const r = getRoomFromState(state, id);
      if (r.status === "locked") {
        await repairLegacyLockedQuotes(r);
      }
      const stocks = [...new Set(r.players.map((p) => p.stock))];
      const live: Partial<Record<StockId, import("./market-price").MarketQuote>> = {};
      for (const s of stocks) {
        const src = r.startQuotes[s]?.priceSource;
        if (!src) {
          const snap = await fightMarketQuote(s);
          live[s] = snap;
          continue;
        }
        live[s] = await fightMarketQuote(s, src);
      }
      return { room: cloneRoom(r), live };
    });
  },

  async get(id: string): Promise<{ room: Room; serverNow: number; remainingMs: number }> {
    return withDbAsync(async (state) => {
      const now = serverNowMs();
      const r = getRoomFromState(state, id);
      if (r.status === "locked") {
        await repairLegacyLockedQuotes(r);
      }
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
      for (const id of PIT_ROOM_IDS) {
        const r = getRoomFromState(state, id);
        if (r.status === "locked") {
          await repairLegacyLockedQuotes(r);
        }
        if (r.status === "locked" && r.endTs && now >= r.endTs) {
          try {
            await settleRoom(state, id);
          } catch {
            /* retry */
          }
        }
      }
      const rooms = PIT_ROOM_IDS
        .map((id) => toSummary(migrateRoom(getRoomFromState(state, id)), now));
      return { rooms, serverNow: now };
    });
  },

  async reset(id: string): Promise<Room> {
    return withDbAsync((state) => {
      const def = pitRoomDef(id) ?? PIT_ROOMS[0];
      const roomId = def.id;
      const existing = getRoomFromState(state, roomId);
      if (existing.status !== "ended" && !state.settledRooms[roomId]) {
        refundFrozenStakes(
          state,
          roomId,
          existing.players.map((p) => p.wallet),
          existing.stakeMicro,
        );
      }
      delete state.settledRooms[roomId];
      state.rooms[roomId] = emptyRoom(def);
      return cloneRoom(state.rooms[roomId]);
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
        const next = nextOpenRoomHint(state, id);
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
        const next = nextOpenRoomHint(state, id);
        return {
          room: cloneRoom(r),
          error: `${r.name} is full (${r.maxPlayers}/${r.maxPlayers}).`,
          nextRoom: next,
        };
      }

      const freeze = freezeForJoin(state, wallet, id, r.stakeMicro, r.name);
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
      return nextOpenRoomHint(state, preferredId);
    });
  },
};
