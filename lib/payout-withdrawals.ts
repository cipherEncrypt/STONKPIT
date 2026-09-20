/**
 * Treasury payout helpers — DB only. On-chain send lives in scripts/payout-pending.ts.
 * Never import this from app/ or components/.
 */
import { ledgerId, WithdrawalRow, withDbAsync } from "./db";

export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** In-DB claim token so two payout runners cannot pick the same pending row. */
export const WITHDRAW_CLAIM_PREFIX = "__claim__:";

function isWithdrawClaimLock(sig: string | null): boolean {
  return !!sig && sig.startsWith(WITHDRAW_CLAIM_PREFIX);
}

export type PayoutSendFn = (row: WithdrawalRow) => Promise<string>;

export function assertPayoutScriptOnly(): void {
  const stack = new Error().stack ?? "";
  if (
    stack.includes("/app/") ||
    stack.includes("\\app\\") ||
    stack.includes("/components/") ||
    stack.includes("\\components\\")
  ) {
    throw new Error("Treasury payout must only run from scripts/payout-pending.ts");
  }
}

/** Pick next pending row that has not been sent on-chain. */
export async function claimNextPendingWithdrawal(): Promise<WithdrawalRow | null> {
  return withDbAsync((state) => {
    const row = state.withdrawals.find(
      (w) => w.status === "pending" && !w.outSignature,
    );
    if (!row) return null;
    row.outSignature = `${WITHDRAW_CLAIM_PREFIX}${row.id}`;
    return { ...row, outSignature: null };
  });
}

export async function markWithdrawalSent(
  withdrawalId: string,
  outSignature: string,
): Promise<boolean> {
  return withDbAsync((state) => {
    const row = state.withdrawals.find((w) => w.id === withdrawalId);
    if (!row || row.status !== "pending") return false;
    if (row.outSignature && !isWithdrawClaimLock(row.outSignature)) return false;
    const now = Date.now();
    row.status = "sent";
    row.outSignature = outSignature;
    row.sentAt = now;
    state.ledger.push({
      id: ledgerId(),
      pubkey: row.pubkey,
      type: "withdraw_sent",
      amount: row.amount,
      roomId: null,
      ref: outSignature,
      createdAt: now,
    });
    return true;
  });
}

export async function markWithdrawalFailed(withdrawalId: string): Promise<boolean> {
  return withDbAsync((state) => {
    const row = state.withdrawals.find((w) => w.id === withdrawalId);
    if (!row || row.status !== "pending") return false;
    if (row.outSignature && !isWithdrawClaimLock(row.outSignature)) return false;
    row.status = "failed";
    row.outSignature = null;
    const bal = state.wallets[row.pubkey];
    if (bal) {
      bal.available += row.amount;
      bal.updatedAt = Date.now();
    }
    state.ledger.push({
      id: ledgerId(),
      pubkey: row.pubkey,
      type: "withdraw_refund",
      amount: row.amount,
      roomId: null,
      ref: withdrawalId,
      createdAt: Date.now(),
    });
    return true;
  });
}

/**
 * Process one pending withdrawal. Idempotent: skips rows with outSignature or non-pending status.
 */
export async function processOnePendingWithdrawal(
  sendFn: PayoutSendFn,
): Promise<"none" | "sent" | "failed"> {
  const row = await claimNextPendingWithdrawal();
  if (!row) return "none";

  try {
    const sig = await sendFn(row);
    const marked = await markWithdrawalSent(row.id, sig);
    return marked ? "sent" : "none";
  } catch {
    await markWithdrawalFailed(row.id);
    return "failed";
  }
}

export async function runPayoutUntilEmpty(sendFn: PayoutSendFn): Promise<number> {
  let sent = 0;
  for (;;) {
    const result = await processOnePendingWithdrawal(sendFn);
    if (result === "none") break;
    if (result === "sent") sent++;
  }
  return sent;
}
