import type { PitRoomDef } from "./room-names";
import type { Room } from "./room-store";

export function emptyRoomExport(def: PitRoomDef): Room {
  return {
    id: def.id,
    name: def.name,
    maxPlayers: def.maxPlayers,
    stakeMicro: def.stakeMicro,
    status: "open",
    players: [],
    startTs: null,
    endTs: null,
    startPrices: {},
    endPrices: {},
    startQuotes: {},
    endQuotes: {},
    results: [],
    winners: [],
  };
}
