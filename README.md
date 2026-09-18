# StonkPit Live

**Pick a stock. Best Pyth % move wins.** Multi-room custodial pit on Solana mainnet.

Rules → [`docs/RULES.md`](docs/RULES.md)

---

## Local run

```bash
npm install
cp .env.example .env   # edit with your RPC + treasury pubkey (never commit .env)
ROOM_DURATION=60 npm run dev
```

Open **http://localhost:3000/?room=1**

---

## Multi-room quick pit

| Feature | Detail |
|---------|--------|
| Room 1 | **5 seats** (not 32) — feels full fast |
| More rooms | Lobby **+ ROOM (5)** or **+ ROOM (8)** |
| Ready protocol | Join → pick ticker → **READY** on lobby |
| Start rule | All seated ready (n≥2) **or** room full |
| Sync | **1s polling** — all tabs see joins, READY, countdown |
| Clock | Server `endTs` — same remaining seconds everywhere |

---

## Three-tab demo (Alice / Bob / Cara)

All on `/?room=1`:

1. Each tab: demo name → **Join pit** → pick ticker  
2. Lobby → **READY** (each player)  
3. When all 3 ready → **LIVE** on every tab  
4. `/pit?room=1` — same countdown + rows  
5. `/result?room=1` — credit deltas  

6th player cannot join Room 1 → **Open new room** → `?room=2`

---

## Routes

| URL | Screen |
|-----|--------|
| `/?room=1` | Lobby — room list + fight card + READY |
| `/pick?room=1` | Pick ticker |
| `/pit?room=1` | LIVE rows + server clock |
| `/result?room=1` | Ranked table + credit Δ |
| `/wallet` | Credits, deposit, withdraw |

---

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /api/rooms` | Lobby list (poll 1s) |
| `GET /api/room?room=` | Room state + `serverNow` + `remainingMs` |
| `POST` join / ready / create | Seat, ready, new room |

---

## Env

| Variable | Purpose |
|----------|---------|
| `ROOM_DURATION` | Round seconds (`60` demo) |
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
