"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { FaqAccordion } from "@/components/FaqAccordion";
import { HomeRoomsStrip } from "@/components/HomeRoomsStrip";
import { useCredits } from "@/components/useCredits";
import { useAppConfig } from "@/components/useAppConfig";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

const STEPS = [
  { n: "01", title: "Connect", body: "Phantom or Solflare on mainnet. Set a handle once." },
  { n: "02", title: "Pick a room", body: "Five pits from $1 to $50. Seat cost freezes until the fight ends." },
  { n: "03", title: "Pick a fighter", body: "AAPLx, TSLAx, or NVDAx — your % move is scored by Pyth." },
  { n: "04", title: "READY & win", body: "All seated click READY (or room fills). Best live % wins the pot." },
];

export default function HomePage() {
  const { connected, publicKey } = useWallet();
  const walletPubkey = connected && publicKey ? publicKey.toBase58() : null;
  const { username } = useCredits(walletPubkey);
  const appConfig = useAppConfig();
  const durationSecs = appConfig?.roomDurationSecs ?? 180;
  const durationLabel =
    durationSecs >= 60
      ? `${Math.round(durationSecs / 60)}-minute`
      : `${durationSecs}-second`;

  return (
    <div className="space-y-10 sm:space-y-14">
      {/* Hero */}
      <section className="border-b border-pit-border pb-8 sm:pb-10">
        <p className="terminal-label text-pit-green">SOLANA · PYTH · USDC POTS</p>
        <h1 className="display-type mt-3 text-[2.5rem] leading-[0.9] text-white sm:text-6xl md:text-7xl">
          PICK A STOCK.<br />
          <span className="text-pit-green">WIN THE POT.</span>
        </h1>
        <p className="mt-4 max-w-xl font-mono text-sm leading-relaxed text-pit-muted sm:text-base">
          Tokenized AAPL / TSLA / NVDA, live Pyth, {durationLabel} pits. Connect wallet and play.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/rooms" className="btn-primary w-full text-center sm:w-auto">
            Enter the pit
          </Link>
          {!connected && (
            <div className="flex w-full justify-center sm:w-auto">
              <WalletMultiButton
                className="wallet-btn !w-full !max-w-none !justify-center !rounded-none !border !border-white/40 !bg-transparent !px-6 !py-3 !font-mono !text-sm !text-white sm:!w-auto"
              />
            </div>
          )}
          {connected && !username && (
            <Link href="/rooms" className="btn-secondary w-full text-center sm:w-auto">
              Choose handle →
            </Link>
          )}
        </div>
        {!connected && (
          <p className="mt-4 font-mono text-sm text-pit-muted">
            <Link href="/spectate" className="text-pit-green hover:text-white">
              spectate without money
            </Link>
          </p>
        )}
      </section>

      {/* How it works */}
      <section>
        <h2 className="terminal-label">How it works</h2>
        <ol className="mt-4 grid grid-cols-1 gap-px border border-pit-border bg-pit-border sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-pit-bg p-4 sm:p-5">
              <p className="font-mono text-xs text-pit-green">{s.n}</p>
              <p className="display-type mt-2 text-xl text-white">{s.title}</p>
              <p className="mt-2 font-mono text-sm leading-relaxed text-pit-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 font-mono text-sm text-pit-muted">
          Connect → pick a room ($1–$50) → pick AAPLx/TSLAx/NVDAx → READY → best Pyth % wins.
        </p>
      </section>

      {/* Rooms strip */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="terminal-label">The five pits</h2>
          <Link href="/rooms" className="font-mono text-sm text-pit-green hover:text-white">
            All rooms →
          </Link>
        </div>
        <div className="mt-4">
          <HomeRoomsStrip />
        </div>
      </section>

      {/* Money, honest */}
      <section className="border border-pit-border bg-pit-card p-5 sm:p-6">
        <h2 className="terminal-label">Money, honest</h2>
        <ul className="mt-4 space-y-3 font-mono text-sm leading-relaxed text-pit-muted sm:text-[15px]">
          <li>
            Deposits and pit stakes are held in <span className="text-white">USDC escrow</span> until you withdraw or the pot pays out.
          </li>
          <li>
            Your balance is <span className="text-white">in-app credits</span> (1:1 USDC). Deposit and withdraw to the same wallet.
          </li>
          <li>
            <span className="text-white">3% fee</span> on each pot. We say it upfront.
          </li>
        </ul>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="terminal-label" id="faq-heading">FAQ</h2>
        <div className="mt-4">
          <FaqAccordion />
        </div>
      </section>
    </div>
  );
}
