import { NextRequest, NextResponse } from "next/server";
import { parseRoomId } from "@/lib/room-url";
import { roomStore } from "@/lib/room-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const roomId = parseRoomId(req.nextUrl.searchParams.get("room"));
  try {
    const { room, live } = await roomStore.liveMarketQuotes(roomId);
    if (room.status !== "locked") {
      return NextResponse.json({ error: "room not live" }, { status: 400 });
    }
    return NextResponse.json(
      { roomId, live, startQuotes: room.startQuotes, startPrices: room.startPrices },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "live prices failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
