import { NextRequest, NextResponse } from "next/server";
import { ensureWallet, getBalanceSync } from "@/lib/credits";
import { withDbAsync } from "@/lib/db";
import { isDemoPlayer } from "@/lib/player-id";
import { setUsernameOnWallet } from "@/lib/username";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { pubkey?: string; username?: string };

  if (!body.pubkey || !body.username) {
    return NextResponse.json({ error: "pubkey and username required" }, { status: 400 });
  }

  if (isDemoPlayer(body.pubkey)) {
    return NextResponse.json({ error: "Demo spectate does not use handles." }, { status: 400 });
  }

  const result = await withDbAsync((state) => {
    ensureWallet(state, body.pubkey!);
    return setUsernameOnWallet(state.wallets, body.pubkey!, body.username!.trim());
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const balance = await withDbAsync((state) => getBalanceSync(state, body.pubkey!));

  return NextResponse.json({ username: result.username, balance });
}
