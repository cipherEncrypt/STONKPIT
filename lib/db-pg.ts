import fs from "fs";
import path from "path";
import type { Pool, PoolClient } from "pg";
import { Pool as PgPool } from "pg";
import { DB_MIGRATE_STATEMENTS } from "./db-migrate-sql";
import type { DbState, DepositRow, WalletRow, WithdrawalRow } from "./db";
import { readStateFromDiskForImport } from "./db-json";
import { isDemoPlayer } from "./player-id";
import { PIT_ROOMS } from "./room-names";
import type { Room, Player, PlayerResult } from "./room-store";
import { emptyRoomExport } from "./db-room-seed";
import { stateFingerprint } from "./db-state-fingerprint";

let pool: Pool | null = null;
let schemaReady = false;
let importChecked = false;

function micro(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "string") return Number(v);
  if (typeof v === "number") return v;
  return Number(v);
}

export function usePostgres(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function sslConfig(): boolean | { rejectUnauthorized: boolean } {
  const url = process.env.DATABASE_URL ?? "";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return false;
  if (
    process.env.NODE_ENV === "production" ||
    url.includes("sslmode=require") ||
    url.includes("render.com")
  ) {
    return { rejectUnauthorized: false };
  }
  return false;
}

export function getPgPool(): Pool {
  if (!usePostgres()) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    pool = new PgPool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig(),
      max: 10,
    });
  }
  return pool;
}

export async function runMigrations(client: PoolClient): Promise<void> {
  for (const sql of DB_MIGRATE_STATEMENTS) {
    await client.query(sql);
  }
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const client = await getPgPool().connect();
  try {
    await runMigrations(client);
    schemaReady = true;
  } finally {
    client.release();
  }
}

async function tablesEmpty(client: PoolClient): Promise<boolean> {
  const w = await client.query(`SELECT COUNT(*)::int AS n FROM wallets`);
  const r = await client.query(`SELECT COUNT(*)::int AS n FROM rooms`);
  return (w.rows[0]?.n ?? 0) === 0 && (r.rows[0]?.n ?? 0) === 0;
}

async function importJsonIfNeeded(client: PoolClient): Promise<void> {
  if (importChecked) return;
  importChecked = true;
  if (!(await tablesEmpty(client))) return;

  const file = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), "data", "stonkpit.json");
  if (!fs.existsSync(file)) return;

  const state = readStateFromDiskForImport(file);
  await persistState(client, state);
}

function roomFromRow(row: Record<string, unknown>, seats: Player[]): Room {
  return {
    id: String(row.id),
    name: String(row.name),
    maxPlayers: Number(row.max_players),
    stakeMicro: micro(row.stake_micro),
    status: row.status as Room["status"],
    players: seats,
    startTs: row.start_ts != null ? Number(row.start_ts) : null,
    endTs: row.end_ts != null ? Number(row.end_ts) : null,
    startPrices: (row.start_prices as Room["startPrices"]) ?? {},
    endPrices: (row.end_prices as Room["endPrices"]) ?? {},
    startQuotes: (row.start_quotes as Room["startQuotes"]) ?? {},
    endQuotes: (row.end_quotes as Room["endQuotes"]) ?? {},
    results: (row.results as PlayerResult[]) ?? [],
    winners: (row.winners as string[]) ?? [],
  };
}

async function loadState(client: PoolClient): Promise<DbState> {
  await client.query(`SELECT pubkey FROM wallets FOR UPDATE`);

  const wallets: Record<string, WalletRow> = {};
  const wRes = await client.query(
    `SELECT pubkey, username, available_micro, frozen_micro, created_at, updated_at FROM wallets`,
  );
  for (const row of wRes.rows) {
    wallets[row.pubkey] = {
      pubkey: row.pubkey,
      username: row.username,
      available: micro(row.available_micro),
      frozen: micro(row.frozen_micro),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  const deposits: Record<string, DepositRow> = {};
  const dRes = await client.query(
    `SELECT signature, pubkey, amount_micro, slot, created_at FROM deposits`,
  );
  for (const row of dRes.rows) {
    deposits[row.signature] = {
      signature: row.signature,
      pubkey: row.pubkey,
      amount: micro(row.amount_micro),
      slot: Number(row.slot),
      createdAt: Number(row.created_at),
    };
  }

  const withdrawals: WithdrawalRow[] = [];
  const wdRes = await client.query(
    `SELECT id, pubkey, amount_micro, status, out_signature, created_at, sent_at FROM withdrawals ORDER BY created_at ASC`,
  );
  for (const row of wdRes.rows) {
    withdrawals.push({
      id: row.id,
      pubkey: row.pubkey,
      amount: micro(row.amount_micro),
      status: row.status,
      outSignature: row.out_signature,
      createdAt: Number(row.created_at),
      sentAt: row.sent_at != null ? Number(row.sent_at) : null,
    });
  }

  const rooms: Record<string, Room> = {};
  const settledRooms: Record<string, boolean> = {};
  const rRes = await client.query(`SELECT * FROM rooms`);
  for (const row of rRes.rows) {
    const sRes = await client.query(
      `SELECT room_id, player_id, stock, ready, joined_at FROM seats WHERE room_id = $1`,
      [row.id],
    );
    const players: Player[] = sRes.rows.map((s) => ({
      wallet: s.player_id,
      stock: s.stock as Player["stock"],
      joinedAt: Number(s.joined_at),
      ready: Boolean(s.ready),
    }));
    rooms[row.id] = roomFromRow(row, players);
    if (row.settled) settledRooms[row.id] = true;
  }

  for (const def of PIT_ROOMS) {
    if (!rooms[def.id]) {
      rooms[def.id] = emptyRoomExport(def);
    }
  }

  return {
    version: 2,
    wallets,
    rooms,
    deposits,
    withdrawals,
    ledger: [],
    settledRooms,
  };
}

async function persistState(client: PoolClient, state: DbState): Promise<void> {
  for (const w of Object.values(state.wallets)) {
    if (isDemoPlayer(w.pubkey)) continue;
    await client.query(
      `INSERT INTO wallets (pubkey, username, available_micro, frozen_micro, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (pubkey) DO UPDATE SET
         username = EXCLUDED.username,
         available_micro = EXCLUDED.available_micro,
         frozen_micro = EXCLUDED.frozen_micro,
         updated_at = EXCLUDED.updated_at`,
      [w.pubkey, w.username, w.available, w.frozen, w.createdAt, w.updatedAt],
    );
  }

  for (const d of Object.values(state.deposits)) {
    await client.query(
      `INSERT INTO deposits (signature, pubkey, amount_micro, slot, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (signature) DO NOTHING`,
      [d.signature, d.pubkey, d.amount, d.slot, d.createdAt],
    );
  }

  await client.query(`DELETE FROM withdrawals`);
  for (const w of state.withdrawals) {
    await client.query(
      `INSERT INTO withdrawals (id, pubkey, amount_micro, status, out_signature, created_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [w.id, w.pubkey, w.amount, w.status, w.outSignature, w.createdAt, w.sentAt],
    );
  }

  for (const room of Object.values(state.rooms)) {
    const priceSource =
      room.startQuotes[room.players[0]?.stock ?? "TSLAX"]?.priceSource ??
      Object.values(room.startQuotes)[0]?.priceSource ??
      null;

    await client.query(
      `INSERT INTO rooms (
        id, name, max_players, stake_micro, status, start_ts, end_ts, price_source, created_at, settled,
        start_prices, end_prices, start_quotes, end_quotes, results, winners
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        max_players = EXCLUDED.max_players,
        stake_micro = EXCLUDED.stake_micro,
        status = EXCLUDED.status,
        start_ts = EXCLUDED.start_ts,
        end_ts = EXCLUDED.end_ts,
        price_source = EXCLUDED.price_source,
        settled = EXCLUDED.settled,
        start_prices = EXCLUDED.start_prices,
        end_prices = EXCLUDED.end_prices,
        start_quotes = EXCLUDED.start_quotes,
        end_quotes = EXCLUDED.end_quotes,
        results = EXCLUDED.results,
        winners = EXCLUDED.winners`,
      [
        room.id,
        room.name,
        room.maxPlayers,
        room.stakeMicro,
        room.status,
        room.startTs,
        room.endTs,
        priceSource,
        Date.now(),
        Boolean(state.settledRooms[room.id]),
        JSON.stringify(room.startPrices),
        JSON.stringify(room.endPrices),
        JSON.stringify(room.startQuotes),
        JSON.stringify(room.endQuotes),
        JSON.stringify(room.results),
        JSON.stringify(room.winners),
      ],
    );

    await client.query(`DELETE FROM seats WHERE room_id = $1`, [room.id]);
    for (const p of room.players) {
      const res = room.results.find((r) => r.wallet === p.wallet);
      await client.query(
        `INSERT INTO seats (
          room_id, player_id, stock, ready, start_price, end_price, score_bps, claimed, is_wallet, joined_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          room.id,
          p.wallet,
          p.stock,
          p.ready,
          res?.startPrice ?? null,
          res?.endPrice ?? null,
          res?.scoreBps ?? null,
          false,
          !isDemoPlayer(p.wallet),
          p.joinedAt,
        ],
      );
    }
  }
}

let pgWriteChain: Promise<void> = Promise.resolve();

export async function withPgAsync<T>(fn: (state: DbState) => T | Promise<T>): Promise<T> {
  await ensureSchema();

  return new Promise((resolve, reject) => {
    pgWriteChain = pgWriteChain
      .then(async () => {
        const client = await getPgPool().connect();
        try {
          try {
            await client.query("BEGIN");
            await client.query(`SELECT pg_advisory_xact_lock($1)`, [0x53544f4e4b]); // STONK
            await importJsonIfNeeded(client);
            const state = await loadState(client);
            const before = stateFingerprint(state);
            const result = await fn(state);
            if (stateFingerprint(state) !== before) {
              await persistState(client, state);
            }
            await client.query("COMMIT");
            resolve(result);
          } catch (e) {
            await client.query("ROLLBACK");
            reject(e);
          }
        } finally {
          client.release();
        }
      })
      .catch(reject);
  });
}
