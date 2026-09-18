/**
 * Probe xStock token program behavior (Phase 2 prep). Does not block USDC vault path.
 */
import { Connection, PublicKey } from "@solana/web3.js";

const MINTS = {
  AAPLx: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  TSLAx: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  NVDAx: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
};

async function probeMint(connection: Connection, label: string, address: string) {
  const mint = new PublicKey(address);
  const info = await connection.getAccountInfo(mint);
  if (!info) {
    console.log(`${label}: account not found`);
    return;
  }
  console.log(`\n=== ${label} ${address} ===`);
  console.log("Owner (token program):", info.owner.toBase58());
  console.log("Data length:", info.data.length);
  console.log("Lamports:", info.lamports);
}

async function main() {
  const rpc = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("Set HELIUS_RPC_URL");
  const connection = new Connection(rpc, "confirmed");

  for (const [label, addr] of Object.entries(MINTS)) {
    await probeMint(connection, label, addr);
  }
}

main().catch(console.error);
