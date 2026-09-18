"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoom } from "@/components/useRoom";
import { useRoomId } from "@/components/useRoomId";
import { STOCKS } from "@/lib/constants";
import { displayPlayer, isDemoPlayer } from "@/lib/player-id";
import {
  computeRankedPayouts,
  formatCreditDelta,
  formatPreviewUsdc,
  payoutSummaryLine,
} from "@/lib/payout-preview";
import { roomHref } from "@/lib/room-url";
import { buildShareCard } from "@/lib/share";
import { formatBps } from "@/lib/scoring";

function fighterLabel(wallet: string, displayNames: Record<string, string>): string {
  return displayNames[wallet] ?? displayPlayer(wallet);
}

function ResultContent() {
  const router = useRouter();
  const roomId = useRoomId();
  const { room, reset, displayNames } = useRoom(roomId, 1000);
  const [copied, setCopied] = useState(false);

  const pitHref = roomHref("/pit", roomId);
  const pickHref = roomHref("/pick", roomId);
  const lobbyHref = roomHref("/", roomId);

  const ranked = useMemo(() => {
    if (!room?.results.length) return [];
    const base = computeRankedPayouts(room.results);
    return base.map((r) => {
      const fromResult = room.results.find((p) => p.wallet === r.wallet);
      const creditDelta = fromResult?.creditDelta ?? r.previewUsdc - 1;
      const payoutCredits = fromResult?.payoutCredits ?? r.previewUsdc;
      return { ...r, creditDelta, payoutCredits };
    });
  }, [room?.results]);

  const shareText = useMemo(() => buildShareCard(ranked, displayNames), [ranked, displayNames]);
  const first = ranked.find((r) => r.rank === 1) ?? ranked[0];

  async function handleShare() {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function handleRematch() {
    await reset();
    router.push(pickHref);
  }

  if (!room || room.status !== "ended") {
    return (
      <div className="border border-pit-border bg-pit-card p-5 text-center sm:p-6">
        <p className="font-mono text-sm text-pit-muted">Room {roomId} still in progress…</p>
        <Link href={pitHref} className="btn-secondary mt-4 inline-block">Back to pit</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="border-b border-pit-border pb-6">
        <p className="terminal-label text-pit-green">{room.name} · FINAL</p>
        {first && (
          <>
            <h1 className="display-type mt-2 truncate text-4xl leading-[0.9] sm:text-5xl md:text-7xl">
              {fighterLabel(first.wallet, displayNames)}
            </h1>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <span className="display-type text-3xl text-pit-green sm:text-4xl">{STOCKS[first.stock].label}</span>
              <span
                className={`display-type text-3xl sm:text-4xl ${
                  first.scoreBps >= 0 ? "text-pit-green" : "text-pit-red"
                }`}
              >
                {formatBps(first.scoreBps)}
              </span>
              <span className="font-mono text-sm text-pit-muted">
                {formatCreditDelta(first.creditDelta ?? 0)} applied
              </span>
            </div>
          </>
        )}
      </section>

      <section className="border border-pit-border bg-pit-card">
        <div className="border-b border-pit-border px-4 py-2 terminal-label">Ranked results</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-pit-border text-pit-muted">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Handle</th>
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2 text-right">Payout</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">Credit Δ</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr
                  key={r.wallet}
                  className={`border-b border-pit-border/40 ${r.rank === 1 ? "bg-pit-green/5" : ""}`}
                >
                  <td className="px-3 py-2 text-pit-muted">{r.rank}</td>
                  <td className="max-w-[7rem] truncate px-3 py-2 text-white sm:max-w-[10rem]">
                    {fighterLabel(r.wallet, displayNames)}
                  </td>
                  <td className="px-3 py-2 text-pit-green">{STOCKS[r.stock].label}</td>
                  <td
                    className={`px-3 py-2 text-right font-display text-base font-black ${
                      r.scoreBps >= 0 ? "text-pit-green" : "text-pit-red"
                    }`}
                  >
                    {formatBps(r.scoreBps)}
                  </td>
                  <td className="px-3 py-2 text-right text-white">
                    {isDemoPlayer(r.wallet)
                      ? "—"
                      : formatPreviewUsdc(r.payoutCredits ?? r.previewUsdc)}
                  </td>
                  <td
                    className={`hidden px-3 py-2 text-right sm:table-cell ${
                      isDemoPlayer(r.wallet)
                        ? "text-pit-muted"
                        : (r.creditDelta ?? 0) >= 0
                          ? "text-pit-green"
                          : "text-pit-red"
                    }`}
                  >
                    {isDemoPlayer(r.wallet) ? "demo" : formatCreditDelta(r.creditDelta ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-pit-border px-4 py-3 font-mono text-sm text-pit-muted">
          {payoutSummaryLine(room.results.length)} · credits applied to ledger
        </p>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className="btn-secondary w-full" onClick={handleShare}>
          {copied ? "Copied!" : "Copy share card"}
        </button>
        <button type="button" className="btn-secondary w-full" onClick={handleRematch}>
          Rematch
        </button>
        <Link href="/wallet" className="btn-secondary w-full text-center">Credits</Link>
        <Link href={lobbyHref} className="btn-secondary w-full text-center">Lobby</Link>
      </div>

      <pre className="overflow-x-auto border border-pit-border bg-pit-card p-4 font-mono text-sm text-white">
        {shareText}
      </pre>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<p className="text-pit-muted">Loading results…</p>}>
      <ResultContent />
    </Suspense>
  );
}
