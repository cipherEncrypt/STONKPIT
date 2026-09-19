"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCredits } from "@/components/useCredits";
import { usePlayerId } from "@/components/usePlayerId";
import { shortPubkey } from "@/lib/format-short";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export function Header() {
  const { connected, publicKey } = useWallet();
  const walletPubkey = connected && publicKey ? publicKey.toBase58() : null;
  const { balance, username } = useCredits(walletPubkey);
  const { isDemo, displayName } = usePlayerId();
  const [menuOpen, setMenuOpen] = useState(false);

  const identity =
    username
      ? `@${username}`
      : walletPubkey
        ? shortPubkey(walletPubkey)
        : isDemo && displayName
          ? displayName
          : null;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const navLinkClass =
    "font-mono text-sm text-pit-muted transition-colors hover:text-white";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-pit-border bg-pit-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2.5 md:px-8">
          <Link href="/" className="display-type shrink-0 text-xl text-white sm:text-2xl">
            STONK<span className="text-pit-green">PIT</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center justify-center gap-5 md:flex" aria-label="Main">
            <Link href="/rooms" className={navLinkClass}>Rooms</Link>
            <Link href="/#faq" className={navLinkClass}>FAQ</Link>
            <Link href="/wallet" className={navLinkClass}>Wallet</Link>
          </nav>

          {/* Mobile: hamburger */}
          <button
            type="button"
            className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1.5 md:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className={`block h-0.5 w-5 bg-white transition-transform ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
            <span className={`block h-0.5 w-5 bg-white transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block h-0.5 w-5 bg-white transition-transform ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
          </button>

          {/* Desktop: credits + wallet */}
          <div className="hidden min-w-0 items-center justify-end gap-2 md:flex sm:gap-3">
            {(walletPubkey || isDemo) && (
              <Link
                href={walletPubkey ? "/wallet" : "/spectate"}
                className="min-w-0 truncate font-mono text-sm text-pit-muted"
                title={walletPubkey ?? undefined}
              >
                {balance != null && (
                  <span className="text-pit-green">{balance.available.toFixed(2)}</span>
                )}
                {balance != null && identity && (
                  <span className="text-pit-muted"> · </span>
                )}
                {identity && (
                  <span className="truncate-handle inline-block align-bottom text-white">
                    {identity}
                  </span>
                )}
              </Link>
            )}
            <WalletMultiButton
              className="wallet-btn !shrink-0 !rounded-none !border !border-white/40 !bg-transparent !px-2.5 !font-mono !text-xs !text-white sm:!px-3"
            />
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            className="absolute inset-y-0 right-0 flex w-[min(100%,20rem)] flex-col border-l border-pit-border bg-pit-bg shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="flex items-center justify-between border-b border-pit-border px-4 py-3">
              <span className="font-mono text-sm text-pit-muted">Menu</span>
              <button
                type="button"
                className="btn-secondary min-h-11 min-w-11 px-3 py-2 text-sm"
                onClick={() => setMenuOpen(false)}
              >
                Close
              </button>
            </div>

            <nav className="flex flex-col gap-1 border-b border-pit-border p-2" aria-label="Mobile">
              <Link
                href="/"
                className="min-h-11 px-3 py-3 font-mono text-sm text-white"
                onClick={() => setMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/rooms"
                className="min-h-11 px-3 py-3 font-mono text-sm text-white"
                onClick={() => setMenuOpen(false)}
              >
                Rooms
              </Link>
              <Link
                href="/#faq"
                className="min-h-11 px-3 py-3 font-mono text-sm text-white"
                onClick={() => setMenuOpen(false)}
              >
                FAQ
              </Link>
              <Link
                href="/wallet"
                className="min-h-11 px-3 py-3 font-mono text-sm text-white"
                onClick={() => setMenuOpen(false)}
              >
                Wallet
              </Link>
            </nav>

            <div className="flex flex-1 flex-col gap-4 p-4 font-mono text-sm">
              {identity && (
                <p className="text-lg text-white">{identity}</p>
              )}

              {balance != null && (
                <div className="space-y-1 text-pit-muted">
                  <p>
                    <span className="text-pit-green">{balance.available.toFixed(2)}</span> available
                  </p>
                  <p>{balance.frozen.toFixed(2)} frozen</p>
                </div>
              )}

              {walletPubkey && (
                <p className="break-all text-pit-muted" title={walletPubkey}>
                  {shortPubkey(walletPubkey)}
                </p>
              )}

              <WalletMultiButton
                className="wallet-btn !w-full !max-w-none !justify-center !rounded-none !border !border-white/40 !bg-transparent !px-4 !py-3 !font-mono !text-sm !text-white"
              />

              {isDemo && !walletPubkey && (
                <Link
                  href="/spectate"
                  className="btn-secondary w-full text-center"
                  onClick={() => setMenuOpen(false)}
                >
                  Demo spectate
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
