import { MarketQuote, PriceSource } from "./market-price";
import { formatFeedStatusLine } from "./pyth-feed-status";

export function formatPriceSourceLabel(source: PriceSource): string {
  return source;
}

export function formatMarketStatusLine(
  quote: MarketQuote,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  return `${quote.priceSource} · ${formatFeedStatusLine(quote.publishTime, nowSec)}`;
}
