# StonkPit

Stock fight on Solana. Connect a wallet. Enter a named room.
Pick AAPLx, TSLAx, or NVDAx. Best percent move in three minutes wins the pot.

## How a fight works

Join a room. Pick a ticker. Hit **READY**.

Two ready players or a full table starts the clock. Everyone shares the same server time.

Prices at lock and settle use one source for the whole fight. **Pyth** when the feed is live.
**Jupiter** xStock to USDC when Pyth is blocked or stale. Lock and settle always match.

When the timer hits zero the room goes **FINAL**. Rank by percent move. Credits move in the database.

## Rooms

| Room | Seats | Stake |
|------|-------|-------|
| Opening Bell | 5 | $1 |
| After Hours | 5 | $5 |
| Green Tape | 8 | $10 |
| Red Pit | 15 | $25 |
| Tesla Cage | 20 | $50 |

Lobby: **http://localhost:3000/rooms?room=1**

## Money

USDC sits in a treasury wallet. Balances are credits in the database. **3 percent** fee on each pot.
Withdraw goes back to the same wallet you connected. This is not a program escrow.

## Payout

**n** = paying wallets who actually sat (demo spectate seats do not count).
**Pot** = n × room stake. Prize pool is pot minus the 3 percent fee (integer math in micro USDC).

| n | Split |
|---|-------|
| 2 | winner takes all |
| 3 | 60 / 30 / 10 |
| 4-5 | 50 / 30 / 20 |

Ties split the place pots for that rank. Details: [`docs/RULES.md`](docs/RULES.md).

## Run it

**Local (JSON ledger, no Postgres)**

```bash
npm install
cp .env.example .env
# HELIUS_RPC_URL or ALCHEMY_RPC_URL, TREASURY_USDC_ADDRESS, PYTH_API_KEY
# leave DATABASE_URL unset → writes data/stonkpit.json
npm run dev
```

**Live (Vercel app + Render Postgres)**

1. Create a Postgres instance on Render. Copy the **pooler** `DATABASE_URL` (SSL required).
2. On Render or your laptop: `DATABASE_URL=... npm run db:migrate`
3. In Vercel project env (never commit these):
   - `DATABASE_URL` (server only, not `NEXT_PUBLIC_`)
   - `HELIUS_RPC_URL` or `ALCHEMY_RPC_URL`
   - `TREASURY_USDC_ADDRESS` and `NEXT_PUBLIC_TREASURY_USDC_ADDRESS` (public pubkey only)
   - `PYTH_API_KEY`
   - `NEXT_PUBLIC_SITE_URL` or `ALLOWED_ORIGIN` (your Vercel URL, API CORS)
4. Deploy. First boot imports `data/stonkpit.json` into Postgres if the DB is empty and that file exists on the build machine (usually skip; use migrate from a dev export instead).

Run `npm run payout` on a secure admin machine with `TREASURY_PRIVATE_KEY`. Not on Vercel.

Open **http://localhost:3000**. Never commit `.env` or paste secret values in issues or chat.

Quick check without the UI: `npm run price:ping`

## Scripts

| Command | What |
|---------|------|
| `npm run pyth:ping` | Hermes feed age and key sanity |
| `npm run price:ping` | Pyth vs Jupiter tier the server would pick |
| `npm run payout` | Send pending withdrawals (**admin**, needs `TREASURY_PRIVATE_KEY` on the machine only) |
| `npm test` | Credits, payouts, withdraw guards |
| `npm run db:migrate` | Create Postgres tables (needs `DATABASE_URL`) |

## Safety

No private keys in the repo. Treasury **public** address in `.env` only.
`TREASURY_PRIVATE_KEY` stays on the admin host for `npm run payout`, never in the app bundle.
No `NEXT_PUBLIC_DATABASE_URL`. No `NEXT_PUBLIC_` for private keys.
`NEXT_PUBLIC_TREASURY_USDC_ADDRESS` is the public deposit address only.

## Stocklana submit

Fill these before you send the form:

- **GitHub:** `https://github.com/cipherEncrypt/STONKPIT`
- **Demo video:** _paste your Loom or YouTube link here_
