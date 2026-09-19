import { DEFAULT_ROOM_ID } from "./constants";
import { isPitRoomId } from "./room-names";

export function parseRoomId(raw: string | null | undefined): string {
  if (raw && isPitRoomId(raw)) return raw;
  return DEFAULT_ROOM_ID;
}

export function roomQuery(roomId: string): string {
  return `?room=${roomId}`;
}

export function roomHref(path: string, roomId: string): string {
  return `${path}${roomQuery(roomId)}`;
}
