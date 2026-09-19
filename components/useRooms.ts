"use client";

import { useCallback, useEffect, useState } from "react";
import { RoomSummary } from "@/lib/room-store";

const POLL_MS = 1000;

export function useRooms(pollMs = POLL_MS) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [serverNow, setServerNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      const data = (await res.json()) as { rooms: RoomSummary[]; serverNow: number };
      setRooms(data.rooms);
      setServerNow(data.serverNow);
      setError(null);
    } catch {
      setError("Could not load rooms.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { rooms, serverNow, error, refresh };
}
