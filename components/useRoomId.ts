"use client";

import { useSearchParams } from "next/navigation";
import { parseRoomId } from "@/lib/room-url";

export function useRoomId(): string {
  const params = useSearchParams();
  return parseRoomId(params.get("room"));
}
