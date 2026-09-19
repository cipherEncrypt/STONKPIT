const NONCE_TTL_MS = 5 * 60 * 1000;

type NonceEntry = { nonce: string; expiresAt: number };

const store = new Map<string, NonceEntry>();

function randomNonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function issueWithdrawNonce(pubkey: string): string {
  const nonce = randomNonce();
  store.set(pubkey, { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
  return nonce;
}

/** Returns true and consumes the nonce when valid. */
export function consumeWithdrawNonce(pubkey: string, nonce: string): boolean {
  const entry = store.get(pubkey);
  if (!entry || entry.nonce !== nonce) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(pubkey);
    return false;
  }
  store.delete(pubkey);
  return true;
}
