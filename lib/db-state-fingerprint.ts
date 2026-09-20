import crypto from "crypto";
import type { DbState } from "./db";

/** Stable hash to skip noop Postgres writes after read-only transactions. */
export function stateFingerprint(state: DbState): string {
  const wallets = Object.values(state.wallets)
    .map((w) => [w.pubkey, w.available, w.frozen, w.username])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const deposits = Object.entries(state.deposits)
    .map(([sig, d]) => [sig, d.pubkey, d.amount])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const withdrawals = state.withdrawals
    .map((w) => [w.id, w.pubkey, w.amount, w.status, w.outSignature, w.sentAt])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const rooms = Object.values(state.rooms)
    .map((r) => [
      r.id,
      r.status,
      r.startTs,
      r.endTs,
      r.stakeMicro,
      r.players.map((p) => [p.wallet, p.stock, p.ready, p.joinedAt]),
      r.results.length,
      JSON.stringify(r.startQuotes),
      JSON.stringify(r.endQuotes),
      JSON.stringify(r.results),
      JSON.stringify(r.winners),
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const settled = Object.entries(state.settledRooms).sort(([a], [b]) => a.localeCompare(b));

  const payload = JSON.stringify({ wallets, deposits, withdrawals, rooms, settled });
  return crypto.createHash("sha256").update(payload).digest("hex");
}
