import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { configPda } from "./constants";

const ROOT = path.join(__dirname, "..");

async function main() {
  const rpc = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("Set HELIUS_RPC_URL");

  const paused = process.env.PAUSE !== "0";
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(fs.readFileSync(path.join(ROOT, "keys", "admin.json"), "utf8")),
    ),
  );

  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" },
  );
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(ROOT, "target", "idl", "stonkpit.json"), "utf8"),
  );
  const program = new anchor.Program(idl, provider);
  const config = configPda();

  const sig = await program.methods
    .pause(paused)
    .accounts({
      admin: admin.publicKey,
      config,
    })
    .rpc();

  console.log(`Pause=${paused}. Tx:`, sig);
}

main().catch(console.error);
