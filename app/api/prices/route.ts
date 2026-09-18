import { NextResponse } from "next/server";
import { fetchAllCryptoPrices, fetchStockQuotes } from "@/lib/pyth";
import { StockId } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const stock = searchParams.get("stock") as StockId | null;

  try {
    if (stock && ["AAPLX", "TSLAX", "NVDAX"].includes(stock)) {
      const quotes = await fetchStockQuotes(stock);
      return NextResponse.json({ stock, quotes });
    }
    const crypto = await fetchAllCryptoPrices();
    return NextResponse.json({ crypto, cluster: "mainnet-beta" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "price fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
