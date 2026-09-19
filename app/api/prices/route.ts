import { NextResponse } from "next/server";
import {
  fightMarketQuote,
  fetchStockQuotes,
  PriceSource,
  resolveMarketPrice,
} from "@/lib/market-price";
import { StockId } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STOCK_IDS: StockId[] = ["AAPLX", "TSLAX", "NVDAX"];

function parseSource(raw: string | null): PriceSource | null {
  if (raw === "PYTH" || raw === "JUPITER" || raw === "PYTH_STALE") return raw;
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const stock = searchParams.get("stock") as StockId | null;
  const priceSource = parseSource(searchParams.get("priceSource"));

  try {
    if (stock && STOCK_IDS.includes(stock)) {
      const market = await fightMarketQuote(stock, priceSource ?? undefined);
      let quotes: { crypto: unknown; equity: unknown } | undefined;
      try {
        const bundle = await fetchStockQuotes(stock);
        quotes = { crypto: bundle.crypto, equity: bundle.equity };
      } catch {
        quotes = undefined;
      }
      return NextResponse.json(
        {
          stock,
          market,
          quotes,
          scoring: market,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    const crypto: Partial<Record<StockId, Awaited<ReturnType<typeof resolveMarketPrice>>>> = {};
    for (const id of STOCK_IDS) {
      crypto[id] = await resolveMarketPrice(id);
    }
    return NextResponse.json(
      { crypto, cluster: "mainnet-beta" },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "price fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
