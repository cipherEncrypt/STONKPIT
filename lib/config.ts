import { serverRpcUrl } from "./rpc";

/** All pits — 3 minutes unless overridden in env. */
const DEFAULT_ROOM_DURATION = 180;

export type AppConfig = {
  rpcUrl: string;
  treasuryAddress: string | null;
  roomDurationSecs: number;
};

function parseDurationSecs(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Server timer + endTs — keep in sync with NEXT_PUBLIC_ROOM_DURATION. */
export function roomDurationSecs(): number {
  return (
    parseDurationSecs(process.env.ROOM_DURATION) ??
    parseDurationSecs(process.env.NEXT_PUBLIC_ROOM_DURATION) ??
    DEFAULT_ROOM_DURATION
  );
}

export function roomDurationMs(): number {
  return roomDurationSecs() * 1000;
}

export function treasuryAddress(): string | null {
  return process.env.TREASURY_USDC_ADDRESS ?? null;
}

export function getAppConfig(): AppConfig {
  return {
    rpcUrl: serverRpcUrl(),
    treasuryAddress: treasuryAddress(),
    roomDurationSecs: roomDurationSecs(),
  };
}
