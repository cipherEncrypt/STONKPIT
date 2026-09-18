"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";
import { demoPlayerId, displayPlayer } from "@/lib/player-id";

const DEMO_STORAGE_KEY = "stonkpit-demo-name";

export function usePlayerId() {
  const { publicKey, connected } = useWallet();
  const [demoName, setDemoNameState] = useState("");

  useEffect(() => {
    setDemoNameState(sessionStorage.getItem(DEMO_STORAGE_KEY) ?? "");
  }, []);

  const setDemoName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    sessionStorage.setItem(DEMO_STORAGE_KEY, trimmed);
    setDemoNameState(trimmed);
  }, []);

  const clearDemoName = useCallback(() => {
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
    setDemoNameState("");
  }, []);

  const playerId =
    connected && publicKey
      ? publicKey.toBase58()
      : demoName
        ? demoPlayerId(demoName)
        : null;

  const displayName = playerId ? displayPlayer(playerId) : null;

  return {
    playerId,
    displayName,
    demoName,
    setDemoName,
    clearDemoName,
    connected,
    isDemo: !!(playerId && playerId.startsWith("demo:")),
    canPlay: !!playerId,
  };
}
