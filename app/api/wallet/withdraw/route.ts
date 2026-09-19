import { NextRequest, NextResponse } from "next/server";
import { ensureWallet, getBalanceSync, listWithdrawalsForPubkey, requestWithdrawMicro } from "@/lib/credits";
import { withDbAsync } from "@/lib/db";
import { isDemoPlayer } from "@/lib/player-id";
import { verifyWithdrawSignature } from "@/lib/withdraw-auth";
import { consumeWithdrawNonce } from "@/lib/withdraw-nonce";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    pubkey?: string;
    amountMicro?: number;
    nonce?: string;
    signature?: string;
  };

  if (!body.pubkey || body.amountMicro === undefined || !body.nonce || !body.signature) {
    return NextResponse.json(
      { error: "pubkey, amountMicro, nonce, and signature required" },
      { status: 400 },
    );
  }

  if (isDemoPlayer(body.pubkey)) {
    return NextResponse.json({ error: "Connect a wallet to withdraw." }, { status: 400 });
  }

  const amountMicro = body.amountMicro;
  if (!Number.isInteger(amountMicro) || amountMicro <= 0) {
    return NextResponse.json({ error: "amountMicro must be a positive integer" }, { status: 400 });
  }

  if (!verifyWithdrawSignature(body.pubkey, amountMicro, body.nonce, body.signature)) {
    return NextResponse.json(
      { error: "Withdraw signature does not match wallet or amount." },
      { status: 403 },
    );
  }

  if (!consumeWithdrawNonce(body.pubkey, body.nonce)) {
    return NextResponse.json({ error: "Invalid or expired withdraw nonce." }, { status: 401 });
  }

  const result = await withDbAsync((state) =>
    requestWithdrawMicro(state, body.pubkey!, amountMicro),
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const data = await withDbAsync((state) => {
    ensureWallet(state, body.pubkey!);
    return {
      balance: getBalanceSync(state, body.pubkey!),
      withdrawals: listWithdrawalsForPubkey(state, body.pubkey!),
    };
  });

  return NextResponse.json({ withdrawalId: result.withdrawalId, ...data });
}
