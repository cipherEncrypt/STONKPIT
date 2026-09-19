/**
 * npm run pyth:ping — symbol, price, publishTime, age, source
 */
import { loadEnvFile } from "../lib/load-env";

loadEnvFile();

import { STOCKS, StockId } from "../lib/constants";
import { fetchStockQuoteDebug } from "../lib/pyth";

function ageLabel(publishTimeSec: number): string {
  const ageSec = Math.max(0, Math.floor(Date.now() / 1000 - publishTimeSec));
  if (ageSec < 120) return `LIVE (${ageSec}s)`;
  if (ageSec < 86400) return `QUIET (${Math.floor(ageSec / 60)}m)`;
  const days = Math.floor(ageSec / 86400);
  return `FEED STALE (${days}d)`;
}

function maskKey(key: string | undefined): string {
  if (!key) return "(not set — add PYTH_API_KEY to .env)";
  if (key.length < 8) return "(set)";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function main(): Promise<void> {
  console.log(`PYTH_API_KEY ${maskKey(process.env.PYTH_API_KEY)}`);
  const ids = (process.argv.slice(2) as StockId[]).filter((id) => id in STOCKS);
  const stocks = ids.length ? ids : (Object.keys(STOCKS) as StockId[]);

  for (const stockId of stocks) {
    const s = STOCKS[stockId];
    console.log(`\n=== ${s.label} (${stockId}) ===`);
    const { chosen, candidates, hermesUrl } = await fetchStockQuoteDebug(stockId);
    console.log(`hermes batch URL: ${hermesUrl}`);
    for (const c of candidates) {
      if (c.error) {
        console.log(`  [${c.source}] ${c.feedName} id=${c.feedId.slice(0, 16)}… FAILED`);
        if (c.fetchUrl) console.log(`    url: ${c.fetchUrl}`);
        if (c.onChainAccount) console.log(`    account: ${c.onChainAccount}`);
        console.log(`    error: ${c.error}`);
        continue;
      }
      const iso = new Date(c.publishTime * 1000).toISOString();
      console.log(
        `  [${c.source}] ${c.feedName} id=${c.feedId.slice(0, 16)}… price=${c.price} publish=${iso} ${ageLabel(c.publishTime)}`,
      );
      if (c.fetchUrl) console.log(`    url: ${c.fetchUrl}`);
      if (c.onChainAccount) console.log(`    account: ${c.onChainAccount}`);
    }
    if (chosen) {
      const iso = new Date(chosen.publishTime * 1000).toISOString();
      console.log(
        `→ CHOSEN [${chosen.source}] ${chosen.feedName} price=${chosen.price} publish=${iso} ${ageLabel(chosen.publishTime)}`,
      );
    } else {
      console.log("→ CHOSEN: none (all fetches failed)");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
