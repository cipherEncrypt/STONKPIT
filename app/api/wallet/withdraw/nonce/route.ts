import { NextRequest, NextResponse } from "next/server";
import { buildWithdrawMessage } from "@/lib/withdraw-auth";
import { issueWithdrawNonce } from "@/lib/withdraw-nonce";
import { isDemoPlayer } from "@/lib/player-id";

export const dynamic = "force-dynamic";

/** Issue a short-lived nonce for withdraw message signing. */
export async function GET(req: NextRequest) {
  const pubkey = req.nextUrl.searchParams.get("pubkey");
  const amountMicroRaw = req.nextUrl.searchParams.get("amountMicro");

  if (!pubkey) {
    return NextResponse.json({ error: "pubkey required" }, { status: 400 });
  }

  if (isDemoPlayer(pubkey)) {
    return NextResponse.json({ error: "Demo users cannot withdraw." }, { status: 400 });
  }

  const amountMicro = amountMicroRaw ? Number(amountMicroRaw) : 0;
  if (!Number.isInteger(amountMicro) || amountMicro <= 0) {
    return NextResponse.json({ error: "amountMicro must be a positive integer" }, { status: 400 });
  }

  const nonce = issueWithdrawNonce(pubkey);
  const message = buildWithdrawMessage(amountMicro, nonce);

  return NextResponse.json({ nonce, message, amountMicro });
}
