/**
 * SERVER-ONLY admin: send pending USDC withdrawals from treasury.
 * Never import this file from app/ or components/.
 *
 * Usage:
 *   TREASURY_PRIVATE_KEY=<base58> \
 *   TREASURY_USDC_ADDRESS=<pubkey> \
 *   ALCHEMY_RPC_URL=<rpc> \
 *   npm run payout
 */

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
import type { WithdrawalRow } from "../lib/db";
import {
  assertPayoutScriptOnly,
  runPayoutUntilEmpty,
  USDC_MINT_MAINNET,
} from "../lib/payout-withdrawals";

const USDC_DECIMALS = 6;

if (process.env.NEXT_RUNTIME) {
  throw new Error("payout-pending.ts must not run inside the Next.js server");
}

async function main() {
  assertPayoutScriptOnly();

  const pk = process.env.TREASURY_PRIVATE_KEY;
  const treasuryAddr = process.env.TREASURY_USDC_ADDRESS;
  const rpc =
    process.env.ALCHEMY_RPC_URL ??
    process.env.HELIUS_RPC_URL ??
    process.env.SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com";

  if (!pk) {
    console.error("TREASURY_PRIVATE_KEY missing — exit without sending.");
    process.exit(1);
  }
  if (!treasuryAddr) {
    console.error("TREASURY_USDC_ADDRESS missing — exit without sending.");
    process.exit(1);
  }

  const treasury = Keypair.fromSecretKey(bs58.decode(pk));
  if (treasury.publicKey.toBase58() !== treasuryAddr) {
    console.warn("Warning: key pubkey does not match TREASURY_USDC_ADDRESS");
  }

  const connection = new Connection(rpc, "confirmed");
  const usdcMint = new PublicKey(USDC_MINT_MAINNET);
  const treasuryAta = getAssociatedTokenAddressSync(usdcMint, treasury.publicKey);

  const sendOne = async (row: WithdrawalRow): Promise<string> => {
    if (row.outSignature) {
      throw new Error(`Withdrawal ${row.id} already has outSignature`);
    }
    if (row.status !== "pending") {
      throw new Error(`Withdrawal ${row.id} is not pending`);
    }
    if (!Number.isInteger(row.amount) || row.amount <= 0) {
      throw new Error(`Invalid withdrawal amount for ${row.id}`);
    }

    const dest = new PublicKey(row.pubkey);
    const destAta = getAssociatedTokenAddressSync(usdcMint, dest);
    const tx = new Transaction().add(
      createTransferCheckedInstruction(
        treasuryAta,
        usdcMint,
        destAta,
        treasury.publicKey,
        row.amount,
        USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    return sendAndConfirmTransaction(connection, tx, [treasury]);
  };

  const sent = await runPayoutUntilEmpty(sendOne);
  if (sent === 0) {
    console.log("No pending withdrawals.");
  } else {
    console.log(`Sent ${sent} withdrawal(s).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
