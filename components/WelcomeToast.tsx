"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCredits } from "@/components/useCredits";
import { usePlayerId } from "@/components/usePlayerId";

const STORAGE_PREFIX = "stonkpit-welcome-v1:";

function storageKey(pubkey: string): string {
  return `${STORAGE_PREFIX}${pubkey}`;
}

function hasSeenWelcome(pubkey: string): boolean {
  try {
    return localStorage.getItem(storageKey(pubkey)) === "1";
  } catch {
    return true;
  }
}

function markWelcomeSeen(pubkey: string): void {
  try {
    localStorage.setItem(storageKey(pubkey), "1");
  } catch {
    /* ignore */
  }
}

export function WelcomeToast() {
  const { connected, publicKey } = useWallet();
  const pubkey = connected && publicKey ? publicKey.toBase58() : null;
  const { username } = useCredits(pubkey);
  const { isDemo } = usePlayerId();
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    if (pubkey) markWelcomeSeen(pubkey);
    setVisible(false);
  }, [pubkey]);

  useEffect(() => {
    if (isDemo || !pubkey || !username) {
      setVisible(false);
      return;
    }
    if (hasSeenWelcome(pubkey)) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [pubkey, username, isDemo]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(dismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:left-auto md:right-4 md:top-20 md:max-w-sm md:justify-end md:p-0"
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="stonkpit-welcome-title"
        aria-describedby="stonkpit-welcome-body"
        className="pointer-events-auto w-full max-w-md border border-pit-border bg-pit-card p-5 shadow-lg shadow-black/40"
      >
        <p id="stonkpit-welcome-title" className="terminal-label text-pit-green">
          Welcome to StonkPit
        </p>
        <p id="stonkpit-welcome-body" className="mt-3 font-mono text-sm leading-relaxed text-white">
          Pick a stock. Timed pit. Best % move wins the pot. Stakes sit in USDC escrow until the
          fight ends.
        </p>
        <button type="button" className="btn-primary mt-5 min-h-11 w-full" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
