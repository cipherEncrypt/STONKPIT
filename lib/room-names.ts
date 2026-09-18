import { CreateRoomSize } from "./constants";

export type SeedRoom = {
  id: string;
  name: string;
  maxPlayers: CreateRoomSize;
};

export const SEED_ROOMS: SeedRoom[] = [
  { id: "1", name: "Opening Bell", maxPlayers: 5 },
  { id: "2", name: "After Hours", maxPlayers: 5 },
  { id: "3", name: "Green Tape", maxPlayers: 5 },
  { id: "4", name: "Red Pit", maxPlayers: 5 },
  { id: "5", name: "Tesla Cage", maxPlayers: 8 },
];

const TEMPLATES_5 = ["Opening Bell", "After Hours", "Green Tape", "Red Pit"];
const TEMPLATES_8 = ["Tesla Cage"];

/** Next unused room name for a given seat cap. */
export function nextRoomName(existingNames: string[], maxPlayers: CreateRoomSize): string {
  const templates = maxPlayers === 8 ? TEMPLATES_8 : TEMPLATES_5;
  const used = new Set(existingNames);

  for (const base of templates) {
    if (!used.has(base)) return base;
  }

  for (const base of templates) {
    for (let n = 2; n <= 99; n++) {
      const candidate = `${base} ${n}`;
      if (!used.has(candidate)) return candidate;
    }
  }

  return `${templates[0]} ${Date.now()}`;
}

export function seedNameForId(id: string): string | null {
  return SEED_ROOMS.find((s) => s.id === id)?.name ?? null;
}

export function seedMaxForId(id: string): CreateRoomSize | null {
  return SEED_ROOMS.find((s) => s.id === id)?.maxPlayers ?? null;
}
