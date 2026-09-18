export const DEMO_PREFIX = "demo:";

export function isDemoPlayer(id: string): boolean {
  return id.startsWith(DEMO_PREFIX);
}

export function demoPlayerId(displayName: string): string {
  return `${DEMO_PREFIX}${displayName.trim().slice(0, 24)}`;
}

export function displayPlayer(id: string): string {
  if (isDemoPlayer(id)) return id.slice(DEMO_PREFIX.length);
  if (id.length <= 12) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
