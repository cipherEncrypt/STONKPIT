import { BorshAccountsCoder } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { PythQuote } from "./pyth";
import { serverRpcUrl } from "./rpc";

const PUSH_ORACLE_PROGRAM_ID = new PublicKey(
  "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT",
);

const PYTH_RECEIVER_IDL = {
  accounts: [
    {
      name: "priceUpdateV2",
      discriminator: [34, 241, 35, 99, 157, 126, 244, 205],
    },
  ],
  types: [
    {
      name: "PriceFeedMessage",
      type: {
        kind: "struct",
        fields: [
          { name: "feedId", type: { array: ["u8", 32] } },
          { name: "price", type: "i64" },
          { name: "conf", type: "u64" },
          { name: "exponent", type: "i32" },
          { name: "publishTime", type: "i64" },
          { name: "prevPublishTime", type: "i64" },
          { name: "emaPrice", type: "i64" },
          { name: "emaConf", type: "u64" },
        ],
      },
    },
    {
      name: "VerificationLevel",
      type: {
        kind: "enum",
        variants: [
          { name: "Partial", fields: [{ name: "numSignatures", type: "u8" }] },
          { name: "Full" },
        ],
      },
    },
    {
      name: "priceUpdateV2",
      type: {
        kind: "struct",
        fields: [
          { name: "writeAuthority", type: "pubkey" },
          { name: "verificationLevel", type: { defined: { name: "VerificationLevel" } } },
          { name: "priceMessage", type: { defined: { name: "PriceFeedMessage" } } },
          { name: "postedSlot", type: "u64" },
        ],
      },
    },
  ],
} as const;

const accountCoder = new BorshAccountsCoder(PYTH_RECEIVER_IDL as never);

export function feedAccountAddress(shardId: number, feedIdHex: string): PublicKey {
  const feedId = Buffer.from(feedIdHex, "hex");
  const shard = Buffer.alloc(2);
  shard.writeUint16LE(shardId, 0);
  return PublicKey.findProgramAddressSync([shard, feedId], PUSH_ORACLE_PROGRAM_ID)[0];
}

type DecodedUpdate = {
  priceMessage: {
    price: bigint;
    conf: bigint;
    exponent: number;
    publishTime: bigint;
  };
};

export async function fetchOnChainPrice(
  feedId: string,
  feedName: string,
): Promise<PythQuote> {
  const addr = feedAccountAddress(0, feedId);
  const connection = new Connection(serverRpcUrl(), "confirmed");
  const info = await connection.getAccountInfo(addr);
  if (!info?.data) {
    throw new Error(`No on-chain Pyth account for ${feedName} (${addr.toBase58()})`);
  }

  const decoded = accountCoder.decode("priceUpdateV2", info.data) as DecodedUpdate;
  const msg = decoded.priceMessage;
  const factor = 10 ** Math.abs(msg.exponent);
  return {
    price: Number(msg.price) / factor,
    conf: Number(msg.conf) / factor,
    publishTime: Number(msg.publishTime),
    feedName,
    feedId,
    source: "on-chain",
  };
}
