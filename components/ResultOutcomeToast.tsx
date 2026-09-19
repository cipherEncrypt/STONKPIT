"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoom } from "@/components/useRoom";
import { useRoomId } from "@/components/useRoomId";
import { usePlayerId } from "@/components/usePlayerId";
import { buildFinalRanked, fightResultRows } from "@/lib/final-results";
import { walletPlayerCount } from "@/lib/payout-preview";
import {
  buildResultToastContent,
  hasSeenResultToast,
  markResultToastSeen,
  ResultToastCopy,
} from "@/lib/result-toast";
import { Room } from "@/lib/room-store";

function isFinalReady(room: Room | null): boolean {
  if (!room || room.status !== "ended") return false;
  if (room.results.length > 0) return true;
  return fightResultRows(room).length > 0;
}

export function ResultOutcomeToast() {
  const roomId = useRoomId();
  const { playerId } = usePlayerId();
  const { room, displayNames } = useRoom(roomId, 1000);
  const [visible, setVisible] = useState(false);
  const [copy, setCopy] = useState<ResultToastCopy | null>(null);

  const toastInput = useMemo(() => {
    if (!room || !playerId || !isFinalReady(room)) return null;
    const ranked = buildFinalRanked(room, room.stakeMicro);
    if (!ranked.length) return null;
    const rows = fightResultRows(room);
    return buildResultToastContent({
      playerId,
      ranked,
      displayNames,
      payingCount: walletPlayerCount(rows),
      stakeMicro: room.stakeMicro,
      seatedWallets: room.players.map((p) => p.wallet),
    });
  }, [room, playerId, displayNames]);

  const dismiss = useCallback(() => {
    if (playerId) markResultToastSeen(roomId, playerId);
    setVisible(false);
  }, [roomId, playerId]);

  useEffect(() => {
    if (!toastInput || !playerId) {
      setVisible(false);
      setCopy(null);
      return;
    }
    if (hasSeenResultToast(roomId, playerId)) {
      setVisible(false);
      return;
    }
    markResultToastSeen(roomId, playerId);
    setCopy(toastInput);
    setVisible(true);
  }, [toastInput, roomId, playerId]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(dismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [visible, dismiss]);

  if (!visible || !copy) return null;

  const win = copy.title === "You won" || copy.title === "Tied";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:left-auto md:right-4 md:top-20 md:max-w-sm md:justify-end md:p-0"
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="stonkpit-result-toast-title"
        aria-describedby="stonkpit-result-toast-body"
        className="pointer-events-auto w-full max-w-md border border-pit-border bg-pit-card p-5 shadow-lg shadow-black/40"
      >
        <p
          id="stonkpit-result-toast-title"
          className={`terminal-label ${win ? "text-pit-green" : "text-pit-red"}`}
        >
          {copy.title}
        </p>
        <p id="stonkpit-result-toast-body" className="mt-3 font-mono text-sm leading-relaxed text-white">
          {copy.body}
        </p>
        <button type="button" className="btn-primary mt-5 min-h-11 w-full" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
