// Snapshot-backed season stats. The homepage, OG image, and /api/stats + /api/health read HERE,
// not the live getLogs path in live-stats.ts. The snapshot is produced by
// agent/scripts/build-snapshot.mjs (one full-history scan, no block window) and committed to
// app/src/data/snapshot.json, so the judge-facing surface renders real numbers with zero
// request-time RPC dependency and can never fall back to an all-zeros dashboard.
//
// Live RPC is used ONLY for enrichment that is safe to lose: the MNT price ticker and the
// LlmScout strategy panel (which already reads committed provenance, not the chain).
import snapshotJson from "../data/snapshot.json";
import {
  fetchLlmStrategySummary,
  fetchPythMntUsd,
  type AgentHandle,
  type HealthStatus,
  type LiveStats,
} from "./live-stats";

type SnapReceipt = {
  claimId: number;
  agent: string;
  outcome: "pending" | "right" | "wrong";
  commitTx: string | null;
  settleTx: string | null;
  commitAt?: number | null;
  settleAt?: number | null;
  payoutTx: string | null;
  refundTx: string | null;
  provider?: string | null;
  fellBack?: boolean | null;
  direction?: "above" | "below" | null;
  thresholdPriceUsd?: string | null;
};

type SnapMoneyReceipt = SnapReceipt & {
  paidBack?: string | null;
  bonus?: string | null;
  user?: string | null;
  amount?: string | null;
};

type SnapshotShape = {
  generatedAt: number;
  totalClaims: number;
  totalUnlocks: number;
  settledRight: number;
  settledWrong: number;
  refundsClaimed: number;
  earningsClaimed: number;
  totalRefundUsdc: string;
  totalEarningsUsdc: string;
  perAgent: Record<string, { wins: number; losses: number }>;
  lastClaimAt: number;
  lastSettleAt: number;
  latestRefund: { claimId: number; tx: string; paidBack: string; bonus: string; user: string } | null;
  latestPayout: { claimId: number; tx: string; amount: string; agent: string } | null;
  latestReceipts: SnapReceipt[];
  curatedWrong: SnapMoneyReceipt | null;
  curatedRight: SnapMoneyReceipt | null;
};

const snap = snapshotJson as unknown as SnapshotShape;

const hx = (s: string | null): `0x${string}` => (s ?? "0x") as `0x${string}`;
const asHandle = (s: string): AgentHandle =>
  s === "LobsterRogue" || s === "LlmScout" ? s : "CatScout";
const acc = (w: number, l: number): number => (w + l === 0 ? 0 : w / (w + l));

function snapshotStats(): LiveStats {
  const cat = snap.perAgent.CatScout ?? { wins: 0, losses: 0 };
  const lob = snap.perAgent.LobsterRogue ?? { wins: 0, losses: 0 };
  const llm = snap.perAgent.LlmScout ?? { wins: 0, losses: 0 };
  return {
    totalClaims: snap.totalClaims,
    totalUnlocks: snap.totalUnlocks,
    settledRight: snap.settledRight,
    settledWrong: snap.settledWrong,
    refundsClaimed: snap.refundsClaimed,
    earningsClaimed: snap.earningsClaimed,
    catAccuracy: acc(cat.wins, cat.losses),
    lobsterAccuracy: acc(lob.wins, lob.losses),
    llmAccuracy: acc(llm.wins, llm.losses),
    catAgentId: 1,
    lobsterAgentId: 2,
    llmAgentId: 3,
    catWins: cat.wins,
    catLosses: cat.losses,
    lobsterWins: lob.wins,
    lobsterLosses: lob.losses,
    llmWins: llm.wins,
    llmLosses: llm.losses,
    totalRefundUsdc: BigInt(snap.totalRefundUsdc),
    totalEarningsUsdc: BigInt(snap.totalEarningsUsdc),
    latestRefund: snap.latestRefund
      ? {
          claimId: snap.latestRefund.claimId,
          tx: hx(snap.latestRefund.tx),
          paidBack: BigInt(snap.latestRefund.paidBack),
          bonus: BigInt(snap.latestRefund.bonus),
          user: hx(snap.latestRefund.user),
        }
      : undefined,
    latestPayout: snap.latestPayout
      ? {
          claimId: snap.latestPayout.claimId,
          tx: hx(snap.latestPayout.tx),
          amount: BigInt(snap.latestPayout.amount),
          agent: asHandle(snap.latestPayout.agent),
        }
      : undefined,
    proofRefund:
      snap.curatedWrong?.refundTx && snap.curatedWrong.paidBack && snap.curatedWrong.bonus && snap.curatedWrong.user
        ? {
            claimId: snap.curatedWrong.claimId,
            tx: hx(snap.curatedWrong.refundTx),
            commitTx: snap.curatedWrong.commitTx ? hx(snap.curatedWrong.commitTx) : undefined,
            settleTx: snap.curatedWrong.settleTx ? hx(snap.curatedWrong.settleTx) : undefined,
            commitAt: snap.curatedWrong.commitAt ?? undefined,
            settleAt: snap.curatedWrong.settleAt ?? undefined,
            paidBack: BigInt(snap.curatedWrong.paidBack),
            bonus: BigInt(snap.curatedWrong.bonus),
            user: hx(snap.curatedWrong.user),
            agent: asHandle(snap.curatedWrong.agent),
            provider: snap.curatedWrong.provider ?? undefined,
            fellBack: snap.curatedWrong.fellBack ?? undefined,
            direction: snap.curatedWrong.direction ?? undefined,
            thresholdPriceUsd: snap.curatedWrong.thresholdPriceUsd ?? undefined,
          }
        : undefined,
    proofPayout:
      snap.curatedRight?.payoutTx && snap.curatedRight.amount
        ? {
            claimId: snap.curatedRight.claimId,
            tx: hx(snap.curatedRight.payoutTx),
            commitTx: snap.curatedRight.commitTx ? hx(snap.curatedRight.commitTx) : undefined,
            settleTx: snap.curatedRight.settleTx ? hx(snap.curatedRight.settleTx) : undefined,
            commitAt: snap.curatedRight.commitAt ?? undefined,
            settleAt: snap.curatedRight.settleAt ?? undefined,
            amount: BigInt(snap.curatedRight.amount),
            agent: asHandle(snap.curatedRight.agent),
            provider: snap.curatedRight.provider ?? undefined,
            fellBack: snap.curatedRight.fellBack ?? undefined,
            direction: snap.curatedRight.direction ?? undefined,
            thresholdPriceUsd: snap.curatedRight.thresholdPriceUsd ?? undefined,
          }
        : undefined,
    lastClaimAt: snap.lastClaimAt,
    lastSettleAt: snap.lastSettleAt,
    generatedAt: snap.generatedAt,
    latestReceipts: snap.latestReceipts.map((r) => ({
      claimId: r.claimId,
      agent: asHandle(r.agent),
      outcome: r.outcome,
      commitTx: hx(r.commitTx),
      settleTx: r.settleTx ? hx(r.settleTx) : undefined,
      commitAt: r.commitAt ?? undefined,
      settleAt: r.settleAt ?? undefined,
      payoutTx: r.payoutTx ? hx(r.payoutTx) : undefined,
      refundTx: r.refundTx ? hx(r.refundTx) : undefined,
      provider: r.provider ?? undefined,
      fellBack: r.fellBack ?? undefined,
      direction: r.direction ?? undefined,
      thresholdPriceUsd: r.thresholdPriceUsd ?? undefined,
    })),
    llmStrategyDistribution: {},
    llmRecentDecisions: [],
    mntUsd: null,
  };
}

export function buildSnapshotStats(): LiveStats {
  return snapshotStats();
}

export async function buildStats(): Promise<LiveStats> {
  const base = snapshotStats();
  try {
    const [strat, mnt] = await Promise.all([
      fetchLlmStrategySummary(
        base.latestReceipts.filter((r) => r.agent === "LlmScout").map((r) => r.claimId),
      ),
      fetchPythMntUsd(),
    ]);
    base.llmStrategyDistribution = strat.llmStrategyDistribution;
    base.llmRecentDecisions = strat.llmRecentDecisions;
    base.mntUsd = mnt;
  } catch {
    // Enrichment only. The snapshot already carries the season proof, so a failed
    // price/strategy fetch never blanks the page.
  }
  return base;
}

export async function buildHealth(): Promise<HealthStatus> {
  const s = snapshotStats();
  const staleThresholdSeconds = 30 * 3600;
  const now = Math.floor(Date.now() / 1000);
  const lastClaimAgeSeconds = s.lastClaimAt === 0 ? staleThresholdSeconds + 1 : now - s.lastClaimAt;
  const lastSettleAgeSeconds =
    s.lastSettleAt === 0 ? staleThresholdSeconds + 1 : now - s.lastSettleAt;
  return {
    status: lastClaimAgeSeconds < staleThresholdSeconds ? "ok" : "stale",
    lastClaimAgeSeconds,
    lastSettleAgeSeconds,
    staleThresholdSeconds,
    generatedAt: now,
  };
}

/** The curated WRONG -> RIGHT pair the homepage theater autoplays once per session. */
export const curatedSettlements: {
  wrong: { claimId: number; agent: AgentHandle; outcome: "wrong" } | null;
  right: { claimId: number; agent: AgentHandle; outcome: "right" } | null;
} = {
  wrong: snap.curatedWrong
    ? { claimId: snap.curatedWrong.claimId, agent: asHandle(snap.curatedWrong.agent), outcome: "wrong" }
    : null,
  right: snap.curatedRight
    ? { claimId: snap.curatedRight.claimId, agent: asHandle(snap.curatedRight.agent), outcome: "right" }
    : null,
};
