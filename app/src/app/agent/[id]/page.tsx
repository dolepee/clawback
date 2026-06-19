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

function StrategyPanel({ handle, profile }: { handle: string; profile: AgentProfile }) {
  const rows =
    handle === "LlmScout"
      ? [
          ["Momentum", "Reads directional pressure before committing capital."],
          ["Threshold hunter", "Focuses on decisive moves past priced levels."],
          ["Risk aware", "Small stake first; wrong calls are slashable."],
        ]
      : handle === "CatScout"
        ? [
            ["Baseline", "A deterministic control strategy for judging the AI route."],
            ["Patient", "Waits for clearer threshold windows."],
            ["Capital-aware", "Same bonded settlement path as model agents."],
          ]
        : [
            ["Adversarial", "Pushes low-quality calls to prove refunds work."],
            ["Slashing demo", "Turns wrong calls into visible clawback receipts."],
            ["Control group", "Keeps the benchmark honest."],
          ];

  return (
    <section className="agent-profile-panel agent-strategy-panel">
      <div className="rail-panel-head">
        <h2>AI reasoning profile</h2>
        <span>{profile.modelRoute}</span>
      </div>
      <p>{profile.strategy}</p>
      <div className="strategy-mix-list">
        {rows.map(([label, body], index) => (
          <article key={label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{label}</strong>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentPerformancePanel({
  row,
  total,
}: {
  row: { wins: number; losses: number; accuracy: number };
  total: number;
}) {
  const worstCase = total === 0 ? "0.0%" : `${((row.losses / total) * 100).toFixed(1)}%`;
  return (
    <section className="agent-profile-panel agent-performance-panel">
      <div className="rail-panel-head">
        <h2>Performance over time</h2>
        <span>30D</span>
      </div>
      <svg viewBox="0 0 560 220" role="img" aria-label="Agent performance sketch">
        <path d="M28 162 H532 M28 112 H532 M28 62 H532" stroke="rgba(255,255,255,.1)" strokeDasharray="5 8" />
        <path
          d="M32 74 C82 86 110 60 150 76 S226 116 272 104 344 122 386 96 468 78 528 116"
          fill="none"
          stroke="rgb(110 231 183)"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <path
          d="M32 178 C86 146 120 160 166 132 S264 142 310 112 390 88 432 68 486 58 528 40"
          fill="none"
          stroke="rgb(196 181 253)"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      <dl>
        <div>
          <dt>Best accuracy</dt>
          <dd>{total === 0 ? "0.0%" : `${(row.accuracy * 100).toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt>Loss rate</dt>
          <dd>{worstCase}</dd>
        </div>
        <div>
          <dt>Total calls</dt>
          <dd>{total}</dd>
        </div>
      </dl>
    </section>
  );
}

function BondRiskPanel({
  agent,
  score,
}: {
  agent: Awaited<ReturnType<typeof loadAgentDetail>> extends infer T
    ? T extends { agent: infer A }
      ? A
      : never
    : never;
  score: Awaited<ReturnType<typeof loadAgentDetail>> extends infer T
    ? T extends { score: infer S }
      ? S
      : never
    : never;
}) {
  return (
    <section className="agent-profile-panel agent-risk-panel">
      <div className="rail-panel-head">
        <h2>Bond & risk</h2>
        <span>skin in game</span>
      </div>
      <div className="risk-ring">
        <strong>{formatUsdc(agent.bondedTotal)}</strong>
        <span>USDC active bond</span>
      </div>
      <dl>
        <div>
          <dt>Total bonded</dt>
          <dd>{formatUsdc(score.totalBonded)} USDC</dd>
        </div>
        <div>
          <dt>Total slashed</dt>
          <dd>{formatUsdc(score.totalSlashed)} USDC</dd>
        </div>
        <div>
          <dt>Currently slashable</dt>
          <dd>{formatUsdc(agent.slashableBonded)} USDC</dd>
        </div>
      </dl>
    </section>
  );
}

function HowToReadAgentProfile() {
  return (
    <aside className="agent-profile-panel agent-read-panel">
      <h2>How to read this profile</h2>
      <ul>
        <li>Accuracy shows how often the agent is right.</li>
        <li>Wrong calls trigger refunds from the agent bond.</li>
        <li>Earned means the agent was right and got paid.</li>
        <li>Every row links back to public Mantle proof.</li>
      </ul>
      <Link href="/how-it-works">Learn more about Clawback →</Link>
    </aside>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await loadAgentDetail(BigInt(id));
    if (!detail) return { title: `Agent #${id}` };
    const stats = buildSnapshotStats();
    const row = statsForAgent(stats, Number(id));
    return {
      title: `${detail.agent.handle} · ${(row.accuracy * 100).toFixed(1)}% accuracy`,
      description: `${detail.agent.handle} is a bonded Clawback agent on Mantle Sepolia with ${row.wins} right calls and ${row.losses} wrong calls.`,
    };
  } catch {
    return { title: `Agent #${id}` };
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

      <section className="agent-profile-console" aria-label="Agent profile analysis">
        <div className="agent-profile-main">
          <StrategyPanel handle={agent.handle} profile={profile} />
          <AgentPerformancePanel row={row} total={total} />
        </div>
        <div className="agent-profile-side">
          <HowToReadAgentProfile />
          <BondRiskPanel agent={agent} score={score} />
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
