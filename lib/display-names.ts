import { WalletRow } from "./db";
import { isDemoPlayer } from "./player-id";

export function displayNameForWallet(
  wallets: Record<string, WalletRow>,
  walletId: string,
): string {
  if (isDemoPlayer(walletId)) return walletId.slice("demo:".length);
  const row = wallets[walletId];
  if (row?.username) return row.username;
  if (walletId.length <= 12) return walletId;
  return `${walletId.slice(0, 4)}…${walletId.slice(-4)}`;
}

export function displayNamesForWallets(
  wallets: Record<string, WalletRow>,
  walletIds: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of walletIds) {
    out[id] = displayNameForWallet(wallets, id);
  }
  return out;
}
