import { Room } from "./room-store";

export function serverNowMs(): number {
  return Date.now();
}

/** Remaining ms until endTs; 0 if not LIVE. */
export function remainingMs(room: Room, nowMs: number = serverNowMs()): number {
  if (room.status !== "locked" || room.endTs == null) return 0;
  return Math.max(0, room.endTs - nowMs);
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
