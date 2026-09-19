"use client";

import Link from "next/link";
import { useRooms } from "@/components/useRooms";
import { formatStakeUsd } from "@/lib/format-stake";
import { formatRemaining } from "@/lib/room-clock";
import { roomHref } from "@/lib/room-url";

function statusLabel(status: string): string {
  if (status === "open") return "OPEN";
  if (status === "locked") return "LIVE";
  return "FINAL";
}

export function HomeRoomsStrip() {
  const { rooms } = useRooms(5000);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rooms.map((r) => (
        <Link
          key={r.id}
          href={roomHref("/rooms", r.id)}
          className="block min-h-11 border border-pit-border bg-pit-bg p-4 transition-colors active:border-pit-green/50 active:bg-pit-green/5"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="truncate font-mono text-sm font-medium text-white">{r.name}</span>
            <span
              className={`shrink-0 font-mono text-xs ${
                r.status === "locked" ? "text-pit-green" : "text-pit-muted"
              }`}
            >
              {statusLabel(r.status)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm">
            <span className="text-pit-green">{formatStakeUsd(r.stakeMicro)}</span>
            <span className="text-pit-muted">
              {String(r.seated).padStart(2, "0")} / {String(r.maxPlayers).padStart(2, "0")} seated
            </span>
            {r.status === "locked" && (
              <span className="text-pit-green">{formatRemaining(r.remainingMs)}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
