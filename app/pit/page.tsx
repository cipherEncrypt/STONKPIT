"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PriceFeed } from "@/components/PriceFeed";
import { useRoom } from "@/components/useRoom";
import { useRoomId } from "@/components/useRoomId";
import { usePlayerId } from "@/components/usePlayerId";
import { MIN_PLAYERS, STOCKS, StockId } from "@/lib/constants";
import { displayPlayer } from "@/lib/player-id";
import { PythQuote } from "@/lib/pyth";
import { formatRemaining } from "@/lib/room-clock";
import { roomHref } from "@/lib/room-url";
import { formatBps, formatUsd } from "@/lib/scoring";
import { StickyReadyBar } from "@/components/StickyReadyBar";

function fighterLabel(wallet: string, displayNames: Record<string, string>): string {
  return displayNames[wallet] ?? displayPlayer(wallet);
}

function PitContent() {
  const router = useRouter();
  const roomId = useRoomId();
  const { playerId } = usePlayerId();
  const { room, remainingMs, getRemainingMs, displayNames, setReady } = useRoom(roomId);
  const [displayMs, setDisplayMs] = useState(0);
  const [readyBusy, setReadyBusy] = useState(false);
  const [live, setLive] = useState<
    Partial<Record<StockId, { crypto: PythQuote; equity: PythQuote }>>
  >({});

  const resultHref = roomHref("/result", roomId);
  const lobbyHref = roomHref("/", roomId);

  const me = playerId ? room?.players.find((p) => p.wallet === playerId) : null;
  const showStickyReady = !!(me && !me.ready && room?.status === "open");

  useEffect(() => {
    if (room?.status === "ended") router.replace(resultHref);
  }, [room?.status, router, resultHref]);

  useEffect(() => {
    setDisplayMs(remainingMs);
  }, [remainingMs]);

  useEffect(() => {
    const tick = setInterval(() => setDisplayMs(getRemainingMs()), 250);
    return () => clearInterval(tick);
  }, [getRemainingMs]);

  const stocksInPlay = useMemo(
    () => [...new Set(room?.players.map((p) => p.stock) ?? [])],
    [room?.players],
  );

  useEffect(() => {
    if (!stocksInPlay.length) return;
    const load = () => {
      for (const id of stocksInPlay) {
        fetch(`/api/prices?stock=${id}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.quotes) setLive((prev) => ({ ...prev, [id]: d.quotes }));
          })
          .catch(() => {});
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [stocksInPlay]);

  const liveRows = useMemo(() => {
    if (!room) return [];
    return room.players
      .map((p) => {
        const start = room.startPrices[p.stock];
        const liveQ = live[p.stock]?.crypto;
        const moveBps =
          start && liveQ ? Math.round(((liveQ.price - start) / start) * 10_000) : 0;
        return { ...p, start, liveQ, moveBps };
      })
      .sort((a, b) => b.moveBps - a.moveBps);
  }, [room, live]);

  async function handleReady() {
    if (!playerId) return;
    setReadyBusy(true);
    try {
      await setReady(playerId);
    } finally {
      setReadyBusy(false);
    }
  }

  if (!room) {
    return <p className="text-pit-muted">Loading pit…</p>;
  }

  const max = room.maxPlayers;

  if (room.status === "open") {
    return (
      <div className={`border border-pit-border bg-pit-card p-5 sm:p-6 ${showStickyReady ? "page-bottom-pad" : ""}`}>
        <p className="terminal-label">{room.name} · OPEN</p>
        <p className="display-type mt-2 text-4xl text-pit-green">
          {String(room.players.length).padStart(2, "0")} / {String(max).padStart(2, "0")} FIGHTERS
        </p>
        <p className="mt-3 font-mono text-sm text-pit-muted">
          {room.players.length < MIN_PLAYERS
            ? `Need ${MIN_PLAYERS - room.players.length} more seated`
            : "All seated fighters must READY on lobby — or room fills"}
        </p>
        <Link href={lobbyHref} className="btn-primary mt-6 inline-block">← Lobby</Link>
        {showStickyReady && <StickyReadyBar busy={readyBusy} onReady={handleReady} />}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${showStickyReady ? "page-bottom-pad" : ""}`}>
      <div className="space-y-3 border-b border-pit-border pb-4">
        <Link href={lobbyHref} className="font-mono text-sm text-pit-muted">
          ← Lobby
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="display-type text-4xl leading-none">LIVE</h1>
          <p className="font-mono text-sm text-pit-muted">
            {room.name} · {room.players.length} fighters
          </p>
        </div>
        {room.status === "locked" && (
          <p className="display-type w-full text-center text-5xl leading-none text-pit-green sm:text-left sm:text-6xl">
            {formatRemaining(displayMs)}
          </p>
        )}
      </div>

      <div className="border border-pit-border bg-pit-card">
        <div className="hidden border-b border-pit-border px-3 py-2 font-mono text-sm uppercase tracking-wider text-pit-muted md:grid md:grid-cols-[2rem_1fr_4rem_4rem_4rem] md:gap-2">
          <span>#</span>
          <span>Fighter</span>
          <span className="text-right">Move</span>
          <span className="text-right">Start</span>
          <span className="text-right">Live</span>
        </div>
        <ul className="max-h-[min(28rem,55vh)] overflow-y-auto">
          {liveRows.map((row, i) => (
            <li
              key={row.wallet}
              className="border-b border-pit-border/40 px-3 py-3 font-mono text-sm leading-snug md:grid md:grid-cols-[2rem_1fr_4rem_4rem_4rem] md:items-center md:gap-2 md:py-1.5"
            >
              <div className="flex items-start gap-2 md:contents">
                <span className="shrink-0 text-pit-muted md:block">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1 md:truncate">
                  <span className="text-pit-green">{STOCKS[row.stock].label}</span>
                  <span className="text-pit-muted"> · </span>
                  <span className="truncate-handle inline-block max-w-[8rem] align-bottom text-white sm:max-w-none">
                    {fighterLabel(row.wallet, displayNames)}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-7 md:contents md:pl-0">
                <span
                  className={`font-display text-base font-black md:text-right md:text-sm ${
                    row.moveBps >= 0 ? "text-pit-green" : "text-pit-red"
                  }`}
                >
                  <span className="text-pit-muted md:hidden">Move </span>
                  {row.start ? formatBps(row.moveBps) : "—"}
                </span>
                <span className="text-pit-muted md:text-right">
                  <span className="md:hidden">Start </span>
                  {row.start ? formatUsd(row.start) : "—"}
                </span>
                <span className="text-white md:text-right">
                  <span className="text-pit-muted md:hidden">Live </span>
                  {row.liveQ ? formatUsd(row.liveQ.price) : "…"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <details className="border border-pit-border bg-pit-card">
        <summary className="cursor-pointer px-4 py-3 font-mono text-sm text-pit-muted">
          Pyth feeds ({stocksInPlay.length} tickers)
        </summary>
        <div className="grid grid-cols-1 gap-px border-t border-pit-border bg-pit-border">
          {stocksInPlay.map((id) => {
            const q = live[id];
            const start = room.startPrices[id];
            return (
              <div key={id} className="bg-pit-bg p-3">
                <p className="display-type mb-2 text-lg">{STOCKS[id].label}</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <PriceFeed label="Scoring" quote={q?.crypto ?? null} startPrice={start} />
                  <PriceFeed label="Equity" quote={q?.equity ?? null} />
                </div>
              </div>
            );
          })}
        </div>
      </details>

      {displayMs === 0 && room.status === "locked" && (
        <p className="text-center font-mono text-sm text-pit-green">SETTLING…</p>
      )}

      {showStickyReady && <StickyReadyBar busy={readyBusy} onReady={handleReady} />}
    </div>
  );
}

export default function PitPage() {
  return (
    <Suspense fallback={<p className="text-pit-muted">Loading pit…</p>}>
      <PitContent />
    </Suspense>
  );
}
