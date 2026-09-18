import { NextRequest, NextResponse } from "next/server";
import { ensureWallet, getBalanceSync, requestWithdraw } from "@/lib/credits";
import { withDbAsync } from "@/lib/db";
import { isDemoPlayer } from "@/lib/player-id";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { pubkey?: string; amount?: number };

  if (!body.pubkey) {
    return NextResponse.json({ error: "pubkey required" }, { status: 400 });
  }

  if (isDemoPlayer(body.pubkey)) {
    return NextResponse.json({ error: "Connect a wallet to withdraw." }, { status: 400 });
  }

  const amount = body.amount ?? 0;
  const result = await requestWithdraw(body.pubkey, amount);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const balance = await withDbAsync((state) => {
    ensureWallet(state, body.pubkey!);
    return getBalanceSync(state, body.pubkey!);
  });

  return NextResponse.json({ withdrawalId: result.withdrawalId, balance });
}
