import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export function buildWithdrawMessage(amountMicro: number, nonce: string): string {
  return `stonkpit-withdraw:${amountMicro}:${nonce}`;
}

export function verifyWithdrawSignature(
  pubkey: string,
  amountMicro: number,
  nonce: string,
  signature: string | Uint8Array,
): boolean {
  try {
    const message = buildWithdrawMessage(amountMicro, nonce);
    const messageBytes = new TextEncoder().encode(message);
    const sigBytes =
      typeof signature === "string" ? bs58.decode(signature) : Uint8Array.from(signature);
    const pubKeyBytes = new PublicKey(pubkey).toBytes();
    return nacl.sign.detached.verify(messageBytes, sigBytes, pubKeyBytes);
  } catch {
    return false;
  }
}
