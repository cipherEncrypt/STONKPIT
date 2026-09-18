/**
 * Admin: send pending USDC withdrawals from treasury.
 *
 * Usage:
 *   TREASURY_PRIVATE_KEY=<base58> \
 *   TREASURY_USDC_ADDRESS=<pubkey> \
 *   ALCHEMY_RPC_URL=<rpc> \
 *   npm run payout
 */

import fs from "fs";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;

type DbState = {
  withdrawals: Array<{
    id: string;
    pubkey: string;
    amount: number;
    status: string;
    outSignature: string | null;
    sentAt: number | null;
  }>;
};

function dbPath(): string {
  const raw = process.env.DATABASE_PATH;
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), "data", "stonkpit.json");
}

function loadDb(): DbState {
  const file = dbPath();
  if (!fs.existsSync(file)) throw new Error(`DB not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as DbState;
}

function saveDb(state: DbState): void {
  const file = dbPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

async function main() {
  const pk = process.env.TREASURY_PRIVATE_KEY;
  const treasuryAddr = process.env.TREASURY_USDC_ADDRESS;
  const rpc =
    process.env.ALCHEMY_RPC_URL ??
    process.env.HELIUS_RPC_URL ??
    process.env.SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com";

  if (!pk || !treasuryAddr) {
    console.error("Set TREASURY_PRIVATE_KEY and TREASURY_USDC_ADDRESS");
    process.exit(1);
  }

  const treasury = Keypair.fromSecretKey(bs58.decode(pk));
  if (treasury.publicKey.toBase58() !== treasuryAddr) {
    console.warn("Warning: key pubkey does not match TREASURY_USDC_ADDRESS");
  }

  const state = loadDb();
  const pending = state.withdrawals.filter((w) => w.status === "pending");
  if (!pending.length) {
    console.log("No pending withdrawals.");
    return;
  }

  const connection = new Connection(rpc, "confirmed");
  const treasuryAta = getAssociatedTokenAddressSync(USDC_MINT, treasury.publicKey);

  const batch = pending.slice(0, 5);
  const tx = new Transaction();

  for (const w of batch) {
    const dest = new PublicKey(w.pubkey);
    const destAta = getAssociatedTokenAddressSync(USDC_MINT, dest);
    tx.add(
      createTransferCheckedInstruction(
        treasuryAta,
        USDC_MINT,
        destAta,
        treasury.publicKey,
        w.amount,
        USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
  }

  const sig = await sendAndConfirmTransaction(connection, tx, [treasury]);
  const now = Date.now();
  for (const w of batch) {
    const row = state.withdrawals.find((x) => x.id === w.id);
    if (row) {
      row.status = "sent";
      row.outSignature = sig;
      row.sentAt = now;
    }
  }
  saveDb(state);
  console.log(`Sent ${batch.length} withdrawal(s). Signature: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
