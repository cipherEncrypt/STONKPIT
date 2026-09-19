import { STOCKS, StockId, USDC_MINT } from "./constants";

/** 0.01 xStock token (8 decimals on mainnet xStock mints). */
export const JUPITER_QUOTE_TOKEN_RAW = 1_000_000;
const XSTOCK_DECIMALS = 8;
const USDC_DECIMALS = 6;

const JUPITER_QUOTE_URL =
  process.env.JUPITER_QUOTE_URL?.replace(/\/$/, "") ??
  "https://api.jup.ag/swap/v1/quote";

export type JupiterQuoteResult = {
  price: number;
  publishTime: number;
  feedName: string;
  inAmount: string;
  outAmount: string;
};

export function jupiterQuoteUrl(stockId: StockId): string {
  const mint = STOCKS[stockId].mint;
  const params = new URLSearchParams({
    inputMint: mint,
    outputMint: USDC_MINT,
    amount: String(JUPITER_QUOTE_TOKEN_RAW),
    slippageBps: "50",
  });
  return `${JUPITER_QUOTE_URL}?${params}`;
}

/** Implied USD per 1 xStock token from a small exact-in quote. */
export function priceFromJupiterAmounts(inAmountRaw: string, outAmountRaw: string): number {
  const inRaw = BigInt(inAmountRaw);
  const outRaw = BigInt(outAmountRaw);
  if (inRaw <= BigInt(0)) throw new Error("Jupiter inAmount zero");
  const usdc = Number(outRaw) / 10 ** USDC_DECIMALS;
  const tokens = Number(inRaw) / 10 ** XSTOCK_DECIMALS;
  return usdc / tokens;
}

async function fetchJupiterQuoteOnce(stockId: StockId): Promise<JupiterQuoteResult> {
  const url = jupiterQuoteUrl(stockId);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter ${res.status}: ${text.slice(0, 160)}`);
  }
  const body = (await res.json()) as {
    inAmount?: string;
    outAmount?: string;
    error?: string;
  };
  if (body.error || !body.inAmount || !body.outAmount) {
    throw new Error(body.error ?? "Jupiter quote missing amounts");
  }
  const price = priceFromJupiterAmounts(body.inAmount, body.outAmount);
  return {
    price,
    publishTime: Math.floor(Date.now() / 1000),
    feedName: `Jupiter ${STOCKS[stockId].label}→USDC`,
    inAmount: body.inAmount,
    outAmount: body.outAmount,
  };
}

export async function fetchJupiterQuote(stockId: StockId): Promise<JupiterQuoteResult> {
  try {
    return await fetchJupiterQuoteOnce(stockId);
  } catch (first) {
    try {
      return await fetchJupiterQuoteOnce(stockId);
    } catch {
      throw first;
    }
  }
}
