import { loadEnvFile } from "../lib/load-env";

loadEnvFile();

import { STOCKS, StockId } from "../lib/constants";
import { diagnoseStock, fightMarketQuote } from "../lib/market-price";
import { formatAgeShort } from "../lib/pyth-feed-status";

function fmtAge(sec: number | null): string {
  if (sec == null) return "—";
  return formatAgeShort(sec);
}

async function main(): Promise<void> {
  const key = process.env.PYTH_API_KEY?.trim();
  console.log(`PYTH_API_KEY ${key ? `${key.slice(0, 4)}…${key.slice(-4)}` : "(not set)"}\n`);

  const ids = (process.argv.slice(2) as StockId[]).filter((id) => id in STOCKS);
  const stocks = ids.length ? ids : (Object.keys(STOCKS) as StockId[]);

  for (const stockId of stocks) {
    const d = await diagnoseStock(stockId);
    const label = STOCKS[stockId].label;
    console.log(`=== ${label} (${stockId}) ===`);
    if (d.hermes) {
      console.log(
        `  pyth hermes  price=${d.hermes.price} age=${fmtAge(d.hermesAgeSec)} publish=${new Date(d.hermes.publishTime * 1000).toISOString()}`,
      );
    } else {
      console.log("  pyth hermes  (none / 401 / 403)");
    }
    if (d.onchain) {
      console.log(
        `  pyth on-chain price=${d.onchain.price} age=${fmtAge(d.onchainAgeSec)} publish=${new Date(d.onchain.publishTime * 1000).toISOString()}`,
      );
    } else {
      console.log("  pyth on-chain (none)");
    }
    if (d.jupiterPrice != null) {
      console.log(`  jupiter      price=${d.jupiterPrice}`);
    } else {
      console.log(`  jupiter      FAILED ${d.jupiterError ?? ""}`);
    }
    const chosen = await fightMarketQuote(stockId);
    console.log(
      `→ chosen ${chosen.priceSource} price=${chosen.price} publish=${new Date(chosen.publishTime * 1000).toISOString()}`,
    );
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
