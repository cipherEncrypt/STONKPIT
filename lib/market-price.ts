import { fetchJupiterQuote } from "./jupiter-quote";
import {
  fetchBestHermesQuote,
  fetchBestOnChainQuote,
  fetchStockQuotes,
  PythQuote,
} from "./pyth";
import { feedAgeSeconds } from "./pyth-feed-status";
import { StockId } from "./constants";

export type PriceSource = "PYTH" | "JUPITER" | "PYTH_STALE";

export type MarketQuote = {
  price: number;
  publishTime: number;
  feedName: string;
  priceSource: PriceSource;
};

const LIVE_CACHE_MS = 2000;
const PYTH_LIVE_MAX_AGE_SEC = 120;

type CacheEntry = { at: number; quote: MarketQuote };

const autoCache = new Map<string, CacheEntry>();

function cacheKey(stockId: StockId, source?: PriceSource): string {
  return source ? `${stockId}:${source}` : stockId;
}

function fromPyth(q: PythQuote, priceSource: PriceSource): MarketQuote {
  return {
    price: q.price,
    publishTime: q.publishTime,
    feedName: q.feedName,
    priceSource,
  };
}

function fromJupiter(j: Awaited<ReturnType<typeof fetchJupiterQuote>>): MarketQuote {
  return {
    price: j.price,
    publishTime: j.publishTime,
    feedName: j.feedName,
    priceSource: "JUPITER",
  };
}

/** Hermes HTTP 200 only, publish age ≤ 2 minutes. */
export async function fetchFreshHermesQuote(
  stockId: StockId,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<PythQuote | null> {
  const hermes = await fetchBestHermesQuote(stockId);
  if (!hermes) return null;
  if (feedAgeSeconds(hermes.publishTime, nowSec) > PYTH_LIVE_MAX_AGE_SEC) return null;
  return hermes;
}

export function pickMarketTier(
  hermes: { publishTime: number } | null,
  jupiterOk: boolean,
  onchain: { publishTime: number } | null,
  nowSec: number,
): PriceSource | null {
  if (hermes && feedAgeSeconds(hermes.publishTime, nowSec) <= PYTH_LIVE_MAX_AGE_SEC) {
    return "PYTH";
  }
  if (jupiterOk) return "JUPITER";
  if (onchain) return "PYTH_STALE";
  return null;
}

/** Single chooser for lock, live poll, settle, and price:ping. */
export async function chooseMarketQuote(
  stockId: StockId,
  lockedSource?: PriceSource | null,
): Promise<MarketQuote> {
  return fightMarketQuote(stockId, lockedSource);
}

/** Source of truth: { price, priceSource, publishTime, feedName } */
export async function fightMarketQuote(
  stockId: StockId,
  lockedSource?: PriceSource | null,
): Promise<MarketQuote> {
  if (lockedSource) return fetchMarketPrice(stockId, lockedSource);
  return resolveMarketPrice(stockId);
}

/** Pick tier for a new fight snapshot (no forced source). */
export async function resolveMarketPrice(stockId: StockId): Promise<MarketQuote> {
  const now = Date.now();
  const hit = autoCache.get(cacheKey(stockId));
  if (hit && now - hit.at < LIVE_CACHE_MS) return hit.quote;

  const nowSec = Math.floor(now / 1000);
  const hermes = await fetchFreshHermesQuote(stockId, nowSec);
  let jupiterOk = false;
  let jupiterResult: Awaited<ReturnType<typeof fetchJupiterQuote>> | null = null;
  try {
    jupiterResult = await fetchJupiterQuote(stockId);
    jupiterOk = true;
  } catch {
    jupiterOk = false;
  }
  const onchain = await fetchBestOnChainQuote(stockId);
  const tier = pickMarketTier(hermes, jupiterOk, onchain, nowSec);
  if (!tier) throw new Error(`No market price for ${stockId}`);

  let quote: MarketQuote;
  if (tier === "PYTH" && hermes) quote = fromPyth(hermes, "PYTH");
  else if (tier === "JUPITER" && jupiterResult) quote = fromJupiter(jupiterResult);
  else if (tier === "PYTH_STALE" && onchain) quote = fromPyth(onchain, "PYTH_STALE");
  else throw new Error(`No market price for ${stockId}`);

  autoCache.set(cacheKey(stockId), { at: now, quote });
  return quote;
}

/** Same source for start + end of a fight. */
export async function fetchMarketPrice(
  stockId: StockId,
  source: PriceSource,
): Promise<MarketQuote> {
  const now = Date.now();
  const key = cacheKey(stockId, source);
  const hit = autoCache.get(key);
  if (hit && now - hit.at < LIVE_CACHE_MS) return hit.quote;

  let quote: MarketQuote;
  switch (source) {
    case "PYTH": {
      const h = await fetchFreshHermesQuote(stockId);
      if (!h) throw new Error(`Fresh Hermes price unavailable for ${stockId}`);
      quote = fromPyth(h, "PYTH");
      break;
    }
    case "JUPITER": {
      quote = fromJupiter(await fetchJupiterQuote(stockId));
      break;
    }
    case "PYTH_STALE": {
      const o = await fetchBestOnChainQuote(stockId);
      if (!o) throw new Error(`On-chain Pyth unavailable for ${stockId}`);
      quote = fromPyth(o, "PYTH_STALE");
      break;
    }
    default:
      throw new Error(`Unknown price source ${source}`);
  }
  autoCache.set(key, { at: now, quote });
  return quote;
}

export async function snapshotStocks(
  stockIds: StockId[],
): Promise<Record<StockId, MarketQuote>> {
  const out: Partial<Record<StockId, MarketQuote>> = {};
  for (const id of stockIds) {
    out[id] = await resolveMarketPrice(id);
  }
  return out as Record<StockId, MarketQuote>;
}

export async function snapshotStocksWithSources(
  stockIds: StockId[],
  sources: Partial<Record<StockId, PriceSource>>,
): Promise<Record<StockId, MarketQuote>> {
  const out: Partial<Record<StockId, MarketQuote>> = {};
  for (const id of stockIds) {
    out[id] = await chooseMarketQuote(id, sources[id]);
  }
  return out as Record<StockId, MarketQuote>;
}

export type PriceDiagnostics = {
  stockId: StockId;
  hermes: PythQuote | null;
  hermesAgeSec: number | null;
  onchain: PythQuote | null;
  onchainAgeSec: number | null;
  jupiterPrice: number | null;
  jupiterError: string | null;
  chosen: MarketQuote | null;
  chosenSource: PriceSource | null;
};

export async function diagnoseStock(stockId: StockId): Promise<PriceDiagnostics> {
  const nowSec = Math.floor(Date.now() / 1000);
  const bestHermes = await fetchBestHermesQuote(stockId);
  const hermes = await fetchFreshHermesQuote(stockId, nowSec);
  const onchain = await fetchBestOnChainQuote(stockId);
  let jupiterPrice: number | null = null;
  let jupiterError: string | null = null;
  try {
    const j = await fetchJupiterQuote(stockId);
    jupiterPrice = j.price;
  } catch (e) {
    jupiterError = e instanceof Error ? e.message : "Jupiter failed";
  }
  const tier = pickMarketTier(hermes, jupiterPrice != null, onchain, nowSec);
  let chosen: MarketQuote | null = null;
  let chosenSource: PriceSource | null = tier;
  if (tier === "PYTH" && hermes) chosen = fromPyth(hermes, "PYTH");
  else if (tier === "JUPITER" && jupiterPrice != null) {
    chosen = {
      price: jupiterPrice,
      publishTime: nowSec,
      feedName: `Jupiter ${stockId}→USDC`,
      priceSource: "JUPITER",
    };
  } else if (tier === "PYTH_STALE" && onchain) chosen = fromPyth(onchain, "PYTH_STALE");

  return {
    stockId,
    hermes: bestHermes,
    hermesAgeSec: bestHermes ? feedAgeSeconds(bestHermes.publishTime, nowSec) : null,
    onchain,
    onchainAgeSec: onchain ? feedAgeSeconds(onchain.publishTime, nowSec) : null,
    jupiterPrice,
    jupiterError,
    chosen,
    chosenSource,
  };
}

/** Pyth display legs (pick / feeds panel) — not used for fight scoring. */
export { fetchStockQuotes };
