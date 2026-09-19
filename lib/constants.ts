/** Mainnet cluster — price reads only; no custom program deploy. */
export const CLUSTER = "mainnet-beta" as const;

export const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type StockId = "AAPLX" | "TSLAX" | "NVDAX";

export const STOCKS: Record<
  StockId,
  {
    label: string;
    mint: string;
    cryptoFeedId: string;
    cryptoSymbol: string;
    equityFeedId: string;
    equitySymbol: string;
  }
> = {
  AAPLX: {
    label: "AAPLx",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    cryptoFeedId:
      "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675",
    cryptoSymbol: "Crypto.AAPLX/USD",
    equityFeedId:
      "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
    equitySymbol: "Equity.US.AAPL/USD",
  },
  TSLAX: {
    label: "TSLAx",
    mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    cryptoFeedId:
      "47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362",
    cryptoSymbol: "Crypto.TSLAX/USD",
    equityFeedId:
      "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
    equitySymbol: "Equity.US.TSLA/USD",
  },
  NVDAX: {
    label: "NVDAx",
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    cryptoFeedId:
      "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f",
    cryptoSymbol: "Crypto.NVDAX/USD",
    equityFeedId:
      "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
    equitySymbol: "Equity.US.NVDA/USD",
  },
};

export const DEFAULT_ROOM_ID = "1";

export const MIN_PLAYERS = 2;
export const FEE_BPS = 300;

/** Re-export — server reads ROOM_DURATION from env. */
export { roomDurationSecs } from "./config";

export const PYTH_HERMES = "https://hermes.pyth.network";

export function jupiterSwapUrl(outputMint: string): string {
  return `https://jup.ag/swap/USDC-${outputMint}`;
}
