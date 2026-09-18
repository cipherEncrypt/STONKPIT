/**
 * Full devnet payout demo: deploy → init → 2 players → lock → settle → claim.
 * Uses admin-posted mock prices (devnet). ~90s room duration.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  MINT_SIZE,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  ALLOWED_STOCKS,
  AAPLX_MINT,
  DEMO_DURATION_SECS,
  DEVNET_RPC,
  FEE_BPS,
  clusterRpc,
  ONE_USDC,
  TSLAX_MINT,
  configPda,
  mockPricePda,
  roomPda,
  seatPda,
} from "./constants";
import { PROGRAM_ID } from "./program-id";

const ROOT = path.join(__dirname, "..");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadOrCreateKey(name: string): Keypair {
  const p = path.join(ROOT, "keys", `${name}.json`);
  if (!fs.existsSync(p)) {
    const kp = Keypair.generate();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`Created keys/${name}.json → ${kp.publicKey.toBase58()}`);
    return kp;
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

async function airdrop(connection: Connection, pk: PublicKey, sol = 2) {
  const bal = await connection.getBalance(pk);
  if (bal >= sol * LAMPORTS_PER_SOL) {
    console.log(`  ${pk.toBase58()} already has ${bal / LAMPORTS_PER_SOL} SOL`);
    return;
  }
  const amount = sol * LAMPORTS_PER_SOL;
  console.log(`  Airdropping ${sol} SOL → ${pk.toBase58()}`);
  const sig = await connection.requestAirdrop(pk, amount);
  await connection.confirmTransaction(sig, "confirmed");
}

async function createFakeUsdc(
  connection: Connection,
  payer: Keypair,
): Promise<{ mint: PublicKey; authority: Keypair }> {
  const mintPath = path.join(ROOT, "keys", "fake-usdc-mint.json");
  const authPath = path.join(ROOT, "keys", "fake-usdc-authority.json");

  if (fs.existsSync(mintPath)) {
    const mint = new PublicKey(fs.readFileSync(mintPath, "utf8").trim());
    const authority = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(authPath, "utf8"))),
    );
    return { mint, authority };
  }

  const authority = Keypair.generate();
  const mint = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mint.publicKey,
      6,
      authority.publicKey,
      null,
      TOKEN_PROGRAM_ID,
    ),
  );
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(payer, mint);
  await connection.sendRawTransaction(tx.serialize());
  await sleep(2000);

  fs.writeFileSync(mintPath, mint.publicKey.toBase58());
  fs.writeFileSync(authPath, JSON.stringify(Array.from(authority.secretKey)));
  console.log(`  FakeUSDC mint: ${mint.publicKey.toBase58()}`);
  return { mint: mint.publicKey, authority };
}

async function mintUsdc(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  authority: Keypair,
  owner: PublicKey,
  amount: bigint,
) {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      owner,
      mint,
    ),
    createMintToInstruction(mint, ata, authority.publicKey, amount),
  );
  await sendAndConfirmTransaction(connection, tx, [payer, authority]);
  return ata;
}

async function usdcBalance(connection: Connection, ata: PublicKey): Promise<bigint> {
  const info = await connection.getTokenAccountBalance(ata);
  return BigInt(info.value.amount);
}

async function deployProgram(
  connection: Connection,
  admin: Keypair,
  rpc: string,
  isLocal: boolean,
) {
  const so = path.join(ROOT, "target", "deploy", "stonkpit.so");
  const programKp = loadOrCreateKey("program");
  if (!fs.existsSync(so)) {
    throw new Error("Run npm run build first");
  }
  const info = await connection.getAccountInfo(PROGRAM_ID);
  if (info?.executable) {
    console.log("Program already deployed:", PROGRAM_ID.toBase58());
    return;
  }
  console.log("Deploying program...");
  const { execSync } = await import("child_process");
  const solanaBin =
    process.env.SOLANA_BIN ||
    (isLocal
      ? "/Users/macair/.local/share/solana/install/releases/stable-e29e5d910f0c2b7176f58174e592e8488099ef75/solana-release/bin/solana"
      : "solana");
  execSync(
    `${solanaBin} program deploy target/deploy/stonkpit.so --program-id keys/program.json --keypair keys/admin.json --url ${rpc}`,
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, PATH: process.env.PATH } },
  );
}

async function main() {
  console.log("=== StonkPit devnet demo ===\n");
  const admin = loadOrCreateKey("admin");
  const treasury = loadOrCreateKey("treasury");
  const player1 = loadOrCreateKey("player1");
  const player2 = loadOrCreateKey("player2");

  const rpc = clusterRpc();
  const isLocal = rpc === "http://127.0.0.1:8899";
  console.log("RPC:", rpc, isLocal ? "(local validator — devnet faucet fallback)" : "(devnet)");
  const connection = new Connection(rpc, "confirmed");

  console.log("1) Fund wallets (SOL airdrop)");
  const solEach = isLocal ? 100 : 2;
  await airdrop(connection, admin.publicKey, solEach);
  await airdrop(connection, player1.publicKey, solEach);
  await airdrop(connection, player2.publicKey, solEach);

  console.log("\n2) Deploy program");
  await deployProgram(connection, admin, rpc, isLocal);

  console.log("\n3) FakeUSDC mint + fund players");
  const { mint: usdcMint, authority: mintAuth } = await createFakeUsdc(connection, admin);
  const p1Usdc = await mintUsdc(connection, admin, usdcMint, mintAuth, player1.publicKey, 10n * ONE_USDC);
  const p2Usdc = await mintUsdc(connection, admin, usdcMint, mintAuth, player2.publicKey, 10n * ONE_USDC);
  console.log(`  player1 USDC: ${p1Usdc.toBase58()}`);
  console.log(`  player2 USDC: ${p2Usdc.toBase58()}`);

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(ROOT, "target", "idl", "stonkpit.json"), "utf8"));
  const program = new anchor.Program(idl, provider);

  const config = configPda();
  const configInfo = await connection.getAccountInfo(config);

  console.log("\n4) init_config");
  if (!configInfo) {
    const sig = await program.methods
      .initConfig(treasury.publicKey, usdcMint, FEE_BPS, 2, 8, ALLOWED_STOCKS)
      .accounts({ admin: admin.publicKey, config, systemProgram: SystemProgram.programId })
      .rpc();
    console.log("  init_config tx:", sig);
  } else {
    console.log("  Config exists:", config.toBase58());
  }

  console.log("\n5) Post mock start prices (AAPL $100, TSLA $200)");
  const aaplMock = mockPricePda(AAPLX_MINT);
  const tslaMock = mockPricePda(TSLAX_MINT);
  await program.methods
    .postMockPrice(AAPLX_MINT, new anchor.BN(10_000))
    .accounts({ admin: admin.publicKey, config, mockPrice: aaplMock, systemProgram: SystemProgram.programId })
    .rpc();
  await program.methods
    .postMockPrice(TSLAX_MINT, new anchor.BN(20_000))
    .accounts({ admin: admin.publicKey, config, mockPrice: tslaMock, systemProgram: SystemProgram.programId })
    .rpc();

  const cfg = await program.account.config.fetch(config);
  const roomId = (cfg.nextRoomId as anchor.BN).toNumber();
  const room = roomPda(roomId);
  const vault = getAssociatedTokenAddressSync(usdcMint, room, true);

  const duration = Number(process.env.DEMO_DURATION || DEMO_DURATION_SECS);
  console.log(`\n6) create_room #${roomId} (stake=1 USDC, duration=${duration}s)`);
  const createSig = await program.methods
    .createRoom(new anchor.BN(ONE_USDC.toString()), new anchor.BN(duration))
    .accounts({
      admin: admin.publicKey,
      config,
      room,
      usdcMint,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("  create_room tx:", createSig);

  const seat1 = seatPda(room, player1.publicKey);
  const seat2 = seatPda(room, player2.publicKey);

  console.log("\n7) join_room — player1 AAPL, player2 TSLA");
  const join1Sig = await program.methods
    .joinRoom(AAPLX_MINT)
    .accounts({
      player: player1.publicKey,
      config,
      room,
      seat: seat1,
      playerUsdc: p1Usdc,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([player1])
    .rpc();
  console.log("  player1 join tx:", join1Sig);

  const join2Sig = await program.methods
    .joinRoom(TSLAX_MINT)
    .accounts({
      player: player2.publicKey,
      config,
      room,
      seat: seat2,
      playerUsdc: p2Usdc,
      vault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([player2])
    .rpc();
  console.log("  player2 join tx:", join2Sig);

  console.log("\n8) lock_room");
  const lockSig = await program.methods
    .lockRoom()
    .accounts({ config, room })
    .remainingAccounts([
      { pubkey: seat1, isWritable: true, isSigner: false },
      { pubkey: seat2, isWritable: true, isSigner: false },
      { pubkey: aaplMock, isWritable: false, isSigner: false },
      { pubkey: tslaMock, isWritable: false, isSigner: false },
    ])
    .rpc();
  console.log("  lock_room tx:", lockSig);

  let roomAcc = await program.account.room.fetch(room);
  const endTs = (roomAcc.endTs as anchor.BN).toNumber();
  const now = Math.floor(Date.now() / 1000);
  const waitSec = Math.max(0, endTs - now + 2);
  console.log(`\n9) Waiting ${waitSec}s until end_ts=${endTs}...`);
  await sleep(waitSec * 1000);

  console.log("\n10) Post mock end prices (AAPL +10%, TSLA +2% → AAPL wins)");
  await program.methods
    .postMockPrice(AAPLX_MINT, new anchor.BN(11_000))
    .accounts({ admin: admin.publicKey, config, mockPrice: aaplMock, systemProgram: SystemProgram.programId })
    .rpc();
  await program.methods
    .postMockPrice(TSLAX_MINT, new anchor.BN(20_400))
    .accounts({ admin: admin.publicKey, config, mockPrice: tslaMock, systemProgram: SystemProgram.programId })
    .rpc();

  console.log("\n11) settle_room");
  const settleSig = await program.methods
    .settleRoom()
    .accounts({ config, room })
    .remainingAccounts([
      { pubkey: seat1, isWritable: true, isSigner: false },
      { pubkey: seat2, isWritable: true, isSigner: false },
      { pubkey: aaplMock, isWritable: false, isSigner: false },
      { pubkey: tslaMock, isWritable: false, isSigner: false },
    ])
    .rpc();
  console.log("  settle_room tx:", settleSig);

  roomAcc = await program.account.room.fetch(room);
  const winnerPk = roomAcc.winners[0] as PublicKey;
  const winner = winnerPk.equals(player1.publicKey) ? player1 : player2;
  const winnerUsdc = winnerPk.equals(player1.publicKey) ? p1Usdc : p2Usdc;
  const winnerSeat = winnerPk.equals(player1.publicKey) ? seat1 : seat2;

  const treasuryUsdc = getAssociatedTokenAddressSync(usdcMint, treasury.publicKey);
  const createTreasuryAta = createAssociatedTokenAccountIdempotentInstruction(
    admin.publicKey,
    treasuryUsdc,
    treasury.publicKey,
    usdcMint,
  );
  await sendAndConfirmTransaction(connection, new Transaction().add(createTreasuryAta), [admin]);

  const before = await usdcBalance(connection, winnerUsdc);
  console.log(`\n12) claim — winner ${winner.publicKey.toBase58()}`);
  console.log(`  Winner USDC before: ${before} (${Number(before) / 1e6} USDC)`);

  const claimSig = await program.methods
    .claim()
    .accounts({
      winner: winner.publicKey,
      config,
      room,
      seat: winnerSeat,
      vault,
      winnerUsdc,
      treasury: treasury.publicKey,
      treasuryUsdc,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([winner])
    .rpc();

  const after = await usdcBalance(connection, winnerUsdc);
  console.log(`  claim tx: ${claimSig}`);
  console.log(`  Winner USDC after:  ${after} (${Number(after) / 1e6} USDC)`);
  console.log(`  Delta: +${after - before} (${Number(after - before) / 1e6} USDC)`);

  console.log("\n=== DEMO COMPLETE ===");
  console.log("Program:", PROGRAM_ID.toBase58());
  console.log("USDC mint:", usdcMint.toBase58());
  console.log("Room:", room.toBase58());
  console.log("Winner:", winner.publicKey.toBase58());
  console.log("\nTx summary:");
  console.log("  create_room:", createSig);
  console.log("  join p1:    ", join1Sig);
  console.log("  join p2:    ", join2Sig);
  console.log("  lock:       ", lockSig);
  console.log("  settle:     ", settleSig);
  console.log("  claim:      ", claimSig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
