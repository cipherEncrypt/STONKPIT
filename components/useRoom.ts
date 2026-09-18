"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room } from "@/lib/room-store";
import { StockId } from "@/lib/constants";

export type RoomSnapshot = {
  room: Room;
  serverNow: number;
  remainingMs: number;
  suggestedRoom?: string;
  displayNames?: Record<string, string>;
};

const POLL_MS = 1000;

export function useRoom(roomId: string, pollMs = POLL_MS) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clockOffsetRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/room?room=${roomId}`, { cache: "no-store" });
      const data = (await res.json()) as RoomSnapshot & { error?: string };
      if (data.room) {
        clockOffsetRef.current = data.serverNow - Date.now();
        setSnapshot(data);
        setError(null);
      }
    } catch {
      setError("Could not reach pit server.");
    }
  }, [roomId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const room = snapshot?.room ?? null;
  const serverNow = snapshot?.serverNow ?? null;
  const remainingMs = snapshot?.remainingMs ?? 0;
  const displayNames = snapshot?.displayNames ?? {};

  const getRemainingMs = useCallback(() => {
    if (!room?.endTs || room.status !== "locked") return 0;
    const now = Date.now() + clockOffsetRef.current;
    return Math.max(0, room.endTs - now);
  }, [room]);

  const join = useCallback(
    async (wallet: string, stock: StockId) => {
      const res = await fetch(`/api/room?room=${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", wallet, stock }),
      });
      const data = (await res.json()) as RoomSnapshot & { error?: string; nextRoom?: string };
      if (data.room) {
        clockOffsetRef.current = (data.serverNow ?? Date.now()) - Date.now();
        setSnapshot(data);
      }
      if (data.error) throw new Error(data.error);
      return data.room;
    },
    [roomId],
  );

  const setReady = useCallback(
    async (wallet: string) => {
      const res = await fetch(`/api/room?room=${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ready", wallet }),
      });
      const data = (await res.json()) as RoomSnapshot & { error?: string; started?: boolean };
      if (data.room) {
        clockOffsetRef.current = (data.serverNow ?? Date.now()) - Date.now();
        setSnapshot(data);
      }
      if (data.error) throw new Error(data.error);
      return data;
    },
    [roomId],
  );

  const reset = useCallback(async () => {
    const res = await fetch(`/api/room?room=${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    const data = (await res.json()) as RoomSnapshot;
    if (data.room) setSnapshot(data);
    return data.room;
  }, [roomId]);

  return {
    room,
    serverNow,
    remainingMs,
    displayNames,
    getRemainingMs,
    clockOffset: clockOffsetRef.current,
    error,
    refresh,
    join,
    setReady,
    reset,
  };
}
