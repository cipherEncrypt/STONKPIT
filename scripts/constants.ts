import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./program-id";

export { PROGRAM_ID };

/** Devnet USDC (Circle faucet). Fallback: mint FakeUSDC in demo script. */
export const DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

/** Mainnet Circle USDC — set in Config when going live */
export const MAINNET_USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

export const AAPLX_MINT = new PublicKey(
  "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
);
export const TSLAX_MINT = new PublicKey(
  "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
);
export const NVDAX_MINT = new PublicKey(
  "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
);

export const ALLOWED_STOCKS = [AAPLX_MINT, TSLAX_MINT, NVDAX_MINT];

export const ONE_USDC = 1_000_000n;
export const DEFAULT_DURATION_SECS = 300;
export const DEMO_DURATION_SECS = 90;
export const FEE_BPS = 300;

export const DEVNET_RPC =
  process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com";

export const LOCAL_RPC = "http://127.0.0.1:8899";

export function clusterRpc(): string {
  if (process.env.LOCAL_VALIDATOR === "1") return LOCAL_RPC;
  return DEVNET_RPC;
}

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
}

export function roomPda(roomId: bigint | number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(roomId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("room"), buf],
    PROGRAM_ID,
  )[0];
}

export function seatPda(room: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("seat"), room.toBuffer(), player.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function mockPricePda(stockMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mock_price"), stockMint.toBuffer()],
    PROGRAM_ID,
  )[0];
}
