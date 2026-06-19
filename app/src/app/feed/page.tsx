import type { Metadata } from "next";
import Link from "next/link";
import { EXPLORER } from "@/lib/addresses";
import { buildSnapshotStats } from "@/lib/season-stats";
import { formatDollar, shortHex } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Receipts",
  description: "Every AI call, settlement, refund, and payout with onchain proof one click away.",
};

type Stats = ReturnType<typeof buildSnapshotStats>;
type Receipt = Stats["latestReceipts"][number];
type Filter = "all" | "refunded" | "agent-paid";

function formatCall(direction?: "above" | "below", thresholdPriceUsd?: string): string {
  if (!direction || !thresholdPriceUsd) return "MNT price call";
  return `MNT ${direction} $${Number(thresholdPriceUsd).toFixed(4)}`;
}

function receiptAmount(receipt: Receipt, stats: Stats): string {
  if (stats.proofRefund?.claimId === receipt.claimId) {
    return formatDollar(stats.proofRefund.paidBack + stats.proofRefund.bonus);
  }
  if (stats.proofPayout?.claimId === receipt.claimId) {
    return formatDollar(stats.proofPayout.amount);
  }
  if (stats.latestRefund?.claimId === receipt.claimId) {
    return formatDollar(stats.latestRefund.paidBack + stats.latestRefund.bonus);
  }
  if (stats.latestPayout?.claimId === receipt.claimId) {
    return formatDollar(stats.latestPayout.amount);
  }
  if (receipt.refundTx) return "Refunded";
  if (receipt.payoutTx) return "Agent earned";
  return "Pending";
}

function proofTx(receipt: Receipt): `0x${string}` {
  return receipt.refundTx ?? receipt.payoutTx ?? receipt.settleTx ?? receipt.commitTx;
}

function proofRefundReceipt(stats: Stats): Receipt | undefined {
  const proof = stats.proofRefund;
  if (!proof) return undefined;
  return {
    claimId: proof.claimId,
    agent: proof.agent,
    outcome: "wrong",
    commitTx: proof.commitTx ?? proof.tx,
    settleTx: proof.settleTx,
    bondAmount: proof.bondAmount,
    commitAt: proof.commitAt,
    settleAt: proof.settleAt,
    refundTx: proof.tx,
    provider: proof.provider,
    fellBack: proof.fellBack,
    direction: proof.direction,
    thresholdPriceUsd: proof.thresholdPriceUsd,
    elfa: proof.elfa,
  } as Receipt;
}

function proofPayoutReceipt(stats: Stats): Receipt | undefined {
  const proof = stats.proofPayout;
  if (!proof) return undefined;
  return {
    claimId: proof.claimId,
    agent: proof.agent,
    outcome: "right",
    commitTx: proof.commitTx ?? proof.tx,
    settleTx: proof.settleTx,
    bondAmount: proof.bondAmount,
    commitAt: proof.commitAt,
    settleAt: proof.settleAt,
    payoutTx: proof.tx,
    provider: proof.provider,
    fellBack: proof.fellBack,
    direction: proof.direction,
    thresholdPriceUsd: proof.thresholdPriceUsd,
    elfa: proof.elfa,
  } as Receipt;
}

function AgentBadge({ agent }: { agent: Receipt["agent"] }) {
  return (
    <div className="receipt-agent">
      <span className="agent-avatar-small">{agent === "LlmScout" ? "🧠" : agent === "CatScout" ? "🐈" : "🦞"}</span>
      <div>
        <strong>{agent}</strong>
        <p>{agent === "LlmScout" ? "Bankr LLM" : "Bonded agent"}</p>
      </div>
    </div>
  );
}

function formatRelativeTime(seconds?: number): string {
  if (!seconds) return "pending";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 90) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function thresholdPriceLabel(receipt: Receipt): string {
  return receipt.thresholdPriceUsd
    ? `$${Number(receipt.thresholdPriceUsd).toFixed(4)}`
    : "Pending";
}

function receiptTimeLabel(receipt: Receipt): string {
  return formatRelativeTime(receipt.settleAt ?? receipt.commitAt);
}

function Sparkline({ tone = "green" }: { tone?: "green" | "blue" | "purple" }) {
  return (
    <svg className={`mini-spark mini-spark-${tone}`} viewBox="0 0 96 36" aria-hidden="true">
      <path
        d="M4 28 C14 20 18 25 27 16 S42 18 50 12 65 17 74 9 86 13 92 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function FeedMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "blue" | "purple";
}) {
  return (
    <article className="feed-metric-card">
      <span className={`feed-metric-icon feed-metric-${tone}`} />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
      <Sparkline tone={tone} />
    </article>
  );
}

function ReceiptsSideRail({ stats }: { stats: Stats }) {
  const agentRows = [
    {
      id: stats.catAgentId,
      name: "CatScout",
      avatar: "🐈",
      accuracy: stats.catAccuracy,
      earned: formatDollar(stats.catEarnedUsdc ?? 0n),
    },
    {
      id: stats.llmAgentId,
      name: "LlmScout",
      avatar: "🧠",
      accuracy: stats.llmAccuracy,
      earned: formatDollar(stats.llmEarnedUsdc ?? 0n),
    },
    {
      id: stats.lobsterAgentId,
      name: "LobsterRogue",
      avatar: "🦞",
      accuracy: stats.lobsterAccuracy,
      earned: formatDollar(stats.lobsterEarnedUsdc ?? 0n),
    },
  ].sort((a, b) => b.accuracy - a.accuracy);

  return (
    <aside className="receipts-side-rail" aria-label="Receipt context">
      <section className="rail-panel">
        <div className="rail-panel-head">
          <span className="online-dot" />
          <h2>Recent activity</h2>
        </div>
        <div className="activity-list">
          {stats.latestReceipts.slice(0, 4).map((receipt) => {
            const refunded = receipt.outcome === "wrong" || Boolean(receipt.refundTx);
            return (
              <Link href={`/claim/${receipt.claimId}`} key={receipt.claimId}>
                <span className={refunded ? "activity-dot activity-green" : "activity-dot activity-blue"} />
                <div>
                  <strong>{refunded ? "Refund issued" : receipt.outcome === "right" ? "Agent payout" : "Pending claim"}</strong>
                  <small>
                    Claim #{receipt.claimId} · {receipt.agent}
                  </small>
                </div>
                <em>{receiptAmount(receipt, stats)}</em>
              </Link>
            );
          })}
        </div>
        <Link className="rail-link" href="/feed">
          View all activity →
        </Link>
      </section>

      <section className="rail-panel">
        <div className="rail-panel-head">
          <h2>Top performing agents</h2>
          <Link href="/leaderboard">Leaderboard →</Link>
        </div>
        <div className="side-agent-list">
          {agentRows.map((agent, index) => (
            <Link href={`/agent/${agent.id}`} key={agent.name}>
              <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
              <span className="agent-avatar-small">{agent.avatar}</span>
              <div>
                <strong>{agent.name}</strong>
                <small>{(agent.accuracy * 100).toFixed(2)}% accuracy</small>
              </div>
              <em>{agent.earned}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="rail-panel rail-help">
        <span>Need help understanding refunds?</span>
        <p>
          Wrong calls slash agent capital. That bond funds the buyer refund and
          leaves a public Mantle receipt.
        </p>
        <Link href="/how-it-works">Learn the basics →</Link>
      </section>
    </aside>
  );
}

function ReceiptLine({ receipt, stats }: { receipt: Receipt; stats: Stats }) {
  const isRefund = receipt.outcome === "wrong" || Boolean(receipt.refundTx);
  const result = isRefund ? "Refunded" : receipt.outcome === "right" ? "Paid to agent" : "Pending";
  const tx = proofTx(receipt);

  return (
    <tr>
      <td>
        <span className={`status-token ${isRefund ? "status-token-refund" : receipt.outcome === "right" ? "status-token-paid" : "status-token-pending"}`}>
          {isRefund ? "Refunded" : receipt.outcome === "right" ? "Paid" : "Pending"}
        </span>
      </td>
      <td>
        <Link href={`/claim/${receipt.claimId}`} className="font-semibold text-neutral-100 hover:text-white">
          #{receipt.claimId}
        </Link>
      </td>
      <td>
        <AgentBadge agent={receipt.agent} />
      </td>
      <td>
        <strong>{formatCall(receipt.direction, receipt.thresholdPriceUsd)}</strong>
        <p>Bonded threshold call</p>
      </td>
      <td>
        <strong>{thresholdPriceLabel(receipt)}</strong>
        <p>{receipt.outcome === "pending" ? "Committed strike" : "Prediction strike"}</p>
      </td>
      <td>
        <span className={`outcome-pill ${isRefund ? "outcome-refund" : receipt.outcome === "right" ? "outcome-earned" : ""}`}>
          {receipt.outcome === "wrong" ? "Wrong" : receipt.outcome === "right" ? "Right" : "Pending"}
        </span>
      </td>
      <td>
        <strong className={isRefund ? "text-emerald-200" : receipt.outcome === "right" ? "text-amber-200" : ""}>
          {result}
        </strong>
        <p>{receipt.outcome === "wrong" ? "User protected" : receipt.outcome === "right" ? "Agent earned" : "Awaiting settlement"}</p>
      </td>
      <td>
        <strong className={isRefund ? "text-emerald-200" : receipt.outcome === "right" ? "text-amber-200" : ""}>
          {receiptAmount(receipt, stats)}
        </strong>
      </td>
      <td>
        <strong>{receiptTimeLabel(receipt)}</strong>
        <p>{receipt.settleAt ? "Settled" : "Committed"}</p>
      </td>
      <td>
        <div className="table-actions">
          <Link href={`/claim/${receipt.claimId}`}>View</Link>
          <a
            href={`${EXPLORER}/tx/${tx}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open onchain proof for claim ${receipt.claimId}`}
          >
            ↗
          </a>
        </div>
      </td>
    </tr>
  );
}

function StoryReceiptCard({
  title,
  receipt,
  stats,
  fallback,
}: {
  title: string;
  receipt?: Receipt;
  stats: Stats;
  fallback?: {
    headline: string;
    body: string;
    metricLabel: string;
    metricValue: string;
  };
}) {
  if (!receipt) {
    return (
      <article className="story-receipt-card">
        <span>{title}</span>
        <h2>{fallback?.headline ?? "Receipt pending"}</h2>
        <p>{fallback?.body ?? "This lane will fill when the next matching claim is captured."}</p>
        {fallback ? (
          <dl>
            <div>
              <dt>{fallback.metricLabel}</dt>
              <dd>{fallback.metricValue}</dd>
            </div>
          </dl>
        ) : null}
      </article>
    );
  }
  const isRefund = receipt.outcome === "wrong" || Boolean(receipt.refundTx);
  const isPaid = receipt.outcome === "right" || Boolean(receipt.payoutTx);
  const tx = proofTx(receipt);
  return (
    <article className={`story-receipt-card ${isRefund ? "story-refund" : isPaid ? "story-paid" : "story-pending"}`}>
      <span>{title}</span>
      <h2>{isRefund ? "Wrong -> refunded" : isPaid ? "Right -> earned" : "Pending -> on the hook"}</h2>
      <p>
        {receipt.agent} predicted {formatCall(receipt.direction, receipt.thresholdPriceUsd)}.{" "}
        {isRefund
          ? "The refund path is the product moment."
          : isPaid
            ? "The agent was rewarded for being right."
            : "The bond is locked until the oracle settles it."}
      </p>
      <dl>
        <div>
          <dt>Claim</dt>
          <dd>#{receipt.claimId}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{receiptAmount(receipt, stats)}</dd>
        </div>
      </dl>
      <Link href={`/claim/${receipt.claimId}`}>Open receipt</Link>
      <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer">
        Verify on Mantle <span aria-hidden>↗</span>
      </a>
    </article>
  );
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const rawFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter: Filter =
    rawFilter === "refunded" || rawFilter === "agent-paid" ? rawFilter : "all";
  const stats = buildSnapshotStats();
  const allRows = stats.latestReceipts;
  const refundStory = proofRefundReceipt(stats) ?? allRows.find((receipt) => receipt.outcome === "wrong" || receipt.refundTx);
  const paidStory = proofPayoutReceipt(stats) ?? allRows.find((receipt) => receipt.outcome === "right" || receipt.payoutTx);
  const pendingStory = allRows.find((receipt) => receipt.outcome === "pending");
  const rows = allRows.filter((receipt) => {
    if (filter === "refunded") return receipt.outcome === "wrong" || Boolean(receipt.refundTx);
    if (filter === "agent-paid") return receipt.outcome === "right" || Boolean(receipt.payoutTx);
    return true;
  });

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "refunded", label: "Refunded" },
    { id: "agent-paid", label: "Paid to Agent" },
  ];

  return (
    <div className="claw-page page-wide">
      <section className="page-hero">
        <p>Onchain receipt feed</p>
        <h1>Receipts</h1>
        <span>
          Every AI call, settlement, refund, and payout with the onchain proof one click away.
        </span>
      </section>

      <section className="feed-metric-grid" aria-label="Season stats">
        <FeedMetricCard
          label="Total claims"
          value={String(stats.totalClaims)}
          detail={`+${Math.max(0, stats.totalClaims - stats.latestReceipts.length)} historical receipts`}
          tone="green"
        />
        <FeedMetricCard
          label="Refunded users"
          value={formatDollar(stats.totalRefundUsdc)}
          detail={`${stats.refundsClaimed} refund receipts`}
          tone="purple"
        />
        <FeedMetricCard
          label="Agent payouts"
          value={formatDollar(stats.totalEarningsUsdc)}
          detail={`${stats.earningsClaimed} paid outcomes`}
          tone="blue"
        />
        <FeedMetricCard
          label="Transparency"
          value="100%"
          detail="Onchain verified"
          tone="green"
        />
      </section>

      <div className="mock-feed-layout">
        <div className="mock-feed-main">
          <section className="receipt-story-grid" aria-label="Receipt outcome stories">
            <StoryReceiptCard title="Best user moment" receipt={refundStory} stats={stats} />
            <StoryReceiptCard
              title="Agent upside"
              receipt={paidStory}
              stats={stats}
              fallback={{
                headline: "Right -> agent earns",
                body: "When an agent is correct, the bonded prediction pays the agent instead of refunding users.",
                metricLabel: "Right calls",
                metricValue: String(stats.settledRight),
              }}
            />
            <StoryReceiptCard title="Live risk" receipt={pendingStory} stats={stats} />
          </section>

          <section className="receipts-panel">
            <div className="receipts-toolbar">
              <div>
                <h2>Recent receipts</h2>
                <p>Latest settlements from CatScout, LobsterRogue, and LlmScout.</p>
              </div>
              <div className="receipt-filter-controls">
                <span>Search by claim #, agent, or user</span>
                <nav aria-label="Receipt filters">
                  {filters.map((item) => (
                    <Link
                      key={item.id}
                      href={item.id === "all" ? "/feed" : `/feed?filter=${item.id}`}
                      className={item.id === filter ? "active" : ""}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="empty-receipts">No receipts for this filter yet.</div>
            ) : (
              <div className="receipt-table-wrap">
                <table className="receipt-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Claim #</th>
                      <th>Agent</th>
                      <th>Prediction</th>
                      <th>Threshold</th>
                      <th>Outcome</th>
                      <th>Result</th>
                      <th>Refund / payout</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((receipt) => (
                      <ReceiptLine key={receipt.claimId} receipt={receipt} stats={stats} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <ReceiptsSideRail stats={stats} />
      </div>
    </div>
  );
}
