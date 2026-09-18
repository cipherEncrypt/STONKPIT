/**
 * Join a room with real USDC. Player keypair path via PLAYER_KEY env (default: keys/player.json).
 *
 *   STOCK=AAPL| TSLA|NVDA  HELIUS_RPC_URL=... ROOM_ID=1 npx tsx scripts/join-room.ts
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
  AAPLX_MINT,
  NVDAX_MINT,
  TSLAX_MINT,
  USDC_MINT,
  configPda,
  roomPda,
  seatPda,
} from "./constants";

const ROOT = path.join(__dirname, "..");

function loadKey(file: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))),
  );
}

async function main() {
  const rpc = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("Set HELIUS_RPC_URL");

  const roomId = Number(process.env.ROOM_ID || "1");
  const stock = (process.env.STOCK || "AAPL").toUpperCase();
  const stockMint =
    stock === "TSLA" ? TSLAX_MINT : stock === "NVDA" ? NVDAX_MINT : AAPLX_MINT;

  const playerPath =
    process.env.PLAYER_KEY || path.join(ROOT, "keys", "player.json");
  const player = loadKey(playerPath);

  const connection = new Connection(rpc, "confirmed");
  const wallet = new anchor.Wallet(player);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(ROOT, "target", "idl", "stonkpit.json"), "utf8"),
  );
  const program = new anchor.Program(idl, provider);

  const config = configPda();
  const room = roomPda(roomId);
  const seat = seatPda(room, player.publicKey);
  const vault = getAssociatedTokenAddressSync(USDC_MINT, room, true);
  const playerUsdc = getAssociatedTokenAddressSync(USDC_MINT, player.publicKey);

  console.log("Player:", player.publicKey.toBase58());
  console.log("Room:  ", room.toBase58());
  console.log("Stock: ", stock, stockMint.toBase58());

  const sig = await program.methods
    .joinRoom(stockMint)
    .accounts({
      player: player.publicKey,
      config,
      room,
      seat,
      playerUsdc,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Joined. Tx:", sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
