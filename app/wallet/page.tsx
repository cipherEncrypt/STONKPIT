"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { useCredits } from "@/components/useCredits";
import { buildUsdcDepositTransaction } from "@/lib/build-deposit-tx";
import { USDC_MINT } from "@/lib/constants";
import { shortPubkey } from "@/lib/format-short";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

function solscanTx(sig: string) {
  return `https://solscan.io/tx/${sig}`;
}

function WalletContent() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const pubkey = connected && publicKey ? publicKey.toBase58() : null;
  const { balance, deposits, treasury, error, confirmDeposit, withdraw } = useCredits(pubkey);

  const [depositAmt, setDepositAmt] = useState("1.00");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleDeposit() {
    if (!publicKey || !treasury) return;
    const amount = parseFloat(depositAmt);
    if (!Number.isFinite(amount) || amount < 1) {
      setErr("Minimum deposit is 1.00 USDC.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const treasuryPk = new PublicKey(treasury);
      const tx = await buildUsdcDepositTransaction(connection, publicKey, treasuryPk, amount);
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");
      const r = await confirmDeposit(signature);
      setMsg(`Deposited ${r.credited.toFixed(2)} USDC. Credits updated.`);
      setDepositAmt("1.00");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmt);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await withdraw(amt);
      setMsg("Withdrawal queued. Treasury sends USDC on-chain.");
      setWithdrawAmt("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  if (!connected || !pubkey) {
    return (
      <div className="border border-pit-border bg-pit-card p-5 sm:p-6">
        <h1 className="display-type text-4xl">Wallet</h1>
        <p className="mt-2 font-mono text-sm text-pit-muted">
          Connect Phantom or Solflare on mainnet to deposit USDC and play for real credits.
        </p>
        <p className="mt-2 font-mono text-sm text-pit-muted">
          Demo names can test pits without money — they never hold USDC here.
        </p>
        <div className="mt-4">
          <WalletMultiButton className="wallet-btn !rounded-none !border !border-white/40 !bg-transparent !font-mono !text-sm !text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-pit-border pb-5">
        <Link href="/" className="font-mono text-sm text-pit-muted">
          ← Lobby
        </Link>
        <h1 className="display-type mt-2 text-4xl sm:text-5xl">Wallet</h1>
        <p className="mt-2 break-all font-mono text-sm text-pit-green sm:hidden">{shortPubkey(pubkey)}</p>
        <p className="mt-2 hidden break-all font-mono text-sm text-pit-green sm:block">{pubkey}</p>
        <p className="mt-1 font-mono text-sm text-pit-muted">
          Custodial credits · 1:1 USDC · mainnet-beta
        </p>
      </div>

      <section className="grid grid-cols-1 gap-px border border-pit-border bg-pit-border sm:grid-cols-3">
        <div className="bg-pit-bg p-4">
          <p className="terminal-label">Available</p>
          <p className="display-type mt-2 text-3xl text-pit-green sm:text-4xl">
            {balance?.available.toFixed(2) ?? "—"}
          </p>
        </div>
        <div className="bg-pit-bg p-4">
          <p className="terminal-label">Frozen</p>
          <p className="display-type mt-2 text-3xl text-white sm:text-4xl">
            {balance?.frozen.toFixed(2) ?? "—"}
          </p>
        </div>
        <div className="bg-pit-bg p-4">
          <p className="terminal-label">Total</p>
          <p className="display-type mt-2 text-3xl text-pit-muted sm:text-4xl">
            {balance?.total.toFixed(2) ?? "—"}
          </p>
        </div>
      </section>

      <section className="border border-pit-border bg-pit-card p-5">
        <p className="terminal-label">Deposit USDC</p>
        <p className="mt-2 font-mono text-sm text-pit-muted">
          Signs a real SPL transfer to treasury. Server verifies on-chain before crediting.
        </p>
        {treasury ? (
          <p className="mt-2 break-all font-mono text-sm text-pit-muted">
            Treasury: <span className="text-pit-green">{treasury}</span>
          </p>
        ) : (
          <p className="mt-2 font-mono text-sm text-pit-red">
            Set TREASURY_USDC_ADDRESS in .env
          </p>
        )}
        <p className="font-mono text-sm text-pit-muted">Mint: {USDC_MINT}</p>
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="number"
            min="1"
            step="0.01"
            value={depositAmt}
            onChange={(e) => setDepositAmt(e.target.value)}
            className="input-field"
            inputMode="decimal"
            aria-label="Deposit amount"
          />
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !treasury}
            onClick={handleDeposit}
          >
            {busy ? "SIGNING…" : "DEPOSIT VIA WALLET"}
          </button>
        </div>
      </section>

      <section className="border border-pit-border bg-pit-card p-5">
        <p className="terminal-label">Withdraw</p>
        <p className="mt-2 font-mono text-sm text-pit-muted">
          Request USDC back to this wallet. Pending until treasury sends on-chain.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="number"
            min="0"
            step="0.01"
            value={withdrawAmt}
            onChange={(e) => setWithdrawAmt(e.target.value)}
            placeholder="Amount"
            className="input-field"
            inputMode="decimal"
            aria-label="Withdraw amount"
          />
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={busy}
            onClick={handleWithdraw}
          >
            {busy ? "…" : "REQUEST WITHDRAW"}
          </button>
        </div>
      </section>

      {deposits.length > 0 && (
        <section className="border border-pit-border bg-pit-card p-5">
          <p className="terminal-label">Recent deposits</p>
          <ul className="mt-3 space-y-2 font-mono text-sm">
            {deposits.map((d) => (
              <li key={d.signature} className="flex flex-wrap justify-between gap-2 border-b border-pit-border/30 pb-2">
                <span className="text-pit-green">{d.amount.toFixed(2)} USDC</span>
                <a
                  href={solscanTx(d.signature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-pit-muted"
                >
                  {d.signature.slice(0, 8)}…{d.signature.slice(-8)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(error || err) && <p className="font-mono text-sm text-pit-red">{error || err}</p>}
      {msg && <p className="font-mono text-sm text-pit-green">{msg}</p>}
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<p className="text-pit-muted">Loading wallet…</p>}>
      <WalletContent />
    </Suspense>
  );
}
