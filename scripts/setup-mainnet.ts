/**
 * Mainnet bootstrap: init config + create first 1 USDC / 5 min / 2-player room.
 *
 * Usage:
 *   HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=... npx tsx scripts/setup-mainnet.ts
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  ALLOWED_STOCKS,
  FIVE_MINUTES,
  ONE_USDC,
  USDC_MINT,
  configPda,
  roomPda,
} from "./constants";

const ROOT = path.join(__dirname, "..");

function loadKey(name: string): Keypair {
  const p = path.join(ROOT, "keys", `${name}.json`);
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

async function main() {
  const rpc =
    process.env.HELIUS_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    process.env.ANCHOR_PROVIDER_URL;
  if (!rpc) {
    throw new Error("Set HELIUS_RPC_URL or SOLANA_RPC_URL");
  }

  const admin = loadKey("admin");
  const treasury = loadKey("treasury");
  const connection = new Connection(rpc, "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "target", "idl", "stonkpit.json"),
      "utf8",
    ),
  );
  const program = new anchor.Program(idl, provider);

  const config = configPda();
  const configInfo = await connection.getAccountInfo(config);

  if (!configInfo) {
    console.log("Initializing config...");
    await program.methods
      .initConfig(
        treasury.publicKey,
        300,
        2,
        8,
        ALLOWED_STOCKS,
      )
      .accounts({
        admin: admin.publicKey,
        config,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Config:", config.toBase58());
  } else {
    console.log("Config already exists:", config.toBase58());
  }

  const cfg = await program.account.config.fetch(config);
  const roomId = cfg.nextRoomId as anchor.BN;
  const room = roomPda(roomId.toNumber());
  const vault = getAssociatedTokenAddressSync(USDC_MINT, room, true);

  console.log("Creating room", roomId.toString(), "...");
  await program.methods
    .createRoom(new anchor.BN(ONE_USDC.toString()), new anchor.BN(FIVE_MINUTES))
    .accounts({
      admin: admin.publicKey,
      config,
      room,
      usdcMint: USDC_MINT,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("\n=== Mainnet ready ===");
  console.log("Program:  ", program.programId.toBase58());
  console.log("Admin:    ", admin.publicKey.toBase58());
  console.log("Treasury: ", treasury.publicKey.toBase58());
  console.log("Config:   ", config.toBase58());
  console.log("Room:     ", room.toBase58());
  console.log("Vault:    ", vault.toBase58());
  console.log("Stake:    1 USDC");
  console.log("Duration: 5 minutes");
  console.log("Players:  2 min");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
