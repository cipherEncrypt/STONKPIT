import { WalletRow } from "./db";
import { isDemoPlayer } from "./player-id";
import { sanitizeDisplayText } from "./sanitize-display";

export function displayNameForWallet(
  wallets: Record<string, WalletRow>,
  walletId: string,
): string {
  if (isDemoPlayer(walletId)) return sanitizeDisplayText(walletId.slice("demo:".length), 24);
  const row = wallets[walletId];
  if (row?.username) return sanitizeDisplayText(row.username, 16);
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
