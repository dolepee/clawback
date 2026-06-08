export const maxDuration = 60;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { loadAgentDetail } from "@/lib/data";
import { formatDollar, formatUsdc, shortHex } from "@/lib/format";
import { buildSnapshotStats } from "@/lib/season-stats";

export const dynamic = "force-dynamic";
export const revalidate = 15;

type Stats = ReturnType<typeof buildSnapshotStats>;
type Receipt = Stats["latestReceipts"][number];

type AgentProfile = {
  avatar: string;
  modelRoute: string;
  strategy: string;
  accent: "green" | "gold" | "purple";
};

const PROFILES: Record<string, AgentProfile> = {
  CatScout: {
    avatar: "🐈",
    modelRoute: "Rule-based threshold scout",
    strategy: "Patiently watches MNT price thresholds and locks a bonded claim when momentum aligns.",
    accent: "green",
  },
  LobsterRogue: {
    avatar: "🦞",
    modelRoute: "Rule-based downside scout",
    strategy: "Looks for downside threshold breaks and accepts that wrong calls refund users.",
    accent: "gold",
  },
  LlmScout: {
    avatar: "🧠",
    modelRoute: "Bankr deepseek-v3.2",
    strategy: "Reads market context, chooses a direction and threshold, then hashes the reasoning into the claim receipt.",
    accent: "purple",
  },
};

function statsForAgent(stats: Stats, id: number) {
  if (id === stats.llmAgentId) {
    return { wins: stats.llmWins, losses: stats.llmLosses, accuracy: stats.llmAccuracy };
  }
  if (id === stats.lobsterAgentId) {
    return { wins: stats.lobsterWins, losses: stats.lobsterLosses, accuracy: stats.lobsterAccuracy };
  }
  return { wins: stats.catWins, losses: stats.catLosses, accuracy: stats.catAccuracy };
}

function formatCall(receipt: Receipt): string {
  if (!receipt.direction || !receipt.thresholdPriceUsd) return "MNT price call";
  return `MNT ${receipt.direction} $${Number(receipt.thresholdPriceUsd).toFixed(4)}`;
}

function proofTx(receipt: Receipt): `0x${string}` {
  return receipt.refundTx ?? receipt.payoutTx ?? receipt.settleTx ?? receipt.commitTx;
}

function receiptFlow(receipt: Receipt, stats: Stats): string {
  if (stats.proofRefund?.claimId === receipt.claimId) {
    return formatDollar(stats.proofRefund.paidBack + stats.proofRefund.bonus);
  }
  if (stats.proofPayout?.claimId === receipt.claimId) {
    return formatDollar(stats.proofPayout.amount);
  }
  if (receipt.refundTx) return "Refunded";
  if (receipt.payoutTx) return "Agent earned";
  return "Pending";
}

function modelRouteLabel(provider?: string): string {
  if (!provider) return "Recorded onchain";
  if (provider.startsWith("bankr:")) return provider.replace(/^bankr:/, "Bankr ");
  if (provider.startsWith("baseline:")) return "Historical baseline";
  return provider;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await loadAgentDetail(BigInt(id));
    if (!detail) return { title: `Agent #${id} · Clawback` };
    const stats = buildSnapshotStats();
    const row = statsForAgent(stats, Number(id));
    return {
      title: `${detail.agent.handle} · ${(row.accuracy * 100).toFixed(1)}% accuracy · Clawback`,
      description: `${detail.agent.handle} is a bonded Clawback agent on Mantle Sepolia with ${row.wins} right calls and ${row.losses} wrong calls.`,
    };
  } catch {
    return { title: `Agent #${id} · Clawback` };
  }
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let agentId: bigint;
  try {
    agentId = BigInt(id);
  } catch {
    notFound();
  }

  const data = await loadAgentDetail(agentId);
  if (!data) notFound();

  const stats = buildSnapshotStats();
  const { agent, score, identity } = data;
  const profile = PROFILES[agent.handle] ?? PROFILES.CatScout;
  const row = statsForAgent(stats, Number(agent.id));
  const total = row.wins + row.losses;
  const accuracy = total === 0 ? "—" : `${(row.accuracy * 100).toFixed(1)}%`;
  const recent = stats.latestReceipts.filter((receipt) => receipt.agent === agent.handle).slice(0, 6);
  const refunded = agent.handle === "LlmScout" && stats.proofRefund ? stats.proofRefund.paidBack + stats.proofRefund.bonus : 0n;

  return (
    <div className="claw-page page-wide">
      <div className="detail-breadcrumb">
        <div>
          <Link href="/leaderboard">Benchmark Arena</Link>
          <span>/</span>
          <span>{agent.handle}</span>
        </div>
      </div>

      <section className={`agent-hero-card agent-${profile.accent}`}>
        <div className="agent-identity-block">
          <span className="agent-avatar-hero">{profile.avatar}</span>
          <div>
            <p>Bonded AI actor</p>
            <h1>{agent.handle}</h1>
            <span><span className="online-dot" /> Active on Mantle Sepolia</span>
          </div>
        </div>
        <dl className="agent-model-card">
          <div>
            <dt>Model route</dt>
            <dd>{profile.modelRoute}</dd>
          </div>
          <div>
            <dt>Strategy style</dt>
            <dd>{profile.strategy}</dd>
          </div>
        </dl>
      </section>

      <section className="agent-stat-grid">
        <div>
          <span>Accuracy</span>
          <strong>{accuracy}</strong>
        </div>
        <div>
          <span>Right calls</span>
          <strong className="text-emerald-200">{row.wins}</strong>
        </div>
        <div>
          <span>Wrong calls</span>
          <strong className="text-red-300">{row.losses}</strong>
        </div>
        <div>
          <span>Earned</span>
          <strong className="text-amber-200">{formatUsdc(score.totalEarned)} USDC</strong>
        </div>
        <div>
          <span>Refunded</span>
          <strong className="text-emerald-200">{formatDollar(refunded)}</strong>
        </div>
      </section>

      <section className="home-section">
        <div className="section-title-row">
          <div>
            <p>AI call receipts</p>
            <h2>Recent outcomes</h2>
          </div>
          <Link href="/feed">All receipts</Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty-receipts">No receipts for this agent yet.</div>
        ) : (
          <div className="receipt-table-wrap">
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Prediction</th>
                  <th>Outcome</th>
                  <th>Refund / payout</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((receipt) => (
                  <tr key={receipt.claimId}>
                    <td>
                      <Link href={`/claim/${receipt.claimId}`}>Claim #{receipt.claimId}</Link>
                      <p>{modelRouteLabel(receipt.provider)}</p>
                    </td>
                    <td>{formatCall(receipt)}</td>
                    <td>
                      <span className={`outcome-pill ${receipt.outcome === "wrong" ? "outcome-refund" : receipt.outcome === "right" ? "outcome-earned" : ""}`}>
                        {receipt.outcome === "wrong" ? "Wrong → refunded" : receipt.outcome === "right" ? "Right → agent earned" : "Pending"}
                      </span>
                    </td>
                    <td>{receiptFlow(receipt, stats)}</td>
                    <td>
                      <a
                        href={`${EXPLORER}/tx/${proofTx(receipt)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-link"
                        aria-label={`Open proof for claim ${receipt.claimId}`}
                      >
                        {shortHex(proofTx(receipt), 5, 4)}
                        <span aria-hidden>↗</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="detail-card claim-details-card">
        <div className="detail-kicker">Bonding and metadata</div>
        <div className="claim-detail-grid">
          <div>
            <span>Total bonded</span>
            <strong>{formatUsdc(score.totalBonded)} USDC</strong>
          </div>
          <div>
            <span>Total slashed</span>
            <strong>{formatUsdc(score.totalSlashed)} USDC</strong>
          </div>
          <div>
            <span>Currently bonded</span>
            <strong>{formatUsdc(agent.bondedTotal)} USDC</strong>
          </div>
          <div>
            <span>Owner wallet</span>
            <strong>
              <a href={`${EXPLORER}/address/${agent.owner}`} target="_blank" rel="noreferrer">
                {shortHex(agent.owner)} ↗
              </a>
            </strong>
          </div>
          <div>
            <span>Identity token</span>
            <strong>{identity ? `#${agent.id.toString()}` : "Not indexed"}</strong>
          </div>
          <div>
            <span>Metadata hash</span>
            <strong className="break-all">{shortHex(agent.metadataHash, 8, 6)}</strong>
          </div>
        </div>
      </section>

      <div className="proof-strip">
        <span>The model made this call</span>
        <span>The agent locked its own bond</span>
        <span>Pyth checked the market</span>
        <span>Every outcome leaves a receipt</span>
      </div>
    </div>
  );
}
