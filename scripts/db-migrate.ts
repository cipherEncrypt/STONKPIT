/**
 * Create Postgres tables. Run once against Render (or any DATABASE_URL).
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import { loadEnvFile } from "../lib/load-env";
import { DB_MIGRATE_STATEMENTS } from "../lib/db-migrate-sql";
import { getPgPool, usePostgres } from "../lib/db-pg";

loadEnvFile();

async function main(): Promise<void> {
  if (!usePostgres()) {
    console.error("DATABASE_URL is required for db:migrate");
    process.exit(1);
  }
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    for (const sql of DB_MIGRATE_STATEMENTS) {
      await client.query(sql);
    }
    console.log("Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
