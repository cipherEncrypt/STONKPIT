import { PYTH_HERMES, STOCKS, StockId } from "./constants";
import { fetchOnChainPrice } from "./pyth-onchain";

export type PythQuote = {
  price: number;
  conf: number;
  publishTime: number;
  feedName: string;
  feedId: string;
  source: "hermes" | "on-chain";
};

type HermesPrice = {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
};

type HermesParsed = {
  id: string;
  price: HermesPrice;
};

function parseHermes(
  parsed: HermesParsed,
  feedName: string,
): PythQuote {
  const p = parsed.price;
  const factor = 10 ** Math.abs(p.expo);
  return {
    price: Number(p.price) / factor,
    conf: Number(p.conf) / factor,
    publishTime: p.publish_time,
    feedName,
    feedId: parsed.id.replace(/^0x/, ""),
    source: "hermes",
  };
}

function hermesHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/json" };
  const key = process.env.PYTH_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function fetchHermesLatest(
  feedIds: string[],
): Promise<Map<string, HermesParsed>> {
  const params = feedIds.map((id) => `ids[]=${id}`).join("&");
  const url = `${PYTH_HERMES}/v2/updates/price/latest?${params}&parsed=true`;
  const res = await fetch(url, { headers: hermesHeaders(), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Hermes ${res.status}`);
  }
  const body = (await res.json()) as { parsed?: HermesParsed[] };
  const map = new Map<string, HermesParsed>();
  for (const p of body.parsed ?? []) {
    map.set(p.id.replace(/^0x/, ""), p);
  }
  return map;
}

async function fetchQuote(feedId: string, feedName: string): Promise<PythQuote> {
  try {
    const map = await fetchHermesLatest([feedId]);
    const raw = map.get(feedId);
    if (raw) return parseHermes(raw, feedName);
  } catch {
    /* fall through to on-chain */
  }
  const onChain = await fetchOnChainPrice(feedId, feedName);
  return { ...onChain, source: "on-chain" };
}

export async function fetchStockQuotes(stockId: StockId): Promise<{
  crypto: PythQuote;
  equity: PythQuote;
}> {
  const s = STOCKS[stockId];
  const [crypto, equity] = await Promise.all([
    fetchQuote(s.cryptoFeedId, s.cryptoSymbol),
    fetchQuote(s.equityFeedId, s.equitySymbol),
  ]);
  return { crypto, equity };
}

export async function fetchAllCryptoPrices(): Promise<
  Record<StockId, PythQuote>
> {
  const entries = await Promise.all(
    (Object.keys(STOCKS) as StockId[]).map(async (id) => {
      const s = STOCKS[id];
      const q = await fetchQuote(s.cryptoFeedId, s.cryptoSymbol);
      return [id, q] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<StockId, PythQuote>;
}

export async function snapshotPrices(
  stockIds: StockId[],
): Promise<Record<StockId, number>> {
  const quotes = await fetchAllCryptoPrices();
  const snap: Partial<Record<StockId, number>> = {};
  for (const id of stockIds) {
    if (quotes[id]) snap[id] = quotes[id].price;
  }
  return snap as Record<StockId, number>;
}
