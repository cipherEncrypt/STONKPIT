import { PYTH_HERMES, STOCKS, StockId } from "./constants";
import { feedAccountAddress, fetchOnChainPrice } from "./pyth-onchain";

export type PythQuote = {
  price: number;
  conf: number;
  publishTime: number;
  feedName: string;
  feedId: string;
  source: "hermes" | "on-chain";
};

export type PythCandidate = PythQuote & {
  error?: string;
  fetchUrl?: string;
  onChainAccount?: string;
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

const LIVE_CACHE_MS = 2000;

let hermesAuthWarned = false;

function normalizeFeedId(feedId: string): string {
  return feedId.replace(/^0x/i, "").toLowerCase();
}

function hermesIdParam(feedId: string): string {
  return `0x${normalizeFeedId(feedId)}`;
}

function hermesBaseUrl(): string {
  return process.env.PYTH_HERMES_URL?.replace(/\/$/, "") ?? PYTH_HERMES;
}

export function buildHermesLatestUrl(feedIds: string[]): string {
  const params = feedIds.map((id) => `ids[]=${encodeURIComponent(hermesIdParam(id))}`).join("&");
  return `${hermesBaseUrl()}/v2/updates/price/latest?${params}&parsed=true`;
}

function hermesApiKey(): string | undefined {
  const key = process.env.PYTH_API_KEY?.trim();
  return key || undefined;
}

function hermesHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/json" };
  const key = hermesApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function parseHermes(parsed: HermesParsed, feedName: string): PythQuote {
  const p = parsed.price;
  const factor = 10 ** Math.abs(p.expo);
  return {
    price: Number(p.price) / factor,
    conf: Number(p.conf) / factor,
    publishTime: p.publish_time,
    feedName,
    feedId: normalizeFeedId(parsed.id),
    source: "hermes",
  };
}

async function fetchHermesLatest(feedIds: string[]): Promise<Map<string, HermesParsed>> {
  const url = buildHermesLatestUrl(feedIds);
  const res = await fetch(url, { headers: hermesHeaders(), cache: "no-store" });
  const bodyText = await res.text();
  if (res.status === 401) {
    if (!hermesAuthWarned) {
      const hint = hermesApiKey()
        ? "key is set but rejected — check value at https://docs.pyth.network/"
        : "PYTH_API_KEY missing (Next loads .env; for npm run pyth:ping use project .env)";
      console.warn(`[pyth] Hermes 401 — ${hint}`);
      hermesAuthWarned = true;
    }
    throw new Error(`Hermes unauthorized (401) — ${url}`);
  }
  if (res.status === 403) {
    const detail = bodyText.replace(/\s+/g, " ").slice(0, 200);
    throw new Error(
      `Hermes not entitled (403) — Crypto.*X feeds often need a paid Pyth grant; Equity.US.* may still work. ${detail}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Hermes ${res.status} — ${bodyText.slice(0, 120)}`);
  }
  const body = JSON.parse(bodyText) as { parsed?: HermesParsed[] };
  const map = new Map<string, HermesParsed>();
  for (const p of body.parsed ?? []) {
    map.set(normalizeFeedId(p.id), p);
  }
  return map;
}

async function tryHermes(feedId: string, feedName: string): Promise<PythCandidate | null> {
  const url = buildHermesLatestUrl([feedId]);
  try {
    const map = await fetchHermesLatest([feedId]);
    const raw = map.get(normalizeFeedId(feedId));
    if (!raw) {
      return {
        price: 0,
        conf: 0,
        publishTime: 0,
        feedName,
        feedId: normalizeFeedId(feedId),
        source: "hermes",
        error: "Hermes response missing feed id",
        fetchUrl: url,
      };
    }
    return { ...parseHermes(raw, feedName), fetchUrl: url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hermes failed";
    return {
      price: 0,
      conf: 0,
      publishTime: 0,
      feedName,
      feedId: normalizeFeedId(feedId),
      source: "hermes",
      error: msg,
      fetchUrl: url,
    };
  }
}

async function tryOnChain(feedId: string, feedName: string): Promise<PythCandidate | null> {
  const account = feedAccountAddress(0, feedId).toBase58();
  try {
    const q = await fetchOnChainPrice(feedId, feedName);
    return { ...q, feedId: normalizeFeedId(feedId), onChainAccount: account };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "on-chain failed";
    return {
      price: 0,
      conf: 0,
      publishTime: 0,
      feedName,
      feedId: normalizeFeedId(feedId),
      source: "on-chain",
      error: msg,
      onChainAccount: account,
    };
  }
}

function pickNewest(candidates: PythCandidate[]): PythQuote | null {
  const ok = candidates.filter((c) => !c.error && c.publishTime > 0);
  if (!ok.length) return null;
  return ok.reduce((best, c) => (c.publishTime > best.publishTime ? c : best));
}

function pickNewestForLeg(hermes: PythCandidate | null, onchain: PythCandidate | null): PythQuote | null {
  const candidates = [hermes, onchain].filter(Boolean) as PythCandidate[];
  return pickNewest(candidates);
}

function logChosen(stockId: StockId, chosen: PythQuote, candidates: PythCandidate[]): void {
  if (process.env.PYTH_LOG !== "1") return;
  const iso = new Date(chosen.publishTime * 1000).toISOString();
  console.log(
    `[pyth] ${stockId} → ${chosen.feedName} ${chosen.price} publish=${iso} source=${chosen.source}`,
  );
  for (const c of candidates) {
    if (c.error) {
      console.log(`  [${c.source}] ${c.feedName} ERR ${c.error}`);
    } else {
      console.log(
        `  [${c.source}] ${c.feedName} id=${c.feedId.slice(0, 12)}… price=${c.price} publish=${new Date(c.publishTime * 1000).toISOString()}`,
      );
    }
  }
}

async function gatherCandidates(stockId: StockId): Promise<PythCandidate[]> {
  const s = STOCKS[stockId];
  const [hCrypto, hEquity, oCrypto, oEquity] = await Promise.all([
    tryHermes(s.cryptoFeedId, s.cryptoSymbol),
    tryHermes(s.equityFeedId, s.equitySymbol),
    tryOnChain(s.cryptoFeedId, s.cryptoSymbol),
    tryOnChain(s.equityFeedId, s.equitySymbol),
  ]);
  return [hCrypto, hEquity, oCrypto, oEquity].filter(Boolean) as PythCandidate[];
}

export type StockQuotesBundle = {
  crypto: PythQuote;
  equity: PythQuote;
  /** Newest publishTime across crypto + equity, Hermes + on-chain — used for scoring snapshots. */
  scoring: PythQuote;
};

type CacheEntry = { at: number; bundle: StockQuotesBundle };

const quoteCache = new Map<StockId, CacheEntry>();

async function fetchStockQuotesUncached(stockId: StockId): Promise<StockQuotesBundle> {
  const s = STOCKS[stockId];
  const [hCrypto, hEquity, oCrypto, oEquity] = await Promise.all([
    tryHermes(s.cryptoFeedId, s.cryptoSymbol),
    tryHermes(s.equityFeedId, s.equitySymbol),
    tryOnChain(s.cryptoFeedId, s.cryptoSymbol),
    tryOnChain(s.equityFeedId, s.equitySymbol),
  ]);

  const candidates = [hCrypto, hEquity, oCrypto, oEquity].filter(Boolean) as PythCandidate[];
  const crypto = pickNewestForLeg(hCrypto, oCrypto);
  const equity = pickNewestForLeg(hEquity, oEquity);
  const scoring = pickNewest(candidates);

  if (!crypto || !equity || !scoring) {
    const errs = candidates.map((c) => c.error).filter(Boolean);
    throw new Error(`No Pyth price for ${stockId}${errs.length ? `: ${errs[0]}` : ""}`);
  }

  logChosen(stockId, scoring, candidates);
  return { crypto, equity, scoring };
}

export async function fetchStockQuotes(stockId: StockId): Promise<StockQuotesBundle> {
  const now = Date.now();
  const hit = quoteCache.get(stockId);
  if (hit && now - hit.at < LIVE_CACHE_MS) {
    return hit.bundle;
  }
  const bundle = await fetchStockQuotesUncached(stockId);
  quoteCache.set(stockId, { at: now, bundle });
  return bundle;
}

export async function fetchBestHermesQuote(stockId: StockId): Promise<PythQuote | null> {
  const s = STOCKS[stockId];
  const [hCrypto, hEquity] = await Promise.all([
    tryHermes(s.cryptoFeedId, s.cryptoSymbol),
    tryHermes(s.equityFeedId, s.equitySymbol),
  ]);
  return pickNewest([hCrypto, hEquity].filter(Boolean) as PythCandidate[]);
}

export async function fetchBestOnChainQuote(stockId: StockId): Promise<PythQuote | null> {
  const s = STOCKS[stockId];
  const [oCrypto, oEquity] = await Promise.all([
    tryOnChain(s.cryptoFeedId, s.cryptoSymbol),
    tryOnChain(s.equityFeedId, s.equitySymbol),
  ]);
  return pickNewest([oCrypto, oEquity].filter(Boolean) as PythCandidate[]);
}

export async function fetchStockQuoteDebug(stockId: StockId): Promise<{
  chosen: PythQuote | null;
  candidates: PythCandidate[];
  hermesUrl: string;
}> {
  const s = STOCKS[stockId];
  const hermesUrl = buildHermesLatestUrl([s.cryptoFeedId, s.equityFeedId]);
  const candidates = await gatherCandidates(stockId);
  const chosen = pickNewest(candidates);
  return { chosen, candidates, hermesUrl };
}

export async function fetchAllCryptoPrices(): Promise<Record<StockId, PythQuote>> {
  const ids = Object.keys(STOCKS) as StockId[];
  const entries = await Promise.all(
    ids.map(async (id) => {
      const bundle = await fetchStockQuotes(id);
      return [id, bundle.scoring] as const;
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
