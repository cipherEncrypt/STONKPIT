import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..");

/** Read program id from keys/program.json so deploy + client stay in sync. */
export function loadProgramId(): PublicKey {
  const kp = JSON.parse(
    fs.readFileSync(path.join(ROOT, "keys", "program.json"), "utf8"),
  );
  // lazy: derive pubkey from secret — use solana-keygen in demo if needed
  const { Keypair } = require("@solana/web3.js") as typeof import("@solana/web3.js");
  return Keypair.fromSecretKey(Uint8Array.from(kp)).publicKey;
}

export const PROGRAM_ID = loadProgramId();
