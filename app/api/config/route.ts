import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Public runtime config — no NEXT_PUBLIC_ env vars needed. */
export async function GET() {
  return NextResponse.json(getAppConfig());
}
