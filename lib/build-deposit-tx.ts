import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { USDC_MINT } from "./constants";
import { MIN_DEPOSIT_MICRO, usdcToMicro } from "./usdc";

const USDC_DECIMALS = 6;

export async function buildUsdcDepositTransaction(
  connection: Connection,
  ownerPubkey: PublicKey,
  treasuryPubkey: PublicKey,
  amountUsdc: number,
): Promise<Transaction> {
  const amountMicro = usdcToMicro(amountUsdc);
  if (amountMicro < MIN_DEPOSIT_MICRO) {
    throw new Error("Minimum deposit is 1.00 USDC.");
  }

  const mint = new PublicKey(USDC_MINT);
  const ownerAta = getAssociatedTokenAddressSync(mint, ownerPubkey);
  const treasuryAta = getAssociatedTokenAddressSync(mint, treasuryPubkey);

  const tx = new Transaction();
  const treasuryInfo = await connection.getAccountInfo(treasuryAta);
  if (!treasuryInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        ownerPubkey,
        treasuryAta,
        treasuryPubkey,
        mint,
      ),
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      ownerAta,
      mint,
      treasuryAta,
      ownerPubkey,
      amountMicro,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = ownerPubkey;

  return tx;
}
