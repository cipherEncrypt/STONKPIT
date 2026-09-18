import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { USDC_MINT } from "./constants";
import { serverRpcUrl } from "./rpc";
import { MIN_DEPOSIT_MICRO, USDC_MICRO_PER_UNIT } from "./usdc";

const USDC_DECIMALS = 6;

import { treasuryAddress } from "./config";

export { treasuryAddress };

export function publicTreasuryAddress(): string | null {
  return treasuryAddress();
}

type ParsedIx = {
  program?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
};

function collectParsedInstructions(tx: {
  transaction: { message: { instructions: unknown[] } };
  meta?: { innerInstructions?: Array<{ instructions: unknown[] }> | null } | null;
}): ParsedIx[] {
  const out: ParsedIx[] = [];
  for (const ix of tx.transaction.message.instructions) {
    out.push(ix as ParsedIx);
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      out.push(ix as ParsedIx);
    }
  }
  return out;
}

/**
 * Verify on-chain USDC transfer_checked (or transfer) to treasury ATA.
 * Returns amount in micro-USDC.
 */
export async function verifyUsdcDeposit(
  txSig: string,
  expectedPubkey: string,
): Promise<
  { ok: true; amountMicro: number; slot: number } | { ok: false; error: string }
> {
  const treasury = treasuryAddress();
  if (!treasury) {
    return { ok: false, error: "Treasury address not configured." };
  }

  let expectedPk: PublicKey;
  let treasuryPk: PublicKey;
  try {
    expectedPk = new PublicKey(expectedPubkey);
    treasuryPk = new PublicKey(treasury);
  } catch {
    return { ok: false, error: "Invalid pubkey." };
  }

  const treasuryAta = getAssociatedTokenAddressSync(
    new PublicKey(USDC_MINT),
    treasuryPk,
  ).toBase58();

  const connection = new Connection(serverRpcUrl(), "confirmed");
  const tx = await connection.getParsedTransaction(txSig, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx || tx.meta?.err) {
    return { ok: false, error: "Transaction not found or failed on-chain." };
  }

  const signers = tx.transaction.message.accountKeys
    .filter((k) => k.signer)
    .map((k) => k.pubkey.toBase58());
  if (!signers.includes(expectedPubkey)) {
    return {
      ok: false,
      error: "Transaction signer does not match the connected wallet.",
    };
  }

  let receivedMicro = 0;

  for (const ix of collectParsedInstructions(tx)) {
    if (ix.program !== "spl-token") continue;
    const type = ix.parsed?.type;
    if (type !== "transferChecked" && type !== "transfer") continue;

    const info = ix.parsed?.info ?? {};
    const mint = info.mint as string | undefined;
    if (mint && mint !== USDC_MINT) continue;

    const authority = info.authority as string | undefined;
    const owner = info.owner as string | undefined;
    const sourceOwner = authority ?? owner;
    if (sourceOwner && sourceOwner !== expectedPubkey) continue;

    const destination = info.destination as string | undefined;
    if (!destination || destination !== treasuryAta) continue;

    let amountMicro = 0;
    if (type === "transferChecked") {
      const tokenAmount = info.tokenAmount as { amount?: string } | undefined;
      amountMicro = tokenAmount?.amount ? Number(tokenAmount.amount) : 0;
    } else {
      const amt = info.amount as string | undefined;
      amountMicro = amt ? Number(amt) : 0;
    }

    if (amountMicro > 0) receivedMicro += amountMicro;
  }

  if (receivedMicro <= 0) {
    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];
    for (const postBal of post) {
      if (postBal.mint !== USDC_MINT) continue;
      if (postBal.owner !== treasury) continue;
      const acctIndex = postBal.accountIndex;
      const preBal = pre.find((p) => p.accountIndex === acctIndex);
      const postAmt = Number(postBal.uiTokenAmount.amount);
      const preAmt = preBal ? Number(preBal.uiTokenAmount.amount) : 0;
      const delta = postAmt - preAmt;
      if (delta > 0) receivedMicro += delta;
    }
  }

  if (receivedMicro < MIN_DEPOSIT_MICRO) {
    return { ok: false, error: "Deposit must be at least 1.00 USDC." };
  }

  const slot = tx.slot ?? 0;
  return { ok: true, amountMicro: receivedMicro, slot };
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

export { USDC_MICRO_PER_UNIT };
