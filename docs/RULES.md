# StonkPit Live — Rules

## One line

Timed pit on **Solana mainnet**. Pick **AAPLx / TSLAx / NVDAx**, scored by **live Pyth % move**. **Custodial credits** — USDC in treasury, balances in DB.

## Landing flow

1. **Connect wallet** (main path — no demo name on home)
2. **Choose handle** if this pubkey has no username yet (3–16 chars, `[a-zA-Z0-9_]`, unique, stored on wallet row)
3. See **named rooms** + credits
4. Enter a room → **pick stock** → **READY**

**Spectate:** small link *spectate without money* → `/spectate` — demo seats only (no freeze, deposit, or payout).

Fighter lists show **handles**, not raw pubkeys.

## Multi-room lobby

| Item | Detail |
|------|--------|
| Lobby | Named room cards: name, `03 / 05`, OPEN / LIVE / FINAL |
| Seed rooms | Opening Bell (5), After Hours (5), Green Tape (5), Red Pit (5), Tesla Cage (8) |
| **+ ROOM** | Next unused name from seed list (then Green Tape 2, …); pick max **5** or **8** |
| Share link | `?room=<id>` (numeric id in URL; UI shows name) |
| Full / LIVE | **+ ROOM** or **Open new room** |

## Seats & ready

1. **Join + pick ticker** → seated, `ready: false`, **1.00 credit frozen** (wallet only)
2. Same ticker allowed on multiple seats
3. Click **READY** on lobby when seated
4. Pit goes **LIVE** when:
   - **All seated** fighters are ready **and** n ≥ 2, **or**
   - n === **maxPlayers** (room full auto-start)
5. Cannot join LIVE/FINAL or when seated ≥ max
6. Wallet join requires a **handle** set

## Realtime sync

- Lobby, pit, result poll **`GET /api/room?room=`** every **1s**
- Home polls **`GET /api/rooms`** every **1s**
- Countdown from server **`endTs`** (ms) — not a per-tab local timer
- API returns **`serverNow`** + **`remainingMs`** + **`displayNames`** each poll

## Scoring

```
score_bps = ((end − start) / start) × 10 000
```

Pyth **Crypto.*X/USD** at lock and timer end.

## Payout (credits)

```
pot = n × 1.00 · prize pool = pot × 0.97 · 3% fee → treasury
```

| n | Split |
|---|-------|
| 2 | 100% |
| 3 | 60 / 30 / 10 |
| 4–5 | 50 / 30 / 20 |
| 6–10 | 40 / 25 / 15 / 10 / 10 |
| 11+ | 40 / 25 / 15 / 20% split places 4–8 |

Ties split that place. **Credit Δ** = payout − 1.00 seat.

## Demo spectate (3 tabs, room 1)

```bash
ROOM_DURATION=60 npm run dev
```

Open `/spectate`, set demo names, then join room **Opening Bell** (`?room=1`).

| Tab | Name | Ticker | Action |
|-----|------|--------|--------|
| 1 | Alice | AAPLx | join → READY |
| 2 | Bob | TSLAx | join → READY |
| 3 | Cara | NVDAx | join → READY → all ready → LIVE |

All tabs show same fighters, READY marks, and countdown within ~1s.

6th player: Opening Bell full → **+ Room (5)** → e.g. `?room=6` with auto name.

## Money (wallet only)

- **Only connected Solana wallets** hold USDC credits (`wallets` table keyed by pubkey)
- Amounts stored as **micro-USDC** integers (1.00 = 1_000_000)
- **Deposit:** client signs SPL `transfer_checked` → `POST /api/wallet/deposit` → server verifies on mainnet RPC
- **Demo spectate:** may join pits for testing — **no freeze, no deposit, no payout**
- **Join (wallet):** freeze 1.00 USDC credit; reject if available < 1.00
- **Withdraw:** `POST /api/wallet/withdraw` → admin `npm run payout`
- Footer: *Funds are custodial in the treasury wallet. Not a program escrow.*
