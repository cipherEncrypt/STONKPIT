import { NextRequest, NextResponse } from "next/server";
import { creditDeposit } from "@/lib/credits";
import { withDbAsync } from "@/lib/db";
import { verifyUsdcDeposit } from "@/lib/deposit";
import { isDemoPlayer } from "@/lib/player-id";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { signature?: string; pubkey?: string };

  if (!body.pubkey || !body.signature?.trim()) {
    return NextResponse.json({ error: "signature and pubkey required" }, { status: 400 });
  }

  if (isDemoPlayer(body.pubkey)) {
    return NextResponse.json(
      { error: "Demo names cannot deposit. Connect a Solana wallet." },
      { status: 400 },
    );
  }

  const signature = body.signature.trim();
  const pubkey = body.pubkey;

  const verified = await verifyUsdcDeposit(signature, pubkey);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  const result = await withDbAsync((state) => {
    if (state.deposits[signature]) {
      const existing = state.deposits[signature];
      if (existing.pubkey !== pubkey) {
        return {
          ok: false as const,
          error: "This deposit signature is already credited to another wallet.",
        };
      }
      return { ok: false as const, error: "Deposit already credited." };
    }
    return creditDeposit(state, pubkey, verified.amountMicro, signature, verified.slot);
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    balance: result.balance,
    creditedMicro: verified.amountMicro,
    signature,
  });
}
