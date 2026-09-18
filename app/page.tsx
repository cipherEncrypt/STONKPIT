"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChooseHandle } from "@/components/ChooseHandle";
import { StickyReadyBar } from "@/components/StickyReadyBar";
import { useCredits } from "@/components/useCredits";
import { usePlayerId } from "@/components/usePlayerId";
import { useRoom } from "@/components/useRoom";
import { useRooms } from "@/components/useRooms";
import { useRoomId } from "@/components/useRoomId";
import { useAppConfig } from "@/components/useAppConfig";
import { MIN_PLAYERS, STOCKS } from "@/lib/constants";
import { displayPlayer } from "@/lib/player-id";
import { PythQuote } from "@/lib/pyth";
import { formatRemaining } from "@/lib/room-clock";
import { roomHref } from "@/lib/room-url";
import { formatUsd } from "@/lib/scoring";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

function statusLabel(status: string): string {
  if (status === "open") return "OPEN";
  if (status === "locked") return "LIVE";
  return "FINAL";
}

function fighterLabel(wallet: string, displayNames: Record<string, string>): string {
  return displayNames[wallet] ?? displayPlayer(wallet);
}

function LobbyContent() {
  const router = useRouter();
  const roomId = useRoomId();
  const { connected, publicKey } = useWallet();
  const walletPubkey = connected && publicKey ? publicKey.toBase58() : null;
  const { playerId, isDemo } = usePlayerId();
  const { room, error, setReady, remainingMs, displayNames } = useRoom(roomId);
  const { rooms, createRoom } = useRooms();
  const { balance, username, setHandle } = useCredits(walletPubkey);
  const [prices, setPrices] = useState<Record<string, PythQuote>>({});
  const [readyBusy, setReadyBusy] = useState(false);
  const [readyErr, setReadyErr] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [handleBusy, setHandleBusy] = useState(false);
  const [handleErr, setHandleErr] = useState<string | null>(null);

  const appConfig = useAppConfig();
  const duration = appConfig?.roomDurationSecs ?? 300;
  const durationLabel =
    duration >= 60 ? `${Math.round(duration / 60)} min` : `${duration} sec`;

  const hasHandle = !!username;
  const canPlay = (connected && hasHandle) || isDemo;
  const showLobby = canPlay;

  useEffect(() => {
    const load = () =>
      fetch("/api/prices")
        .then((r) => r.json())
        .then((d) => setPrices(d.crypto ?? {}))
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (room?.status === "locked") router.replace(roomHref("/pit", roomId));
    if (room?.status === "ended") router.replace(roomHref("/result", roomId));
  }, [room?.status, router, roomId]);

  const max = room?.maxPlayers ?? 5;
  const count = room?.players.length ?? 0;
  const inRoom = playerId ? room?.players.some((p) => p.wallet === playerId) : false;
  const me = playerId ? room?.players.find((p) => p.wallet === playerId) : null;
  const allReady =
    count >= MIN_PLAYERS && room?.players.every((p) => p.ready) && room?.status === "open";

  const pickHref = roomHref("/pick", roomId);
  const pitHref = roomHref("/pit", roomId);
  const resultHref = roomHref("/result", roomId);

  const ctaHref =
    room?.status === "ended"
      ? resultHref
      : room?.status === "locked"
        ? pitHref
        : inRoom
          ? undefined
          : pickHref;

  async function handleReady() {
    if (!playerId) return;
    setReadyBusy(true);
    setReadyErr(null);
    try {
      await setReady(playerId);
    } catch (e) {
      setReadyErr(e instanceof Error ? e.message : "Ready failed");
    } finally {
      setReadyBusy(false);
    }
  }

  async function handleCreate(seats: 5 | 8) {
    setCreateBusy(true);
    try {
      const id = await createRoom(seats);
      router.push(roomHref("/", id));
    } catch {
      /* ignore */
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleSaveHandle(handle: string) {
    setHandleBusy(true);
    setHandleErr(null);
    try {
      await setHandle(handle);
    } catch (e) {
      setHandleErr(e instanceof Error ? e.message : "Could not save handle");
    } finally {
      setHandleBusy(false);
    }
  }

  const roomFull = room?.status === "open" && count >= max;
  const roomLiveOrFinal = room?.status === "locked" || room?.status === "ended";
  const roomName = room?.name ?? "Pit";
  const showStickyReady = !!(inRoom && me && !me.ready && room?.status === "open");

  return (
    <div className={`space-y-6 sm:space-y-7 ${showStickyReady ? "page-bottom-pad" : ""}`}>
      <section className="border-b border-pit-border pb-6">
        <p className="terminal-label text-pit-green">LIVE PRICE BOARD · PYTH MAINNET</p>
        <h1 className="display-type mt-2 text-4xl leading-[0.85] text-white sm:text-5xl md:text-7xl">
          PICK. FIGHT.<br />WIN.
        </h1>
      </section>

      {!connected && !isDemo && (
        <section className="border border-white/20 bg-pit-card p-6 text-center">
          <p className="terminal-label text-pit-green">STEP 1</p>
          <h2 className="display-type mt-2 text-4xl leading-none">Connect wallet</h2>
          <p className="mt-3 font-mono text-xs text-pit-muted">
            Solana mainnet · custodial USDC credits · 1.00 per seat
          </p>
          <div className="mt-6 flex justify-center">
            <WalletMultiButton className="wallet-btn !rounded-none !border !border-pit-green !bg-transparent !px-6 !font-mono !text-sm !text-pit-green" />
          </div>
          <p className="mt-6 font-mono text-sm text-pit-muted">
            <Link href="/spectate" className="text-pit-green hover:text-white">
              spectate without money
            </Link>
          </p>
        </section>
      )}

      {connected && !hasHandle && (
        <ChooseHandle onSave={handleSaveHandle} busy={handleBusy} error={handleErr} />
      )}

      {showLobby && (
        <>
          <section className="grid grid-cols-1 gap-px overflow-hidden border border-pit-border bg-pit-border sm:grid-cols-3">
            {(Object.keys(STOCKS) as (keyof typeof STOCKS)[]).map((id) => {
              const q = prices[id];
              const accent =
                id === "AAPLX" ? "border-pit-green" : id === "TSLAX" ? "border-white" : "border-pit-red";
              return (
                <div key={id} className={`border-l-2 ${accent} bg-pit-bg p-4`}>
                  <div className="flex items-center justify-between">
                    <p className="display-type text-2xl">{STOCKS[id].label}</p>
                    <span className="font-mono text-[10px] text-pit-green">LIVE</span>
                  </div>
                  <p className="display-type mt-4 text-3xl leading-none sm:mt-5 sm:text-4xl">
                    {q ? formatUsd(q.price) : "—"}
                  </p>
                  <div className="mt-4 h-px w-full bg-pit-green/60" />
                  <p className="mt-2 truncate font-mono text-sm text-pit-muted">
                    {STOCKS[id].cryptoSymbol}
                  </p>
                </div>
              );
            })}
          </section>

          {isDemo && !connected && (
            <div className="border border-pit-border bg-pit-card px-5 py-3 font-mono text-xs text-pit-muted">
              Demo spectate · no USDC ·{" "}
              <Link href="/spectate" className="text-pit-green hover:text-white">change name</Link>
            </div>
          )}

          {balance && username && (
            <div className="border border-pit-border bg-pit-card px-4 py-3 font-mono text-sm sm:px-5">
              <span className="text-pit-muted">@{username} · </span>
              <span className="text-pit-green">{balance.available.toFixed(2)} available</span>
              <span className="text-pit-muted"> · {balance.frozen.toFixed(2)} frozen</span>
              <span className="text-pit-muted"> · 1.00 USDC per seat</span>
              <Link href="/wallet" className="ml-2 text-pit-green hover:text-white">Deposit</Link>
            </div>
          )}

          <section className="border border-pit-border bg-pit-card">
            <div className="border-b border-pit-border px-4 py-3 font-mono text-sm text-pit-muted sm:px-5">
              PIT LOBBY · POLL 1s
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              {rooms.map((r) => (
                <Link
                  key={r.id}
                  href={roomHref("/", r.id)}
                  className={`block min-h-11 border border-pit-border bg-pit-bg p-4 transition-colors active:bg-white/5 ${
                    r.id === roomId ? "border-pit-green/60 bg-pit-green/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`truncate font-mono text-sm font-medium ${
                        r.id === roomId ? "text-pit-green" : "text-white"
                      }`}
                    >
                      {r.name}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-sm ${
                        r.status === "locked" ? "text-pit-green" : "text-pit-muted"
                      }`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-pit-muted">
                    <span>
                      {String(r.seated).padStart(2, "0")} / {String(r.maxPlayers).padStart(2, "0")}
                    </span>
                    {r.status === "locked" && (
                      <span className="text-pit-green">{formatRemaining(r.remainingMs)}</span>
                    )}
                    {r.status === "open" && r.readyCount > 0 && (
                      <span>{r.readyCount} ready</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-pit-border px-4 py-3 sm:flex-row sm:flex-wrap sm:px-5">
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                disabled={createBusy}
                onClick={() => handleCreate(5)}
              >
                + ROOM (5)
              </button>
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                disabled={createBusy}
                onClick={() => handleCreate(8)}
              >
                + ROOM (8)
              </button>
            </div>
          </section>

          <section className="border border-white/20 bg-pit-card">
            <div className="border-b border-pit-border px-4 py-3 font-mono text-sm text-pit-muted sm:px-5">
              <span className="block truncate">{roomName}</span>
              <span className="mt-1 block">
                {max} SEATS · {durationLabel.toUpperCase()} ·{" "}
                {room ? statusLabel(room.status) : "…"}
                {room?.status === "locked" && (
                  <span className="ml-2 text-pit-green">{formatRemaining(remainingMs)}</span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <p className="display-type text-4xl leading-none text-pit-green sm:text-5xl">
                  {String(count).padStart(2, "0")} / {String(max).padStart(2, "0")}
                </p>
                <p className="mt-2 font-mono text-sm text-pit-muted">FIGHTERS</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {inRoom && me && !me.ready && room?.status === "open" && (
                  <button
                    type="button"
                    className="btn-primary hidden min-w-32 md:inline-flex"
                    disabled={readyBusy}
                    onClick={handleReady}
                  >
                    {readyBusy ? "…" : "READY"}
                  </button>
                )}
                {canPlay && ctaHref && (
                  <Link href={ctaHref} className="btn-secondary w-full text-center sm:w-auto">
                    {roomFull || roomLiveOrFinal ? "ROOM FULL" : "JOIN PIT"}
                  </Link>
                )}
                {(roomFull || roomLiveOrFinal) && (
                  <button
                    type="button"
                    className="btn-secondary w-full sm:w-auto"
                    disabled={createBusy}
                    onClick={() => handleCreate(5)}
                  >
                    OPEN NEW ROOM
                  </button>
                )}
              </div>
            </div>

            {(error || readyErr) && (
              <p className="px-5 pb-3 font-mono text-xs text-pit-red">{error || readyErr}</p>
            )}

            {count > 0 && room?.status === "open" && (
              <div className="border-t border-pit-border">
                <p className="px-5 py-2 terminal-label">Fighters · pick ticker then READY</p>
                <ul className="max-h-48 overflow-y-auto px-4 pb-4 sm:px-5">
                  {room.players.map((p) => (
                    <li
                      key={p.wallet}
                      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-pit-border/40 py-2 font-mono text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-white">
                        <span className="truncate-handle inline-block max-w-[9rem] align-bottom sm:max-w-none">
                          {fighterLabel(p.wallet, displayNames)}
                        </span>
                        <span className="text-pit-muted"> · {STOCKS[p.stock].label}</span>
                      </span>
                      <span className={`shrink-0 ${p.ready ? "text-pit-green" : "text-pit-muted"}`}>
                        {p.ready ? "READY ✓" : "WAITING"}
                      </span>
                    </li>
                  ))}
                </ul>
                {allReady && (
                  <p className="px-4 pb-3 font-mono text-sm text-pit-green sm:px-5">
                    All seated fighters ready — pit starts when server snapshots Pyth…
                  </p>
                )}
                {!allReady && count >= MIN_PLAYERS && (
                  <p className="px-4 pb-3 font-mono text-sm text-pit-muted sm:px-5">
                    Waiting for all fighters to READY · or {max}/{max} seats fills auto-start
                  </p>
                )}
              </div>
            )}

            <p className="break-all border-t border-pit-border px-4 py-3 font-mono text-sm text-pit-muted sm:px-5">
              Share: <code className="text-pit-green">{roomHref("/", roomId)}</code>
            </p>
          </section>
        </>
      )}

      {showStickyReady && (
        <StickyReadyBar busy={readyBusy} onReady={handleReady} />
      )}

      <p className="font-mono text-sm text-pit-muted">
        Custodial credits · Pyth scores the fight · Join costs 1.00 credit
        {!connected && (
          <>
            {" "}
            ·{" "}
            <Link href="/spectate" className="text-pit-green hover:text-white">
              spectate without money
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export default function LobbyPage() {
  return (
    <Suspense fallback={<p className="text-pit-muted">Loading lobby…</p>}>
      <LobbyContent />
    </Suspense>
  );
}
