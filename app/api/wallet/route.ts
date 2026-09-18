import { NextRequest, NextResponse } from "next/server";
import { ensureWallet, getBalanceSync, listDepositsForPubkey } from "@/lib/credits";
import { withDbAsync } from "@/lib/db";
import { publicTreasuryAddress } from "@/lib/deposit";
import { isDemoPlayer } from "@/lib/player-id";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const pubkey = req.nextUrl.searchParams.get("pubkey");
  if (!pubkey) {
    return NextResponse.json({ error: "pubkey required" }, { status: 400 });
  }

  if (isDemoPlayer(pubkey)) {
    return NextResponse.json({
      balance: {
        pubkey,
        available: 0,
        frozen: 0,
        total: 0,
        availableMicro: 0,
        frozenMicro: 0,
      },
      deposits: [],
      treasury: publicTreasuryAddress(),
      isWallet: false,
    });
  }

  const data = await withDbAsync((state) => {
    ensureWallet(state, pubkey);
    const row = state.wallets[pubkey];
    return {
      balance: getBalanceSync(state, pubkey),
      deposits: listDepositsForPubkey(state, pubkey),
      username: row?.username ?? null,
    };
  });

  return NextResponse.json({
    ...data,
    treasury: publicTreasuryAddress(),
    isWallet: true,
  });
}
