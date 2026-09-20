/**
 * Production audit tests — credits, DB, payouts, ties.
 * Run: npm test
 */
import "./force-json-db";
import fs from "fs";
import os from "os";
import path from "path";
import { creditDeposit, freezeForJoin, refundFrozenStakes, requestWithdrawMicro } from "../lib/credits";
import { createTestDbState, withDbAsync } from "../lib/db";
import { computeSettlement, walletPlayerCount } from "../lib/payout-preview";
import { demoPlayerId } from "../lib/player-id";
import { PlayerResult } from "../lib/room-store";
import { setUsernameOnWallet } from "../lib/username";
import { ResultRow } from "../lib/final-results";
import { buildResultToastContent } from "../lib/result-toast";
import { microToUsdc } from "../lib/usdc";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertEq(actual: number, expected: number, msg: string): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

function mkResult(
  wallet: string,
  scoreBps: number,
  stock: "AAPLX" | "TSLAX" | "NVDAX" = "TSLAX",
): PlayerResult {
  return {
    wallet,
    stock,
    joinedAt: 0,
    ready: true,
    startPrice: 100,
    endPrice: 100 + scoreBps / 100,
    scoreBps,
    feedName: "Crypto.TSLAX/USD",
    startPublishTime: 1,
    endPublishTime: 2,
  };
}

function freshState() {
  return createTestDbState();
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

  await test("deposit replay does not credit twice", () => {
    const state = freshState();
    const pubkey = "WalletA1111111111111111111111111111111";
    const sig = "sig_replay_test";

    const first = creditDeposit(state, pubkey, 5_000_000, sig, 1);
    assert(first.ok, "first deposit should succeed");
    assertEq(state.wallets[pubkey].available, 5_000_000, "balance after first");

    const second = creditDeposit(state, pubkey, 5_000_000, sig, 1);
    assert(!second.ok, "replay must fail");
    assertEq(state.wallets[pubkey].available, 5_000_000, "balance unchanged after replay");
  });

  await test("deposit signature credited to wallet A cannot credit wallet B", () => {
    const state = freshState();
    const sig = "sig_wallet_a_only";
    creditDeposit(state, "WalletA1111111111111111111111111111111", 3_000_000, sig, 1);

    const replay = creditDeposit(
      state,
      "WalletB2222222222222222222222222222222",
      3_000_000,
      sig,
      1,
    );
    assert(!replay.ok, "same sig for different wallet must fail");
    assert(!state.wallets["WalletB2222222222222222222222222222222"], "B has no wallet row");
  });

  await test("demo pubkey cannot receive deposit", () => {
    const state = freshState();
    const demo = demoPlayerId("Alice");
    const result = creditDeposit(state, demo, 1_000_000, "sig_demo", 1);
    assert(!result.ok, "demo deposit rejected");
    assert(!state.wallets[demo], "demo not in wallets table");
  });

  const OB_STAKE = 1_000_000;
  const OB_CASES: Array<{ n: number; payouts: number[] }> = [
    { n: 2, payouts: [1.94, 0] },
    { n: 3, payouts: [1.746, 0.873, 0.291] },
    { n: 4, payouts: [1.94, 1.164, 0.776, 0] },
    { n: 5, payouts: [2.425, 1.455, 0.97, 0, 0] },
  ];

  for (const { n, payouts } of OB_CASES) {
    await test(`Opening Bell n=${n} matches RULES dollars`, () => {
      const results = Array.from({ length: n }, (_, i) =>
        mkResult(`w${i}`, (n - i) * 100, "AAPLX"),
      );
      const s = computeSettlement(results, OB_STAKE);
      assertEq(s.n, n, "n");
      for (let i = 0; i < n; i++) {
        const pay = microToUsdc(s.walletPayoutsMicro[`w${i}`] ?? 0);
        assertEq(pay, payouts[i], `place ${i + 1}`);
      }
    });
  }

  await test("three wallets same TSLAx score split full prize pool", () => {
    const wallets = ["w0", "w1", "w2"];
    const results = wallets.map((w) => mkResult(w, 500));
    const s = computeSettlement(results, OB_STAKE);
    const prize = microToUsdc(s.prizePoolMicro);
    const each = microToUsdc(s.walletPayoutsMicro.w0);
    assertEq(s.n, 3, "n");
    assertEq(each * 3, prize, "equal three-way tie consumes prize pool");
    assertEq(each, microToUsdc(s.walletPayoutsMicro.w1), "w1 same as w0");
    assertEq(each, microToUsdc(s.walletPayoutsMicro.w2), "w2 same as w0");
  });

  await test("share card uses TIE when top scores match", async () => {
    const { buildShareCard } = await import("../lib/share");
    const { demoPlayerId } = await import("../lib/player-id");
    const a = demoPlayerId("ciojo");
    const b = demoPlayerId("kinf");
    const ranked = [
      { wallet: a, stock: "TSLAX" as const, rank: 1, scoreBps: 0, previewUsdc: 0, joinedAt: 0, ready: true, startPrice: 1, endPrice: 1, feedName: "", startPublishTime: 0, endPublishTime: 0 },
      { wallet: b, stock: "NVDAX" as const, rank: 1, scoreBps: 0, previewUsdc: 0, joinedAt: 0, ready: true, startPrice: 1, endPrice: 1, feedName: "", startPublishTime: 0, endPublishTime: 0 },
    ];
    const text = buildShareCard(ranked, { [a]: "ciojo", [b]: "kinf" });
    assert(text.includes("TIE"), "tie wording");
    assert(text.includes("ciojo") && text.includes("kinf"), "both names");
    assert(!text.includes("wins StonkPit"), "no false winner");
  });

  await test("market tier picks PYTH then JUPITER then PYTH_STALE", async () => {
    const { pickMarketTier } = await import("../lib/market-price");
    const now = 1_700_000_000;
    assert(pickMarketTier({ publishTime: now - 30 }, true, { publishTime: now - 9e5 }, now) === "PYTH", "fresh hermes");
    assert(pickMarketTier({ publishTime: now - 500 }, true, { publishTime: now - 9e5 }, now) === "JUPITER", "stale hermes -> jup");
    assert(pickMarketTier(null, false, { publishTime: now - 9e5 }, now) === "PYTH_STALE", "onchain last");
  });

  await test("jupiter implied price from quote amounts", async () => {
    const { priceFromJupiterAmounts } = await import("../lib/jupiter-quote");
    const p = priceFromJupiterAmounts("1000000", "3643140");
    assert(Math.abs(p - 364.314) < 0.01, "price per token");
  });

  await test("feed status uses publish age not wall clock guess", async () => {
    const { classifyFeedFreshness, formatFeedStatusLine } = await import("../lib/pyth-feed-status");
    const now = Math.floor(Date.now() / 1000);
    assert(classifyFeedFreshness(now - 30, now) === "live", "live");
    assert(classifyFeedFreshness(now - 600, now) === "quiet", "quiet");
    assert(classifyFeedFreshness(now - 200_000, now) === "stale", "stale");
    const line = formatFeedStatusLine(now - 200_000, now);
    assert(line.startsWith("FEED STALE"), "stale label");
    assert(line.includes("ago"), "relative age only");
    assert(!/\d{4}-\d{2}-\d{2}/.test(line), "no calendar ISO in UI");
  });

  await test("1m tape buckets OHLC from Pyth samples", async () => {
    const { addSample, lastCandles, minuteEpochMs } = await import("../lib/candles");
    const m0 = minuteEpochMs(1_700_000_000_000);
    let c = addSample([], { ts: m0 + 1000, price: 100, publishTime: 1 });
    c = addSample(c, { ts: m0 + 5000, price: 101, publishTime: 2 });
    c = addSample(c, { ts: m0 + 10_000, price: 99.5, publishTime: 3 });
    assertEq(c.length, 1, "one minute bucket");
    assertEq(c[0].open, 100, "open");
    assertEq(c[0].high, 101, "high");
    assertEq(c[0].low, 99.5, "low");
    assertEq(c[0].close, 99.5, "close");
    c = addSample(c, { ts: m0 + 61_000, price: 102, publishTime: 4 });
    assertEq(c.length, 2, "second minute");
    assertEq(lastCandles(c, 3).length, 2, "last 3 capped");
  });

  await test("demo-only fight still ranks fighters on FINAL", () => {
    const demoA = demoPlayerId("ciojo");
    const demoB = demoPlayerId("kinf");
    const results = [
      mkResult(demoA, 120, "TSLAX"),
      mkResult(demoB, 80, "NVDAX"),
    ];
    const s = computeSettlement(results, 25_000_000);
    assertEq(s.n, 0, "paying n");
    assertEq(s.ranked.length, 2, "both rows ranked");
    assertEq(s.prizePoolMicro, 0, "prize pool");
  });

  await test("spectate seat in Opening Bell does not change pot", () => {
    const walletResults = [mkResult("w0", 100), mkResult("w1", 50)];
    const withDemo = [
      ...walletResults,
      mkResult(demoPlayerId("Spectator"), 999, "NVDAX"),
    ];
    const walletsOnly = computeSettlement(walletResults, OB_STAKE);
    const mixed = computeSettlement(withDemo, OB_STAKE);
    assertEq(walletsOnly.n, 2, "wallet n");
    assertEq(mixed.n, 2, "demo excluded from n");
    assertEq(walletsOnly.potMicro, mixed.potMicro, "pot unchanged");
    assertEq(walletsOnly.prizePoolMicro, mixed.prizePoolMicro, "prize pool unchanged");
    assertEq(walletPlayerCount(withDemo), 2, "walletPlayerCount");
  });

  await test("two parallel joins cannot freeze more than available", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stonkpit-audit-"));
    const dbFile = path.join(tmpDir, "stonkpit.json");
    process.env.DATABASE_PATH = dbFile;

    const pubkey = "ParallelJoinWallet11111111111111111111";
    const stake = 5_000_000;

    await withDbAsync((state) => {
      state.wallets[pubkey] = {
        pubkey,
        available: 6_000_000,
        frozen: 0,
        username: "joiner",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return null;
    });

    const results = await Promise.all([
      withDbAsync((state) => {
        const a = freezeForJoin(state, pubkey, "1", stake, "After Hours");
        return a.ok ? "ok" : a.error;
      }),
      withDbAsync((state) => {
        const b = freezeForJoin(state, pubkey, "2", stake, "After Hours");
        return b.ok ? "ok" : b.error;
      }),
    ]);

    const okCount = results.filter((r) => r === "ok").length;
    assert(okCount === 1, `exactly one join should succeed, got: ${results.join(", ")}`);

    const bal = await withDbAsync((state) => state.wallets[pubkey]);
    assertEq(bal.available, 1_000_000, "available after parallel joins");
    assertEq(bal.frozen, 5_000_000, "frozen after parallel joins");
    assertEq(bal.available + bal.frozen, 6_000_000, "total conserved");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATABASE_PATH;
  });

  await test("handle is one-time and cannot be stolen", () => {
    const state = freshState();
    const a = "PubkeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const b = "PubkeyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    state.wallets[a] = {
      pubkey: a,
      available: 0,
      frozen: 0,
      username: null,
      createdAt: 1,
      updatedAt: 1,
    };
    state.wallets[b] = {
      pubkey: b,
      available: 0,
      frozen: 0,
      username: null,
      createdAt: 1,
      updatedAt: 1,
    };

    const setA = setUsernameOnWallet(state.wallets, a, "alice");
    assert(setA.ok, "alice set");

    const steal = setUsernameOnWallet(state.wallets, b, "alice");
    assert(!steal.ok, "cannot steal alice");

    const rename = setUsernameOnWallet(state.wallets, a, "alice2");
    assert(!rename.ok, "handle one-time");
  });

  await test("room reset refunds frozen stake before settlement", () => {
    const state = freshState();
    const pubkey = "ResetWallet111111111111111111111111111";
    state.wallets[pubkey] = {
      pubkey,
      available: 0,
      frozen: 1_000_000,
      username: "resetter",
      createdAt: 1,
      updatedAt: 1,
    };
    refundFrozenStakes(state, "1", [pubkey], 1_000_000);
    assertEq(state.wallets[pubkey].available, 1_000_000, "refunded to available");
    assertEq(state.wallets[pubkey].frozen, 0, "frozen cleared");
  });

  await test("result toast copy for winner, loser, and spectators", () => {
    const winner = "Winner1111111111111111111111111111111";
    const loser = "Loser11111111111111111111111111111111";
    const mk = (wallet: string, scoreBps: number, rank: number): ResultRow => ({
      wallet,
      stock: "TSLAX",
      startPrice: 100,
      endPrice: 101,
      scoreBps,
      feedName: "",
      startPublishTime: 0,
      endPublishTime: 0,
      rank,
      previewUsdc: 4.5,
      creditDelta: 0,
      payoutCredits: 4.5,
    });
    const ranked = [mk(winner, 120, 1), mk(loser, -40, 2)];
    const names = { [winner]: "alice" };

    const win = buildResultToastContent({
      playerId: winner,
      ranked,
      displayNames: names,
      payingCount: 2,
      stakeMicro: 1_000_000,
      seatedWallets: [winner, loser],
    });
    assert(win?.title === "You won", "winner title");
    assert(win?.body.includes("TSLA") && win?.body.includes("pot"), "winner pot body");

    const lose = buildResultToastContent({
      playerId: loser,
      ranked,
      displayNames: names,
      payingCount: 2,
      stakeMicro: 1_000_000,
      seatedWallets: [winner, loser],
    });
    assert(lose?.title === "You lost", "loser title");
    assert(lose?.body.includes("winner alice"), "loser cites winner handle");

    const demo = demoPlayerId("spectator-demo");
    const noSeat = buildResultToastContent({
      playerId: demo,
      ranked,
      displayNames: names,
      payingCount: 0,
      stakeMicro: 1_000_000,
      seatedWallets: [winner, loser],
    });
    assert(noSeat === null, "spectator without seat gets no toast");

    const demoWin = demoPlayerId("fighter");
    const demoRanked = [mk(demoWin, 50, 1)];
    const demoToast = buildResultToastContent({
      playerId: demoWin,
      ranked: demoRanked,
      displayNames: {},
      payingCount: 0,
      stakeMicro: 1_000_000,
      seatedWallets: [demoWin],
    });
    assert(demoToast?.title === "You won", "demo winner");
    assert(!demoToast?.body.includes("pot"), "demo $0 omits pot");
  });

  await test("withdraw request rejects overdraw", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stonkpit-withdraw-"));
    process.env.DATABASE_PATH = path.join(tmpDir, "stonkpit.json");

    const pubkey = "WithdrawWallet111111111111111111111111";
    await withDbAsync((state) => {
      state.wallets[pubkey] = {
        pubkey,
        available: 2_000_000,
        frozen: 0,
        username: "wd",
        createdAt: 1,
        updatedAt: 1,
      };
      return null;
    });

    const ok = await withDbAsync((state) => requestWithdrawMicro(state, pubkey, 1_000_000));
    assert(ok.ok, "first withdraw ok");

    const over = await withDbAsync((state) => requestWithdrawMicro(state, pubkey, 2_000_000));
    assert(!over.ok, "overdraw rejected");

    const bal = await withDbAsync((state) => state.wallets[pubkey]);
    assertEq(bal.available, 1_000_000, "only first withdrawal deducted");

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
