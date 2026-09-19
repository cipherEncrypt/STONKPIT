# StonkPit Live — Rules

## One line

Timed pit on **Solana mainnet**. Pick **AAPLx / TSLAx / NVDAx**, scored by **live Pyth % move**. **Custodial credits** — USDC in treasury, balances in DB.

## Landing flow

1. **Connect wallet** (main path — no demo name on home)
2. **Choose handle** if this pubkey has no username yet (3–16 chars, `[a-zA-Z0-9_]`, unique, stored on wallet row)
3. See **five named pits** + credits
4. Enter a pit → **pick stock** → **READY**

**Spectate:** small link *spectate without money* → `/spectate` — demo seats only (no freeze, deposit, or payout).

Fighter lists show **handles**, not raw pubkeys.

## Five pits (fixed ladder)

Users **cannot create rooms**. Exactly five pits exist:

| Pit | Seats | Stake |
|-----|-------|-------|
| Opening Bell | 5 | $1 |
| After Hours | 5 | $5 |
| Green Tape | 8 | $10 |
| Red Pit | 15 | $25 |
| Tesla Cage | 20 | $50 |

Lobby cards show **name**, **$stake**, `03 / 05`, OPEN / LIVE / FINAL. Share link: `?room=<id>` (1–5).

## Seats & ready

1. **Join + pick ticker** → seated, `ready: false`, **that pit’s stake frozen** (wallet only)
2. Same ticker allowed on multiple seats
3. Click **READY** on lobby when seated
4. Pit goes **LIVE** when:
   - **All seated** fighters are ready **and** n ≥ 2, **or**
   - n === **maxPlayers** (room full auto-start)
5. Cannot join LIVE/FINAL or when seated ≥ max
6. Wallet join requires a **handle** set
7. Reject join if `available < stakeMicro` (e.g. *Need $25 for Red Pit.*)

## Realtime sync

- Lobby, pit, result poll **`GET /api/room?room=`** every **1s**
- Home polls **`GET /api/rooms`** every **1s**
- Countdown from server **`endTs`** (ms) — not a per-tab local timer
- API returns **`serverNow`** + **`remainingMs`** + **`displayNames`** + **`stakeMicro`** each poll

## Scoring

```
score_bps = ((end − start) / start) × 10 000
```

Pyth **Crypto.*X/USD** at lock and timer end.

## Payout (credits)

**n** = wallet players seated in that fight (demo/spectate excluded). Empty seats add **$0**. A pit can go LIVE before full when all seated click READY.

```
pot = n × stakeMicro
prize pool = floor(pot × 97 / 100)   // integer micro-USDC
```

Split percents use **n**, not maxPlayers. Unpaid place pots, integer dust, and the 3% fee → treasury.

| n | Split |
|---|-------|
| 2 | 100% |
| 3 | 60 / 30 / 10 |
| 4–5 | 50 / 30 / 20 (4th/5th $0) |
| 6–10 | 40 / 25 / 15 / 10 / 10 |
| 11+ | 40 / 25 / 15 / 20% split equally places 4–8 |

**Ties** combine place pots (e.g. two-way tie for 1st splits 1st+2nd %). **Credit Δ** = payout − seat stake (that pit’s stakeMicro).

## Demo spectate (3 tabs, Opening Bell)

```bash
ROOM_DURATION=180 NEXT_PUBLIC_ROOM_DURATION=180 npm run dev
```

Open `/spectate`, set demo names, then join **Opening Bell** (`?room=1`).

| Tab | Name | Ticker | Action |
|-----|------|--------|--------|
| 1 | Alice | AAPLx | join → READY |
| 2 | Bob | TSLAx | join → READY |
| 3 | Cara | NVDAx | join → READY → all ready → LIVE |

6th player: Opening Bell full → try **After Hours** (`?room=2`) or another pit.

## Money (wallet only)

- **Only connected Solana wallets** hold USDC credits (`wallets` table keyed by pubkey)
- Amounts stored as **micro-USDC** integers (1.00 = 1_000_000)
- **Deposit:** client signs SPL `transfer_checked` → `POST /api/wallet/deposit` → server verifies on mainnet RPC
- **Demo spectate:** may join pits for testing — **no freeze, no deposit, no payout**
- **Join (wallet):** freeze pit stake; reject if available < stake
- **Withdraw:** `POST /api/wallet/withdraw` → admin `npm run payout`
- Footer: *USDC for pits and payouts is held in escrow until withdraw or pot settlement.*
