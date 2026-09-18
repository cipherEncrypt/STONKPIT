"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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

  const identity =
    username
      ? `@${username}`
      : walletPubkey
        ? shortPubkey(walletPubkey)
        : isDemo && displayName
          ? displayName
          : null;

  return (
    <header className="sticky top-0 z-40 border-b border-pit-border bg-pit-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2.5 md:px-8">
        <Link href="/" className="display-type shrink-0 text-xl text-white sm:text-2xl">
          STONK<span className="text-pit-green">PIT</span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
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
  );
}
