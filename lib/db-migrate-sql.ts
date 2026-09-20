/** DDL shared by scripts/db-migrate.ts and server boot (idempotent). */

export const DB_MIGRATE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS wallets (
    pubkey TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    available_micro BIGINT NOT NULL DEFAULT 0,
    frozen_micro BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS deposits (
    signature TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL REFERENCES wallets(pubkey),
    amount_micro BIGINT NOT NULL,
    slot BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS deposits_pubkey_idx ON deposits(pubkey)`,
  `CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL REFERENCES wallets(pubkey),
    amount_micro BIGINT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
    out_signature TEXT UNIQUE,
    created_at BIGINT NOT NULL,
    sent_at BIGINT
  )`,
  `CREATE INDEX IF NOT EXISTS withdrawals_pubkey_idx ON withdrawals(pubkey)`,
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_players INT NOT NULL,
    stake_micro BIGINT NOT NULL,
    status TEXT NOT NULL,
    start_ts BIGINT,
    end_ts BIGINT,
    price_source TEXT,
    created_at BIGINT NOT NULL,
    settled BOOLEAN NOT NULL DEFAULT FALSE,
    start_prices JSONB NOT NULL DEFAULT '{}',
    end_prices JSONB NOT NULL DEFAULT '{}',
    start_quotes JSONB NOT NULL DEFAULT '{}',
    end_quotes JSONB NOT NULL DEFAULT '{}',
    results JSONB NOT NULL DEFAULT '[]',
    winners JSONB NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS seats (
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    stock TEXT NOT NULL,
    ready BOOLEAN NOT NULL DEFAULT FALSE,
    start_price DOUBLE PRECISION,
    end_price DOUBLE PRECISION,
    score_bps INT,
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    is_wallet BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (room_id, player_id)
  )`,
];
