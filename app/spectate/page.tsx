"use client";

import { Suspense } from "react";
import Link from "next/link";
import { DemoJoin } from "@/components/DemoJoin";
import { usePlayerId } from "@/components/usePlayerId";
import { useRooms } from "@/components/useRooms";
import { useRoomId } from "@/components/useRoomId";
import { formatStakeUsd } from "@/lib/format-stake";
import { formatRemaining } from "@/lib/room-clock";
import { roomHref } from "@/lib/room-url";

function statusLabel(status: string): string {
  if (status === "open") return "OPEN";
  if (status === "locked") return "LIVE";
  return "FINAL";
}

function SpectateContent() {
  const roomId = useRoomId();
  const { demoName, setDemoName, canPlay } = usePlayerId();
  const { rooms } = useRooms();

  return (
    <div className="space-y-6">
      <section className="border-b border-pit-border pb-5">
        <Link href="/rooms" className="font-mono text-sm text-pit-muted">
          ← Main lobby
        </Link>
        <h1 className="display-type mt-3 text-4xl leading-none">Spectate</h1>
        <p className="mt-2 font-mono text-sm text-pit-muted">
          Demo seats only — no USDC, no payouts. Watch pits and test READY flow.
        </p>
      </section>

      <section className="border border-pit-border bg-pit-card p-5">
        <DemoJoin demoName={demoName} setDemoName={setDemoName} />
      </section>

      {canPlay && (
        <section className="border border-pit-border bg-pit-card">
          <div className="border-b border-pit-border px-4 py-3 font-mono text-sm text-pit-muted sm:px-5">
            ROOMS
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            {rooms.map((r) => (
              <Link
                key={r.id}
                href={roomHref("/rooms", r.id)}
                className={`block min-h-11 border border-pit-border bg-pit-bg p-4 active:bg-white/5 ${
                  r.id === roomId ? "border-pit-green/60 bg-pit-green/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-mono text-sm text-white">{r.name}</span>
                  <span
                    className={`shrink-0 font-mono text-sm ${
                      r.status === "locked" ? "text-pit-green" : "text-pit-muted"
                    }`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-sm text-pit-muted">
                  <span className="text-pit-green">{formatStakeUsd(r.stakeMicro)}</span>
                  <span>
                    {String(r.seated).padStart(2, "0")} / {String(r.maxPlayers).padStart(2, "0")}
                  </span>
                  {r.status === "locked" && (
                    <span className="text-pit-green">{formatRemaining(r.remainingMs)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function SpectatePage() {
  return (
    <Suspense fallback={<p className="text-pit-muted">Loading…</p>}>
      <SpectateContent />
    </Suspense>
  );
}
