"use client";

import { useCallback, useEffect, useState } from "react";
import type { BalanceView } from "@/lib/credits";
import { microToUsdc } from "@/lib/usdc";

export type DepositView = {
  signature: string;
  amount: number;
  amountMicro: number;
  slot: number;
  createdAt: number;
};

export function useCredits(pubkey: string | null, pollMs = 5000) {
  const [balance, setBalance] = useState<BalanceView | null>(null);
  const [deposits, setDeposits] = useState<DepositView[]>([]);
  const [treasury, setTreasury] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pubkey) {
      setBalance(null);
      setDeposits([]);
      setUsername(null);
      return;
    }
    try {
      const res = await fetch(`/api/wallet?pubkey=${encodeURIComponent(pubkey)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        balance?: BalanceView;
        deposits?: DepositView[];
        treasury?: string | null;
        username?: string | null;
        error?: string;
      };
      if (data.balance) setBalance(data.balance);
      setDeposits(data.deposits ?? []);
      setTreasury(data.treasury ?? null);
      setUsername(data.username ?? null);
      setError(data.error ?? null);
    } catch {
      setError("Could not load wallet.");
    }
  }, [pubkey]);

  useEffect(() => {
    refresh();
    if (!pubkey) return;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs, pubkey]);

  const confirmDeposit = useCallback(
    async (signature: string) => {
      if (!pubkey) throw new Error("Wallet not connected");
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, pubkey }),
      });
      const data = (await res.json()) as {
        error?: string;
        balance?: BalanceView;
        creditedMicro?: number;
      };
      if (data.error) throw new Error(data.error);
      if (data.balance) setBalance(data.balance);
      await refresh();
      return {
        credited: data.creditedMicro ? microToUsdc(data.creditedMicro) : 0,
        balance: data.balance,
      };
    },
    [pubkey, refresh],
  );

  const withdraw = useCallback(
    async (amount: number) => {
      if (!pubkey) throw new Error("Wallet not connected");
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey, amount }),
      });
      const data = (await res.json()) as { error?: string; balance?: BalanceView };
      if (data.error) throw new Error(data.error);
      if (data.balance) setBalance(data.balance);
      await refresh();
      return data;
    },
    [pubkey, refresh],
  );

  const setHandle = useCallback(
    async (handle: string) => {
      if (!pubkey) throw new Error("Wallet not connected");
      const res = await fetch("/api/wallet/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey, username: handle }),
      });
      const data = (await res.json()) as {
        error?: string;
        username?: string;
        balance?: BalanceView;
      };
      if (data.error) throw new Error(data.error);
      if (data.username) setUsername(data.username);
      if (data.balance) setBalance(data.balance);
      await refresh();
      return data.username!;
    },
    [pubkey, refresh],
  );

  return {
    balance,
    deposits,
    treasury,
    username,
    error,
    refresh,
    confirmDeposit,
    withdraw,
    setHandle,
  };
}
