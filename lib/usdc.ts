/** 1.00 USDC = 1_000_000 micro-USDC (6 decimals). */
export const USDC_MICRO_PER_UNIT = 1_000_000;

export const STAKE_MICRO = 1_000_000;
export const MIN_DEPOSIT_MICRO = 1_000_000;

export function microToUsdc(micro: number): number {
  return micro / USDC_MICRO_PER_UNIT;
}

export function usdcToMicro(usdc: number): number {
  return Math.round(usdc * USDC_MICRO_PER_UNIT);
}

export function formatUsdcMicro(micro: number): string {
  return `${(micro / USDC_MICRO_PER_UNIT).toFixed(2)} USDC`;
}
