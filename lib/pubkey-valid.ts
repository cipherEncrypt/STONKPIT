import { PublicKey } from "@solana/web3.js";
import { isDemoPlayer } from "./player-id";

/** Reject malformed pubkeys before any DB write. Demo seats use demo: prefix. */
export function assertValidPlayerId(id: string): void {
  if (isDemoPlayer(id)) return;
  try {
    const pk = new PublicKey(id);
    if (pk.toBytes().length !== 32) {
      throw new Error("invalid length");
    }
  } catch {
    throw new Error("Invalid wallet pubkey.");
  }
}

export function isValidWalletPubkey(pubkey: string): boolean {
  try {
    assertValidPlayerId(pubkey);
    return !isDemoPlayer(pubkey);
  } catch {
    return false;
  }
}
