"use client";

import { useCallback, useEffect, useState } from "react";
import type { BalanceView, WithdrawalView } from "@/lib/credits";
import { microToUsdc, usdcToMicro } from "@/lib/usdc";
import { buildWithdrawMessage } from "@/lib/withdraw-auth";
import bs58 from "bs58";

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
  const [withdrawals, setWithdrawals] = useState<WithdrawalView[]>([]);
  const [treasury, setTreasury] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pubkey) {
      setBalance(null);
      setDeposits([]);
      setWithdrawals([]);
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
        withdrawals?: WithdrawalView[];
        treasury?: string | null;
        username?: string | null;
        error?: string;
      };
      if (data.balance) setBalance(data.balance);
      setDeposits(data.deposits ?? []);
      setWithdrawals(data.withdrawals ?? []);
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
    async (amountUsdc: number, signMessage: (message: Uint8Array) => Promise<Uint8Array>) => {
      if (!pubkey) throw new Error("Wallet not connected");
      const amountMicro = usdcToMicro(amountUsdc);
      if (amountMicro <= 0) throw new Error("Amount must be positive.");

      const nonceRes = await fetch(
        `/api/wallet/withdraw/nonce?pubkey=${encodeURIComponent(pubkey)}&amountMicro=${amountMicro}`,
        { cache: "no-store" },
      );
      const nonceData = (await nonceRes.json()) as { error?: string; nonce?: string };
      if (nonceData.error || !nonceData.nonce) {
        throw new Error(nonceData.error ?? "Could not get withdraw nonce.");
      }

      const message = new TextEncoder().encode(
        buildWithdrawMessage(amountMicro, nonceData.nonce),
      );
      const signed = await signMessage(message);
      const signature = bs58.encode(signed);

      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey,
          amountMicro,
          nonce: nonceData.nonce,
          signature,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        balance?: BalanceView;
        withdrawals?: WithdrawalView[];
      };
      if (data.error) throw new Error(data.error);
      if (data.balance) setBalance(data.balance);
      if (data.withdrawals) setWithdrawals(data.withdrawals);
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
    withdrawals,
    treasury,
    username,
    error,
    refresh,
    confirmDeposit,
    withdraw,
    setHandle,
  };
}
