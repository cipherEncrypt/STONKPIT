"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PriceFeed } from "@/components/PriceFeed";
import { useRoom } from "@/components/useRoom";
import { useRoomId } from "@/components/useRoomId";
import { usePlayerId } from "@/components/usePlayerId";
import { MIN_PLAYERS, STOCKS, StockId } from "@/lib/constants";
import { displayPlayer } from "@/lib/player-id";
import { MarketQuote } from "@/lib/market-price";
import { formatMarketStatusLine, formatPriceSourceLabel } from "@/lib/price-source-label";
import { PythQuote } from "@/lib/pyth";
import { formatStakeUsd } from "@/lib/format-stake";
import { formatRemaining } from "@/lib/room-clock";
import { roomHref } from "@/lib/room-url";
import {
  formatMoveDisplay,
  moveBpsFromPrices,
  formatUsdPit,
} from "@/lib/scoring";
import { ResultOutcomeToast } from "@/components/ResultOutcomeToast";
import { StickyReadyBar } from "@/components/StickyReadyBar";
import { MiniCandles } from "@/components/MiniCandles";
import { addSample, lastCandles, MinuteCandle } from "@/lib/candles";

function fighterLabel(wallet: string, displayNames: Record<string, string>): string {
  return displayNames[wallet] ?? displayPlayer(wallet);
}

function PitContent() {
  const router = useRouter();
  const roomId = useRoomId();
  const { playerId } = usePlayerId();
  const { room, remainingMs, getRemainingMs, displayNames, setReady } = useRoom(roomId, 1000);
  const [displayMs, setDisplayMs] = useState(0);
  const [readyBusy, setReadyBusy] = useState(false);
  const [live, setLive] = useState<
    Partial<
      Record<
        StockId,
        { quotes?: { crypto: PythQuote; equity: PythQuote }; scoring: MarketQuote }
      >
    >
  >({});
  const [tapeCandles, setTapeCandles] = useState<Partial<Record<StockId, MinuteCandle[]>>>({});
  const fightKeyRef = useRef<string | null>(null);
  const tapeRef = useRef<Partial<Record<StockId, MinuteCandle[]>>>({});

  const resultHref = roomHref("/result", roomId);
  const lobbyHref = roomHref("/rooms", roomId);

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

  /** Reset tape when a new LIVE round starts. */
  useEffect(() => {
    if (room?.status !== "locked" || !room.startTs) return;
    const key = `${room.id}:${room.startTs}`;
    if (fightKeyRef.current === key) return;
    fightKeyRef.current = key;
    tapeRef.current = {};
    setTapeCandles({});
  }, [room?.status, room?.id, room?.startTs]);

  /** Server-authoritative live prices — fightMarketQuote + frozen startQuotes. */
  useEffect(() => {
    if (room?.status !== "locked" || !stocksInPlay.length) return;

    let cancelled = false;

    const load = async () => {
      const sampleTs = Date.now();
      const candlePatches: Partial<Record<StockId, MinuteCandle[]>> = {};
      const livePatches: Partial<
        Record<
          StockId,
          { quotes?: { crypto: PythQuote; equity: PythQuote }; scoring: MarketQuote }
        >
      > = {};

      try {
        const res = await fetch(`/api/room/live-prices?room=${roomId}`, { cache: "no-store" });
        const d = (await res.json()) as {
          error?: string;
          live?: Partial<Record<StockId, MarketQuote>>;
        };
        if (cancelled || d.error || !d.live) return;

        for (const id of stocksInPlay) {
          const q = d.live[id];
          if (!q) continue;
          livePatches[id] = { scoring: q };

          const prevCandles = tapeRef.current[id] ?? [];
          const next = addSample(prevCandles, {
            ts: sampleTs,
            price: q.price,
            publishTime: q.publishTime,
          });
          tapeRef.current[id] = next;
          candlePatches[id] = next;
        }
      } catch {
        /* retry next poll */
      }

      if (!cancelled) {
        if (Object.keys(livePatches).length) {
          setLive((prev) => ({ ...prev, ...livePatches }));
        }
        if (Object.keys(candlePatches).length) {
          setTapeCandles((prev) => ({ ...prev, ...candlePatches }));
        }
      }
    };

    void load();
    const id = setInterval(() => void load(), 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [room?.status, stocksInPlay, roomId]);

  const liveRows = useMemo(() => {
    if (!room) return [];
    return room.players
      .map((p) => {
        const startQ = room.startQuotes[p.stock];
        const start = startQ?.price ?? room.startPrices[p.stock];
        const liveQ = live[p.stock]?.scoring;
        const moveBps =
          start && liveQ && start > 0 ? moveBpsFromPrices(start, liveQ.price) : 0;
        return { ...p, start, liveQ, moveBps };
      })
      .sort((a, b) => b.moveBps - a.moveBps);
  }, [room, live]);

  const feedBanner = useMemo(() => {
    const qs = stocksInPlay.map((id) => live[id]?.scoring).filter(Boolean) as MarketQuote[];
    if (!qs.length) return null;
    const worst = qs.reduce((a, b) => (a.publishTime < b.publishTime ? a : b));
    return formatMarketStatusLine(worst);
  }, [live, stocksInPlay]);

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
            {room.name} · {formatStakeUsd(room.stakeMicro)} · {room.players.length} fighters
          </p>
          {feedBanner && (
            <p
              className={`font-mono text-xs ${
                feedBanner.includes("FEED STALE")
                  ? "text-pit-red"
                  : feedBanner.includes("QUIET")
                    ? "text-amber-400/90"
                    : "text-pit-green"
              }`}
            >
              {feedBanner}
            </p>
          )}
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
                  {row.start && row.liveQ ? formatMoveDisplay(row.moveBps) : "—"}
                </span>
                <span className="text-pit-muted md:text-right">
                  <span className="md:hidden">Start </span>
                  {row.start ? (
                    <>
                      {formatUsdPit(row.start)}
                      {room.startQuotes[row.stock]?.priceSource && (
                        <span className="ml-1 text-[10px] text-pit-muted">
                          {formatPriceSourceLabel(room.startQuotes[row.stock]!.priceSource)}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="text-white md:text-right">
                  <span className="md:hidden">Live </span>
                  {row.liveQ ? (
                    <span className="inline-flex flex-col items-end gap-0.5">
                      <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0">
                        <span>{formatUsdPit(row.liveQ.price)}</span>
                        <span className="font-mono text-[10px] text-pit-green md:text-xs">
                          {formatPriceSourceLabel(row.liveQ.priceSource)}
                        </span>
                      </span>
                      <span className="text-[10px] text-pit-muted md:text-xs">
                        {formatMarketStatusLine(row.liveQ)}
                      </span>
                    </span>
                  ) : (
                    "…"
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <details open className="border border-pit-border bg-pit-card">
        <summary className="cursor-pointer px-4 py-3 font-mono text-sm text-pit-muted">
          Pyth feeds ({stocksInPlay.length} tickers)
        </summary>
        <div className="grid grid-cols-1 gap-px border-t border-pit-border bg-pit-border">
          {stocksInPlay.map((id) => {
            const q = live[id]?.quotes;
            const scoring = live[id]?.scoring;
            const start = room.startPrices[id];
            return (
              <div key={id} className="bg-pit-bg p-3">
                <p className="display-type mb-2 text-lg">
                  {STOCKS[id].label}
                  {scoring && (
                    <span className="ml-2 font-mono text-xs text-pit-muted">
                      {formatMarketStatusLine(scoring)}
                    </span>
                  )}
                </p>
                {scoring && (
                  <p className="mb-2 font-mono text-sm text-white">
                    Official {formatUsdPit(scoring.price)}{" "}
                    <span className="text-pit-green">{formatPriceSourceLabel(scoring.priceSource)}</span>
                  </p>
                )}
                <div className="mb-3 border border-pit-border/50 bg-pit-bg/50 px-3 py-2">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-pit-muted">
                    1m tape (last 3 · display only)
                  </p>
                  <MiniCandles candles={lastCandles(tapeCandles[id] ?? [], 3)} />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <PriceFeed label="Pyth crypto (ref)" quote={q?.crypto ?? null} startPrice={start} />
                  <PriceFeed label="Pyth equity (ref)" quote={q?.equity ?? null} />
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

      <ResultOutcomeToast />
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
