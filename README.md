# StonkPit Live

**Pick a stock. Best Pyth % move wins.** Five fixed-stake pits on Solana mainnet.

Rules → [`docs/RULES.md`](docs/RULES.md)

---

## Local run

```bash
npm install
cp .env.example .env   # edit with your RPC + treasury pubkey (never commit .env)
ROOM_DURATION=180 NEXT_PUBLIC_ROOM_DURATION=180 npm run dev
```

Open **http://localhost:3000** (home) or **http://localhost:3000/rooms?room=1** (lobby)

Check prices: `npm run price:ping` (Pyth age, Jupiter quote, chosen `PYTH` / `JUPITER` / `PYTH_STALE`). Legacy: `npm run pyth:ping`.

If `/` shows 404 or 500, stop all `next dev` processes and run `npm run dev:clean`.

---

## Five pits

| Pit | ID | Seats | Stake |
|-----|-----|-------|-------|
| Opening Bell | 1 | 5 | $1 |
| After Hours | 2 | 5 | $5 |
| Green Tape | 3 | 8 | $10 |
| Red Pit | 4 | 15 | $25 |
| Tesla Cage | 5 | 20 | $50 |

- **Ready protocol:** Join → pick ticker → **READY** on lobby
- **Start rule:** All seated ready (n≥2) **or** pit full
- **Sync:** 1s polling — all tabs see joins, READY, countdown
- **Prize pool:** n × stake × 97% (3% fee to treasury)

---

## Three-tab demo (Alice / Bob / Cara)

On `/rooms?room=1` (Opening Bell, $1):

1. Each tab: demo name → **Join pit** → pick ticker  
2. Lobby → **READY** (each player)  
3. When all 3 ready → **LIVE** (3 min fight) on every tab  
4. `/pit?room=1` — 3:00 countdown, live Pyth tape (2s samples, 1m display candles)  
5. `/result?room=1` — credit deltas at $1 stake  

6th player cannot join Opening Bell → try **After Hours** (`?room=2`)

---

## Routes

| URL | Screen |
|-----|--------|
| `/?room=1` | Lobby — pit cards + fight card + READY |
| `/pick?room=1` | Pick ticker |
| `/pit?room=1` | LIVE rows + server clock |
| `/result?room=1` | Ranked table + credit Δ |
| `/wallet` | Credits, deposit, withdraw |

---

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/rooms` | Lobby list (poll 1s) |
| `GET /api/room?room=` | Room state + `stakeMicro` + `serverNow` + `remainingMs` |
| `POST` join / ready / reset | Seat, ready, rematch |

---

## Env

| Variable | Purpose |
|----------|---------|
| `ROOM_DURATION` | Fight length in seconds (server `endTs`; default `180`) |
| `NEXT_PUBLIC_ROOM_DURATION` | Same value for client labels (keep in sync with `ROOM_DURATION`) |
| `PYTH_API_KEY` | Hermes bearer token — live Pyth prices (without it, on-chain fallback may be days old) |
| `PYTH_HERMES_URL` | Optional Hermes host override |
| `ALCHEMY_RPC_URL` | Solana mainnet RPC (server + wallet via `/api/config`) |
| `TREASURY_USDC_ADDRESS` | Treasury wallet for USDC deposits |
| `DATABASE_PATH` | Ledger file (default `data/stonkpit.json`) |

---

## Vercel

```bash
npm run build
```

Single instance or persistent volume for `data/stonkpit.json`. See README deploy notes in repo.

**Frozen:** `programs/stonkpit/` — do not deploy.
