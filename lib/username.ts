import { WalletRow } from "./db";

export const HANDLE_RE = /^[a-zA-Z0-9_]{3,16}$/;

export function validateHandle(handle: string): string | null {
  const h = handle.trim();
  if (h.length < 3 || h.length > 16) {
    return "Handle must be 3–16 characters.";
  }
  if (!HANDLE_RE.test(h)) {
    return "Letters, numbers, and underscore only.";
  }
  return null;
}

export function isHandleTaken(
  wallets: Record<string, WalletRow>,
  handle: string,
  excludePubkey?: string,
): boolean {
  const lower = handle.toLowerCase();
  for (const w of Object.values(wallets)) {
    if (!w.username) continue;
    if (w.pubkey === excludePubkey) continue;
    if (w.username.toLowerCase() === lower) return true;
  }
  return false;
}

export function setUsernameOnWallet(
  wallets: Record<string, WalletRow>,
  pubkey: string,
  handle: string,
): { ok: true; username: string } | { ok: false; error: string } {
  const err = validateHandle(handle);
  if (err) return { ok: false, error: err };
  if (wallets[pubkey]?.username) {
    return { ok: false, error: "Handle already set for this wallet." };
  }
  if (isHandleTaken(wallets, handle, pubkey)) {
    return { ok: false, error: "That handle is taken." };
  }

  const now = Date.now();
  if (!wallets[pubkey]) {
    wallets[pubkey] = {
      pubkey,
      available: 0,
      frozen: 0,
      username: handle,
      createdAt: now,
      updatedAt: now,
    };
  } else {
    wallets[pubkey].username = handle;
    wallets[pubkey].updatedAt = now;
  }

  return { ok: true, username: handle };
}
