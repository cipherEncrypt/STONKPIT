import { microToUsdc } from "./usdc";

/** Display stake as $1, $5, $25, etc. */
export function formatStakeUsd(micro: number): string {
  const usd = microToUsdc(micro);
  if (usd >= 1 && usd % 1 === 0) return `$${usd.toFixed(0)}`;
  return `$${usd.toFixed(2)}`;
}
