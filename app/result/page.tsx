"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRoom } from "@/components/useRoom";
import { useRoomId } from "@/components/useRoomId";
import { STOCKS } from "@/lib/constants";
import { buildFinalRanked, fightResultRows, topTieGroup } from "@/lib/final-results";
import { displayPlayer, isDemoPlayer } from "@/lib/player-id";
import {
  formatCreditDelta,
  formatPreviewUsdc,
  payoutSummaryLine,
  walletPlayerCount,
} from "@/lib/payout-preview";
import { formatStakeUsd } from "@/lib/format-stake";
import { roomHref } from "@/lib/room-url";
import { buildShareCard } from "@/lib/share";
import { formatPriceSourceLabel } from "@/lib/price-source-label";
import { formatBpsHero, formatMoveDisplay, formatUsdPit } from "@/lib/scoring";
import { ResultOutcomeToast } from "@/components/ResultOutcomeToast";
import { Room } from "@/lib/room-store";

function fighterLabel(wallet: string, displayNames: Record<string, string>): string {
  return displayNames[wallet] ?? displayPlayer(wallet);
}

type FinalSnapshot = {
  roomId: string;
  stakeMicro: number;
  name: string;
  ranked: ReturnType<typeof buildFinalRanked>;
  fighterCount: number;
  payingCount: number;
};

function snapshotFromRoom(room: Room): FinalSnapshot | null {
  if (room.status !== "ended") return null;
  const rows = fightResultRows(room);
  const fighters = room.players.length > 0 ? room.players.length : rows.length;
  if (fighters === 0) return null;
  const ranked = buildFinalRanked(room, room.stakeMicro);
  return {
    roomId: room.id,
    stakeMicro: room.stakeMicro,
    name: room.name,
    ranked,
    fighterCount: fighters,
    payingCount: walletPlayerCount(rows),
  };
}

function ResultContent() {
  const router = useRouter();
  const roomId = useRoomId();
  const { room, reset, displayNames } = useRoom(roomId, 1000);
  const [copied, setCopied] = useState(false);
  const [frozen, setFrozen] = useState<FinalSnapshot | null>(null);

  const pitHref = roomHref("/pit", roomId);
  const pickHref = roomHref("/pick", roomId);
  const lobbyHref = roomHref("/rooms", roomId);

  useEffect(() => {
    const snap = room ? snapshotFromRoom(room) : null;
    if (snap) setFrozen(snap);
  }, [room]);

  const view = useMemo(() => {
    const live = room ? snapshotFromRoom(room) : null;
    if (live && live.ranked.length > 0) return live;
    if (frozen?.roomId === roomId && frozen.ranked.length > 0) return frozen;
    return live;
  }, [room, roomId, frozen]);

  const ranked = view?.ranked ?? [];
  const shareText = useMemo(() => buildShareCard(ranked, displayNames), [ranked, displayNames]);
  const tieGroup = useMemo(() => topTieGroup(ranked), [ranked]);
  const isTie = tieGroup.length >= 2;

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
    setFrozen(null);
    router.push(pickHref);
  }

  const showFinal =
    room?.status === "ended" || (frozen?.roomId === roomId && ranked.length > 0);

  if (!room || !showFinal) {
    return (
      <div className="border border-pit-border bg-pit-card p-5 text-center sm:p-6">
        <p className="font-mono text-sm text-pit-muted">Room {roomId} still in progress…</p>
        <Link href={pitHref} className="btn-secondary mt-4 inline-block">Back to pit</Link>
      </div>
    );
  }

  const stakeMicro = view?.stakeMicro ?? room.stakeMicro;
  const fighterCount = view?.fighterCount ?? ranked.length;
  const payingCount = view?.payingCount ?? walletPlayerCount(fightResultRows(room));
  const summary = payoutSummaryLine(payingCount, stakeMicro, fighterCount);
  const showCreditsNote = payingCount > 0;

  return (
    <>
    <div className="space-y-5">
      <section className="border-b border-pit-border pb-6">
        <p className="terminal-label text-pit-green">
          {view?.name ?? room.name} · {formatStakeUsd(stakeMicro)} · FINAL
        </p>
        {ranked.length > 0 ? (
          isTie ? (
            <>
              <h1 className="display-type mt-2 text-3xl leading-tight text-white sm:text-4xl md:text-5xl">
                {tieGroup.map((r) => fighterLabel(r.wallet, displayNames)).join(" and ")}
              </h1>
              <p className="mt-3 font-mono text-lg text-pit-green sm:text-xl">
                TIE at {formatBpsHero(tieGroup[0].scoreBps)}
              </p>
              <p className="mt-1 font-mono text-sm text-pit-muted">
                {formatMoveDisplay(tieGroup[0].scoreBps)}
              </p>
            </>
          ) : (
            <>
              <h1 className="display-type mt-2 truncate text-4xl leading-[0.9] sm:text-5xl md:text-7xl">
                {fighterLabel(tieGroup[0].wallet, displayNames)}
              </h1>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="display-type text-3xl text-pit-green sm:text-4xl">
                  {STOCKS[tieGroup[0].stock].label}
                </span>
                <span
                  className={`font-mono text-lg sm:text-xl ${
                    tieGroup[0].scoreBps >= 0 ? "text-pit-green" : "text-pit-red"
                  }`}
                >
                  {formatMoveDisplay(tieGroup[0].scoreBps)}
                </span>
                {!isDemoPlayer(tieGroup[0].wallet) && (
                  <span className="font-mono text-sm text-pit-muted">
                    {formatCreditDelta(tieGroup[0].creditDelta ?? 0)} applied
                  </span>
                )}
              </div>
            </>
          )
        ) : (
          <p className="mt-2 font-mono text-sm text-pit-muted">Loading final standings…</p>
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
                <th className="px-3 py-2 text-right">Move</th>
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
                    className={`px-3 py-2 text-right text-xs sm:text-sm ${
                      r.scoreBps >= 0 ? "text-pit-green" : "text-pit-red"
                    }`}
                  >
                    {formatMoveDisplay(r.scoreBps)}
                  </td>
                  <td className="px-3 py-2 text-right text-white">
                    {isDemoPlayer(r.wallet)
                      ? formatPreviewUsdc(0)
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
          {summary}
          {showCreditsNote ? " · credits applied to ledger" : ""}
        </p>
        {ranked.length > 0 && (
          <p className="border-t border-pit-border px-4 py-2 font-mono text-xs text-pit-muted">
            {Array.from(new Set(ranked.map((r) => r.stock)))
              .map((stockId) => {
                const src = room.startQuotes[stockId]?.priceSource;
                const start = room.startPrices[stockId];
                const end = room.endPrices[stockId];
                if (!src || start == null || end == null) return null;
                return `${STOCKS[stockId].label} ${formatPriceSourceLabel(src)} · start ${formatUsdPit(start)} → end ${formatUsdPit(end)}`;
              })
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
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
    <ResultOutcomeToast />
    </>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<p className="text-pit-muted">Loading results…</p>}>
      <ResultContent />
    </Suspense>
  );
}
