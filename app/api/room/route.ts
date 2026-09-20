import { NextRequest, NextResponse } from "next/server";
import { StockId } from "@/lib/constants";
import { displayNamesForWallets } from "@/lib/display-names";
import { withDbAsync } from "@/lib/db";
import { parseRoomId } from "@/lib/room-url";
import { roomStore } from "@/lib/room-store";
import { isDemoPlayer } from "@/lib/player-id";
import { assertValidPlayerId } from "@/lib/pubkey-valid";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function roomIdFrom(req: NextRequest): string {
  return parseRoomId(req.nextUrl.searchParams.get("room"));
}

async function withDisplayNames(room: import("@/lib/room-store").Room) {
  const wallets = [
    ...room.players.map((p) => p.wallet),
    ...room.results.map((r) => r.wallet),
  ];
  const displayNames = await withDbAsync((state) =>
    displayNamesForWallets(state.wallets, wallets),
  );
  return displayNames;
}

export async function GET(req: NextRequest) {
  const id = roomIdFrom(req);
  const { room, serverNow, remainingMs } = await roomStore.get(id);
  const suggested = await roomStore.suggestOpenRoom(id);
  const displayNames = await withDisplayNames(room);
  return NextResponse.json({ room, serverNow, remainingMs, suggestedRoom: suggested, displayNames });
}

export async function POST(req: NextRequest) {
  const id = roomIdFrom(req);
  const body = (await req.json()) as {
    action: "join" | "reset" | "ready";
    wallet?: string;
    stock?: StockId;
  };

  if (body.action === "reset") {
    const room = await roomStore.reset(id);
    const snap = await roomStore.get(id);
    const displayNames = await withDisplayNames(snap.room);
    return NextResponse.json({ ...snap, displayNames });
  }

  if (body.action === "ready") {
    if (!body.wallet) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }
    try {
      assertValidPlayerId(body.wallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet or demo id." }, { status: 400 });
    }
    const { room, error, started } = await roomStore.setReady(id, body.wallet);
    if (error) return NextResponse.json({ room, error }, { status: 400 });
    const snap = await roomStore.get(id);
    const displayNames = await withDisplayNames(snap.room);
    return NextResponse.json({ ...snap, started, displayNames });
  }

  if (body.action === "join") {
    if (!body.wallet || !body.stock) {
      return NextResponse.json({ error: "wallet and stock required" }, { status: 400 });
    }
    try {
      assertValidPlayerId(body.wallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet or demo id." }, { status: 400 });
    }
    if (!isDemoPlayer(body.wallet) && !checkRateLimit("join", body.wallet)) {
      return NextResponse.json({ error: "Too many join attempts. Wait a minute." }, { status: 429 });
    }
    const { room, error, nextRoom } = await roomStore.join(id, body.wallet, body.stock);
    if (error) {
      return NextResponse.json({ room, error, nextRoom }, { status: 400 });
    }
    const snap = await roomStore.get(id);
    const displayNames = await withDisplayNames(snap.room);
    return NextResponse.json({ ...snap, displayNames });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
