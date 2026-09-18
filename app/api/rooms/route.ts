import { NextResponse } from "next/server";
import { roomStore } from "@/lib/room-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await roomStore.list();
  return NextResponse.json(data);
}
