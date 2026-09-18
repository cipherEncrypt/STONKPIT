/** Server-side mainnet RPC (also served to the browser via /api/config). */
export function serverRpcUrl(): string {
  return (
    process.env.ALCHEMY_RPC_URL ??
    process.env.HELIUS_RPC_URL ??
    process.env.SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com"
  );
}
