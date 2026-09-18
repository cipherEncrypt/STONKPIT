/**
 * Deploy stonkpit program to Solana mainnet.
 * Admin keypair pays deploy fees (~2-3 SOL). Fund keys/admin.json first.
 */
import { execSync } from "child_process";
import * as path from "path";

const ROOT = path.join(__dirname, "..");
const rpc = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL;
if (!rpc) throw new Error("Set HELIUS_RPC_URL");

const env = {
  ...process.env,
  CARGO_TARGET_DIR: path.join(ROOT, "target"),
};

console.log("Building program...");
execSync(
  "cargo build-sbf --manifest-path programs/stonkpit/Cargo.toml",
  { cwd: ROOT, env, stdio: "inherit" },
);

console.log("Deploying to mainnet...");
execSync(
  `solana program deploy target/deploy/stonkpit.so --program-id keys/program.json --keypair keys/admin.json --url "${rpc}"`,
  { cwd: ROOT, stdio: "inherit" },
);

console.log("Done. Program ID: DVWAgqjsK7jCVWu2ArL6PVcpdvGbdeVCwnsWBJcGFBi");
