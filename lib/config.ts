import { serverRpcUrl } from "./rpc";

const DEFAULT_ROOM_DURATION = 300;

export type AppConfig = {
  rpcUrl: string;
  treasuryAddress: string | null;
  roomDurationSecs: number;
};

export function roomDurationSecs(): number {
  const raw = process.env.ROOM_DURATION;
  const n = raw ? parseInt(raw, 10) : DEFAULT_ROOM_DURATION;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROOM_DURATION;
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
