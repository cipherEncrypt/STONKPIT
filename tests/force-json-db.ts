/** Tests always use JSON ledger — never accidental Postgres from a local .env */
delete process.env.DATABASE_URL;
