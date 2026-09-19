/** Fixed pit ladder — exactly five rooms, no user-created rooms. */
export type PitRoomDef = {
  id: string;
  name: string;
  maxPlayers: number;
  stakeMicro: number;
};

export const PIT_ROOMS: PitRoomDef[] = [
  { id: "1", name: "Opening Bell", maxPlayers: 5, stakeMicro: 1_000_000 },
  { id: "2", name: "After Hours", maxPlayers: 5, stakeMicro: 5_000_000 },
  { id: "3", name: "Green Tape", maxPlayers: 8, stakeMicro: 10_000_000 },
  { id: "4", name: "Red Pit", maxPlayers: 15, stakeMicro: 25_000_000 },
  { id: "5", name: "Tesla Cage", maxPlayers: 20, stakeMicro: 50_000_000 },
];

export const PIT_ROOM_IDS = PIT_ROOMS.map((r) => r.id);

export function pitRoomDef(id: string): PitRoomDef | null {
  return PIT_ROOMS.find((r) => r.id === id) ?? null;
}

export function isPitRoomId(id: string): boolean {
  return PIT_ROOM_IDS.includes(id);
}

/** @deprecated use pitRoomDef */
export const SEED_ROOMS = PIT_ROOMS;

export function seedNameForId(id: string): string | null {
  return pitRoomDef(id)?.name ?? null;
}

export function seedMaxForId(id: string): number | null {
  return pitRoomDef(id)?.maxPlayers ?? null;
}

export function seedStakeMicroForId(id: string): number | null {
  return pitRoomDef(id)?.stakeMicro ?? null;
}
