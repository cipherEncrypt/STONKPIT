"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PriceFeed } from "@/components/PriceFeed";
import { useCredits } from "@/components/useCredits";
import { usePlayerId } from "@/components/usePlayerId";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRoom } from "@/components/useRoom";
import { useRoomId } from "@/components/useRoomId";
import { STAKE_USDC, STOCKS, StockId } from "@/lib/constants";
import { PythQuote } from "@/lib/pyth";
import { roomHref } from "@/lib/room-url";

type StockQuotes = { crypto: PythQuote; equity: PythQuote };

function PickContent() {
  const router = useRouter();
  const roomId = useRoomId();
  const { connected } = useWallet();
  const { playerId, canPlay, displayName, isDemo } = usePlayerId();
  const { room, join } = useRoom(roomId, 1000);
  const { balance, username } = useCredits(isDemo ? null : playerId);
  const [selected, setSelected] = useState<StockId | null>(null);
  const [quotes, setQuotes] = useState<Partial<Record<StockId, StockQuotes>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lobbyHref = roomHref("/", roomId);

  useEffect(() => {
    if (room?.status === "locked") router.replace(roomHref("/pit", roomId));
    if (room?.status === "ended") router.replace(roomHref("/result", roomId));
  }, [room?.status, router, roomId]);

  useEffect(() => {
    for (const id of Object.keys(STOCKS) as StockId[]) {
      fetch(`/api/prices?stock=${id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.quotes) setQuotes((prev) => ({ ...prev, [id]: d.quotes }));
        })
        .catch(() => {});
    }
  }, []);

  const alreadyJoined = playerId
    ? room?.players.some((p) => p.wallet === playerId)
    : false;

  async function handleJoin() {
    if (!playerId || !selected) return;
    setBusy(true);
    setErr(null);
    try {
      await join(playerId, selected);
      router.push(lobbyHref);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  const roomName = room?.name ?? "Pit";
  const max = room?.maxPlayers ?? 5;
  const full = (room?.players.length ?? 0) >= max;
  const canJoin =
    !!selected &&
    !busy &&
    !full &&
    (isDemo || balance == null || balance.available >= STAKE_USDC);

  if (!canPlay) {
    return (
      <div className="border border-pit-border bg-pit-card p-5 text-center sm:p-6">
        <p className="font-mono text-sm text-pit-muted">{roomName}</p>
        {!connected ? (
          <p className="mt-3 font-mono text-sm text-pit-muted">
            <Link href="/" className="text-pit-green">Connect wallet</Link>
            {" · "}
            <Link href="/spectate" className="text-pit-green">
              spectate without money
            </Link>
          </p>
        ) : (
          <p className="mt-3 font-mono text-sm text-pit-muted">
            <Link href="/" className="text-pit-green">Choose your handle</Link>
          </p>
        )}
        <Link href={lobbyHref} className="btn-secondary mt-4 inline-block">← Lobby</Link>
      </div>
    );
  }

  if (alreadyJoined) {
    return (
      <div className="border border-pit-border bg-pit-card p-5 text-center sm:p-6">
        <p className="display-type text-3xl">YOU&apos;RE IN</p>
        <p className="mt-2 font-mono text-sm text-pit-muted">Go to lobby and tap READY when set</p>
        <Link href={lobbyHref} className="btn-primary mt-6 inline-block w-full max-w-xs">← Lobby</Link>
      </div>
    );
  }

  return (
    <div className="page-bottom-pad space-y-5 md:pb-0">
      <div className="flex flex-col gap-2 border-b border-pit-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={lobbyHref} className="font-mono text-sm text-pit-muted">
            ← Lobby
          </Link>
          <h1 className="display-type mt-2 text-4xl leading-none sm:text-5xl">Choose Fighter</h1>
        </div>
        <p className="font-mono text-sm text-pit-green">
          {String(room?.players.length ?? 0).padStart(2, "0")} / {String(max).padStart(2, "0")}
        </p>
      </div>
      <p className="font-mono text-sm leading-relaxed text-pit-muted">
        {isDemo ? `Demo: ${displayName}` : `@${username ?? displayName}`} · {roomName} · same ticker OK
        {isDemo ? (
          <span> · demo seat (no USDC)</span>
        ) : (
          <>
            {" "}
            · seat costs {STAKE_USDC.toFixed(2)} USDC
            {balance && (
              <>
                {" "}
                · <span className="text-pit-green">{balance.available.toFixed(2)} available</span>
              </>
            )}
          </>
        )}
      </p>

      <div className="grid grid-cols-1 gap-px border border-pit-border bg-pit-border">
        {(Object.keys(STOCKS) as StockId[]).map((id) => {
          const s = STOCKS[id];
          const isSelected = selected === id;
          const q = quotes[id];
          const border =
            isSelected
              ? "border-pit-green bg-pit-green/10"
              : id === "NVDAX"
                ? "border-pit-red"
                : id === "TSLAX"
                  ? "border-white/40"
                  : "border-pit-green/50";
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={`min-h-[7.5rem] border-l-4 bg-pit-bg p-4 text-left transition-colors sm:min-h-[8.75rem] sm:p-5 ${border}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="display-type text-4xl leading-none sm:text-5xl">{s.label}</h2>
                <div className="flex flex-col items-end gap-1">
                  {isSelected && <span className="font-mono text-sm text-pit-green">LOCKED IN</span>}
                  {q?.crypto && (
                    <span className="display-type text-2xl sm:text-3xl">{q.crypto.price.toFixed(2)}</span>
                  )}
                </div>
              </div>
              {q && (
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <PriceFeed label="Scoring" quote={q.crypto} />
                  <PriceFeed label="Equity" quote={q.equity} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {err && <p className="font-mono text-sm text-pit-red">{err}</p>}

      <div className="hidden justify-end border-t border-pit-border pt-5 md:flex">
        <button
          type="button"
          className="btn-primary min-w-48"
          disabled={!canJoin}
          onClick={handleJoin}
        >
          {full
            ? "PIT FULL"
            : !isDemo && balance != null && balance.available < STAKE_USDC
              ? "NEED USDC"
              : busy
                ? "JOINING…"
                : selected
                  ? `JOIN AS ${STOCKS[selected].label}`
                  : "SELECT FIGHTER"}
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-pit-border bg-pit-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!canJoin}
          onClick={handleJoin}
        >
          {full
            ? "PIT FULL"
            : !isDemo && balance != null && balance.available < STAKE_USDC
              ? "NEED USDC"
              : busy
                ? "JOINING…"
                : selected
                  ? `JOIN AS ${STOCKS[selected].label}`
                  : "SELECT FIGHTER"}
        </button>
      </div>
    </div>
  );
}

export default function PickPage() {
  return (
    <Suspense fallback={<p className="text-pit-muted">Loading…</p>}>
      <PickContent />
    </Suspense>
  );
}
