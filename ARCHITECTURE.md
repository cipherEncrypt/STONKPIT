# StonkPit — System Architecture

**One line:** N players stake fixed USDC into a room, each picks one allowlisted
xStock, best % move over the window takes the pot minus 3% fee. Chain is the
only source of truth. The frontend never decides a winner.

**Status:** BLOCKED on the AAPLx transfer probe (Step 0 below). No Anchor
program code should be written until the probe results are filled into the
"Token Facts" table.

---

## 0. Sequencing gate — do not skip this

This is the actual build order. Each step is blocked until the one above it
is done.

| Step | What | Blocked by |
|---|---|---|
| 0 | Run `scripts/probe-aaplx.ts`, fill in Token Facts table below | Nothing — do this now |
| 1 | Write `Config` / `Room` / `Seat` accounts using `InterfaceAccount<TokenAccount>` + `TokenInterface` | Step 0 |
| 2 | Write `join_room` only (pull USDC, open seat, reject unknown mint) | Step 1 |
| 3 | Write `lock_room` (Pyth start-price snapshot) | Step 2, tested on devnet |
| 4 | Write `settle_room` + `claim` + `refund_room` | Step 3 |
| 5 | Worker (auto-lock, auto-settle) | Step 4 working on devnet |
| 6 | Frontend screens | Step 5 |
| 7 | Mainnet real-USDC room | Step 6 |
| 8 | Bounty polish (Pyth visible engine, Jupiter swap-to-stock, Meteora) | Step 7 boringly reliable |

Do not write instructions or fee math for seats *ahead* of where the seat's
stock mint's actual token-program behavior is known. The vault only ever
holds **USDC** (a known, plain SPL Token mint) — seats reference the stock
mint only for scoring (price in/price out), never for a transfer into the
vault in Phase 0. That single design choice is why the probe blocks accounts
but does not block the whole project: **StonkPit vaults USDC, not xStocks, in
Phase 0.** Confirm this stays true — see "Design decision" below.

---

## Design decision: vault only ever holds USDC in Phase 0

Re-reading the product rules: players **stake USDC**, pick a stock as a
*reference asset for scoring*, and the pot is paid out **in USDC**
("Settlement asset: USDC. Winner can later swap into the winning stock, but
not in Phase 0"). That means:

- `join_room` transfers USDC into the vault. USDC is a standard SPL Token
  (Tokenkeg program), no extensions, no fee math, no surprises.
- The xStock mint address is stored on the `Seat` only as a price key (which
  Pyth/DEX feed to read), never transferred into a program-owned account.
- The AAPLx transfer probe therefore does **not block `join_room`**. It
  blocks anything in Phase 2+ where the winner swaps the payout into the
  actual xStock and that token has to move through a program-owned account
  (e.g., if you ever escrow the swapped stock, or accept xStocks as stake
  directly in a later phase).

**Run the probe anyway, today, for two reasons:**
1. You may decide later to let players stake in the stock itself, not just
   USDC — cheap to know the constraints now.
2. The Jupiter swap-to-stock feature in Phase 2 needs to know if the
   destination mint is Token-2022 with a freeze authority — if AAPLx can
   freeze a recipient's ATA, that swap can fail in ways your UI needs to
   handle.

So: probe today, but it downgrades from "blocks Step 1" to "blocks Phase 2
Jupiter-swap feature." Tell me the probe results either way — they still
change what `Config.allowed_mints` validation needs to check.

---

## 1. Token Facts (fill in after running the probe)

| Mint | Token Program | Decimals | Freeze Authority | Transfer Fee | Transfer Hook | Permanent Delegate | Notes |
|---|---|---|---|---|---|---|---|
| AAPLx `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | ? | ? | ? | ? | ? | ? | |
| TSLAx `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | ? | ? | ? | ? | ? | ? | |
| NVDAx `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | ? | ? | ? | ? | ? | ? | |
| USDC (official Circle Solana) | Tokenkeg (assumed) | 6 (assumed) | none (assumed) | none | none | none | Confirm mint address you're using |

Paste the probe's console output here once you run it.

---

## 2. System diagram

```
Wallet (Phantom / Solflare)
        |
        v
Next.js app  ---- REST/WS ----  Indexer / worker
        |                              |
        | RPC + txs                    | reads chain + Pyth
        v                              v
Anchor program "stonkpit"
  - Config
  - Room
  - Seat
  - Vault USDC ATA (Tokenkeg — plain SPL)
  - Treasury ATA
        |
        +-- Pyth price accounts (start + settle) — read-only, keyed by seat's stock_mint
        +-- optional DEX TWAP fallback in worker (Phase 2+)
```

The website is a remote control. It reads chain state and submits
transactions; it never computes a winner or a price it then trusts blindly.

---

## 3. On-chain accounts

### Config
```rust
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,            // 300 = 3%
    pub min_players: u8,         // 2
    pub max_players: u8,         // 8
    pub allowed_mints: Vec<Pubkey>, // AAPLx, TSLAx, NVDAx to start
    pub usdc_mint: Pubkey,
    pub paused: bool,
    pub bump: u8,
}
```
PDA seed: `["config"]`

### Room
```rust
pub enum RoomStatus { Open, Locked, Settled, Refunded }

pub struct Room {
    pub room_id: u64,
    pub status: RoomStatus,
    pub stake_amount: u64,       // fixed, e.g. 10_000_000 (10 USDC, 6 decimals)
    pub duration_secs: i64,
    pub start_ts: i64,
    pub lock_ts: i64,
    pub end_ts: i64,
    pub player_count: u8,
    pub pot: u64,
    pub winning_seat: Option<Pubkey>,
    pub is_split: bool,
    pub start_prices: Vec<i64>,  // snapshot at lock, indexed same order as seats joined
    pub bump: u8,
}
```
PDA seed: `["room", room_id.to_le_bytes()]`

### Seat
```rust
pub struct Seat {
    pub room: Pubkey,
    pub player: Pubkey,
    pub stock_mint: Pubkey,      // reference only — never transferred into vault
    pub deposited: u64,
    pub start_price: i64,
    pub end_price: i64,
    pub score_bps: i64,
    pub claimed: bool,
    pub bump: u8,
}
```
PDA seed: `["seat", room, player]`

### Vault
Just a USDC ATA owned by the Room PDA (or a `["vault", room]` PDA that owns
the ATA). Standard SPL Token — no `TokenInterface` gymnastics needed here
*unless* you later let a Seat's stake be denominated in the stock itself.

---

## 4. Instructions

| Instruction | Phase | Notes |
|---|---|---|
| `init_config` | 0 | admin, treasury, fee_bps, allowed_mints |
| `create_room` | 0 | stake, duration, allowed_set |
| `join_room(stock_mint)` | 0 | USDC in, seat opened, reject unknown mint — **build this first, right after Config/Room/Seat** |
| `lock_room` | 0 | needs >= min_players, snapshots Pyth start prices, sets end_ts |
| `settle_room` | 0 | **permissionless** — anyone can call after end_ts |
| `claim` | 0 | winner withdraws pot minus fee |
| `refund_room` | 0 | under min players at lock, or all prices stale |
| `post_price` | 2 | tightly-scoped oracle authority, DEX TWAP fallback for off-hours |
| `pause` | 0 | admin only |

`settle_room` and `refund_room` must never require `admin` as a signer.
That's the one instruction-level rule I'll flag on every review pass.

---

## 5. Price design

- **Primary:** Pyth feed for the underlying equity or xStock crypto feed
  (`Equity.US.AAPL/USD` or `Crypto.AAPLX/USD` if it exists). Require at
  lock and settle: status is trading (or documented last-good-print
  policy), publish time within max age, confidence within bound.
- **Phase 0 shortcut:** only open rooms while the equity Pyth feed is
  fresh. Do not attempt 24/7 pricing yet — that's Phase 2/3 with the
  worker-computed DEX TWAP written on-chain via `post_price`.
- **Never:** let the frontend read a price and pass it into an instruction
  as if trusted. Every price the program acts on either comes from a Pyth
  account read on-chain, or from `post_price` under a scoped oracle
  authority — not from a user-supplied instruction argument.

---

## 6. Off-chain

- **App:** Next.js 15, Tailwind, `@solana/wallet-adapter`, Anchor client.
- **Worker:** Node or Rust. Watches rooms, calls `lock_room` when full or
  at start time, calls `settle_room` at `end_ts`, caches prices for UI
  display only (never for settlement).
- **Data:** Postgres/SQLite for lobby lists — chain remains source of
  truth for anything that pays out.
- **RPC:** Helius or Triton for settlement-critical calls. No public RPC
  for anything that submits a settling transaction.

---

## 7. Frontend screens

Lobby (open rooms, pot, countdown) → Join (pick stock, deposit) → Live pit
(start price, live price, % move, time left) → Result (winner, payout tx,
claim button).

---

## 8. Repo layout

```
stonkpit/
  programs/stonkpit/
  app/
  worker/
  sdk/
  scripts/probe-aaplx.ts
  docs/RULES.md   <- 1 page, judges will read this
```

---

## 9. Risk register (things that kill this project)

1. Frontend picks the winner — architecturally forbidden, checked on every review.
2. Last-trade DEX price used instead of TWAP.
3. `settle_room`/`refund_room` gated to admin-only.
4. Building 12 stocks before 1 payout works end to end.
5. Assuming AAPLx is plain SPL when it may be Token-2022 with freeze/hook/fee — **this is what the probe resolves.**
6. Equity Pyth going stale after market close — Phase 0 rooms must only run while the feed is live.

---

## 10. Day-by-day

- **Thu Sept 17 (today):** run the probe, fill in Token Facts, write Config/Room/Seat, write `join_room`, test vault transfer.
- **Fri Sept 18:** `lock_room`/`settle_room`/`claim`, first video (Wallet A vs Wallet B, USDC lands in winner).
- **Sat Sept 19:** worker + lobby.
- **Sun Sept 20:** mainnet + real USDC room.
- **Mon–Tue:** Pyth polish, result pages, failure paths (stale price, solo player, paused).
- **Wed Sept 23:** bounty extras only if core is boringly reliable.
- **Thu Sept 24:** video, README, submission form.
- **Fri Sept 25 morning:** freeze code. Submission cutoff 4pm ET.
