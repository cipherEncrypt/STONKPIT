/**
 * Withdraw security tests — run: npm test
 */
import "./force-json-db";
import fs from "fs";
import os from "os";
import path from "path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { requestWithdrawMicro, requestWithdrawMicroAsync } from "../lib/credits";
import { createTestDbState, withDbAsync } from "../lib/db";
import { demoPlayerId } from "../lib/player-id";
import {
  markWithdrawalSent,
  processOnePendingWithdrawal,
  runPayoutUntilEmpty,
} from "../lib/payout-withdrawals";
import { buildWithdrawMessage, verifyWithdrawSignature } from "../lib/withdraw-auth";
import { consumeWithdrawNonce, issueWithdrawNonce } from "../lib/withdraw-nonce";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertEq(actual: number, expected: number, msg: string): void {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

function signWithdraw(
  keypair: Keypair,
  amountMicro: number,
  nonce: string,
): string {
  const message = new TextEncoder().encode(buildWithdrawMessage(amountMicro, nonce));
  const sig = nacl.sign.detached(message, keypair.secretKey);
  return bs58.encode(sig);
}

async function runTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await test("withdraw 5 USDC when available is 4 USDC → reject", async () => {
    const state = createTestDbState();
    const pubkey = "WdAvail4444444444444444444444444444444";
    state.wallets[pubkey] = {
      pubkey,
      available: 4_000_000,
      frozen: 0,
      username: "wd",
      createdAt: 1,
      updatedAt: 1,
    };
    const result = requestWithdrawMicro(state, pubkey, 5_000_000);
    assert(!result.ok, "must reject overdraw");
    assertEq(state.wallets[pubkey].available, 4_000_000, "available unchanged");
  });

  await test("withdraw frozen stake → reject (only available counts)", async () => {
    const state = createTestDbState();
    const pubkey = "WdFrozen555555555555555555555555555555";
    state.wallets[pubkey] = {
      pubkey,
      available: 0,
      frozen: 5_000_000,
      username: "pit",
      createdAt: 1,
      updatedAt: 1,
    };
    const result = requestWithdrawMicro(state, pubkey, 1_000_000);
    assert(!result.ok, "cannot withdraw from frozen");
    assertEq(state.wallets[pubkey].frozen, 5_000_000, "frozen unchanged");
  });

  await test("two parallel withdraw-all → only one succeeds", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stonkpit-wd-par-"));
    process.env.DATABASE_PATH = path.join(tmpDir, "stonkpit.json");
    const pubkey = "WdParallel66666666666666666666666666666";

    await withDbAsync((state) => {
      state.wallets[pubkey] = {
        pubkey,
        available: 3_000_000,
        frozen: 0,
        username: "par",
        createdAt: 1,
        updatedAt: 1,
      };
      return null;
    });

    const results = await Promise.all([
      requestWithdrawMicroAsync(pubkey, 3_000_000),
      requestWithdrawMicroAsync(pubkey, 3_000_000),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    assert(okCount === 1, `exactly one withdraw succeeds, got ${okCount}`);

    const bal = await withDbAsync((state) => state.wallets[pubkey]);
    assertEq(bal.available, 0, "available drained once");
    const pending = await withDbAsync(
      (state) => state.withdrawals.filter((w) => w.pubkey === pubkey && w.status === "pending").length,
    );
    assertEq(pending, 1, "one pending row");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  });

  await test("wallet B signature cannot withdraw wallet A credits", () => {
    const walletA = Keypair.generate();
    const walletB = Keypair.generate();
    const amountMicro = 1_000_000;
    const nonce = issueWithdrawNonce(walletA.publicKey.toBase58());
    const sigB = signWithdraw(walletB, amountMicro, nonce);
    const valid = verifyWithdrawSignature(
      walletA.publicKey.toBase58(),
      amountMicro,
      nonce,
      sigB,
    );
    assert(!valid, "B signature must not verify for A pubkey");
  });

  await test("wallet A signature verifies for wallet A withdraw", () => {
    const walletA = Keypair.generate();
    const amountMicro = 2_000_000;
    const nonce = issueWithdrawNonce(walletA.publicKey.toBase58());
    const sigA = signWithdraw(walletA, amountMicro, nonce);
    assert(
      verifyWithdrawSignature(walletA.publicKey.toBase58(), amountMicro, nonce, sigA),
      "A signature verifies",
    );
  });

  await test("replay same withdraw nonce is rejected", () => {
    const wallet = Keypair.generate();
    const pubkey = wallet.publicKey.toBase58();
    const nonce = issueWithdrawNonce(pubkey);
    assert(consumeWithdrawNonce(pubkey, nonce), "first consume ok");
    assert(!consumeWithdrawNonce(pubkey, nonce), "replay rejected");
  });

  await test("demo user withdraw → reject", () => {
    const state = createTestDbState();
    const demo = demoPlayerId("Spectator");
    const result = requestWithdrawMicro(state, demo, 1_000_000);
    assert(!result.ok, "demo rejected");
  });

  await test("payout run twice does not send twice", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stonkpit-payout-idem-"));
    process.env.DATABASE_PATH = path.join(tmpDir, "stonkpit.json");
    const pubkey = "PayoutIdem77777777777777777777777777777";

    await withDbAsync((state) => {
      state.wallets[pubkey] = {
        pubkey,
        available: 0,
        frozen: 0,
        username: "pay",
        createdAt: 1,
        updatedAt: 1,
      };
      state.withdrawals.push({
        id: "w_test_1",
        pubkey,
        amount: 1_000_000,
        status: "pending",
        outSignature: null,
        createdAt: Date.now(),
        sentAt: null,
      });
      return null;
    });

    let sendCount = 0;
    const mockSend = async () => {
      sendCount++;
      return `mock_sig_${sendCount}`;
    };

    const first = await processOnePendingWithdrawal(mockSend);
    assert(first === "sent", "first run sends");
    assertEq(sendCount, 1, "one on-chain send");

    const second = await processOnePendingWithdrawal(mockSend);
    assert(second === "none", "second run finds nothing pending");
    assertEq(sendCount, 1, "no second send");

    const row = await withDbAsync((state) => state.withdrawals.find((w) => w.id === "w_test_1"));
    assert(row?.status === "sent", "row marked sent");
    assert(row?.outSignature === "mock_sig_1", "outSignature set");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  });

  await test("payout idempotent if row already has outSignature", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stonkpit-payout-skip-"));
    process.env.DATABASE_PATH = path.join(tmpDir, "stonkpit.json");

    await withDbAsync((state) => {
      state.withdrawals.push({
        id: "w_already_sent",
        pubkey: "AlreadySent8888888888888888888888888888",
        amount: 500_000,
        status: "sent",
        outSignature: "existing_sig",
        createdAt: Date.now(),
        sentAt: Date.now(),
      });
      return null;
    });

    let sendCount = 0;
    const sent = await runPayoutUntilEmpty(async () => {
      sendCount++;
      return "should_not_happen";
    });
    assertEq(sent, 0, "no sends");
    assertEq(sendCount, 0, "send fn never called");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  });

  await test("payout failure refunds available in locked write", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stonkpit-payout-fail-"));
    process.env.DATABASE_PATH = path.join(tmpDir, "stonkpit.json");
    const pubkey = "PayoutFail99999999999999999999999999999";

    await withDbAsync((state) => {
      state.wallets[pubkey] = {
        pubkey,
        available: 0,
        frozen: 0,
        username: "fail",
        createdAt: 1,
        updatedAt: 1,
      };
      state.withdrawals.push({
        id: "w_fail_1",
        pubkey,
        amount: 2_000_000,
        status: "pending",
        outSignature: null,
        createdAt: Date.now(),
        sentAt: null,
      });
      return null;
    });

    const result = await processOnePendingWithdrawal(async () => {
      throw new Error("rpc down");
    });
    assert(result === "failed", "marked failed");

    const bal = await withDbAsync((state) => state.wallets[pubkey]);
    assertEq(bal.available, 2_000_000, "credits restored");
    const row = await withDbAsync((state) => state.withdrawals.find((w) => w.id === "w_fail_1"));
    assert(row?.status === "failed", "status failed");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  });

  await test("markWithdrawalSent is idempotent for same row", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stonkpit-mark-idem-"));
    process.env.DATABASE_PATH = path.join(tmpDir, "stonkpit.json");

    await withDbAsync((state) => {
      state.withdrawals.push({
        id: "w_mark",
        pubkey: "MarkIdemAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        amount: 1_000_000,
        status: "pending",
        outSignature: null,
        createdAt: Date.now(),
        sentAt: null,
      });
      return null;
    });

    assert(await markWithdrawalSent("w_mark", "sig_once"), "first mark ok");
    assert(!(await markWithdrawalSent("w_mark", "sig_twice")), "second mark rejected");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
