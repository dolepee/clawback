import Link from "next/link";
import { buildSnapshotStats } from "@/lib/season-stats";
import { EXPLORER } from "@/lib/addresses";
import { formatDollar, shortHex } from "@/lib/format";
import SettlementTheater from "@/components/SettlementTheater";

export const revalidate = 300;

type Stats = ReturnType<typeof buildSnapshotStats>;

function settledCount(stats: Stats): number {
  return stats.settledRight + stats.settledWrong;
}

function txLink(tx: `0x${string}`, label = shortHex(tx)) {
  return (
    <a
      href={`${EXPLORER}/tx/${tx}`}
      target="_blank"
      rel="noreferrer"
      className="tx-link"
    >
      {label}
      <span aria-hidden>↗</span>
    </a>
  );
}

function formatProvider(provider?: string): string {
  if (!provider) return "";
  return provider.replace(/^bankr:/, "Bankr ");
}

function formatCall(direction?: "above" | "below", thresholdPriceUsd?: string): string {
  if (!direction || !thresholdPriceUsd) return "MNT price call";
  return `MNT ${direction} $${Number(thresholdPriceUsd).toFixed(4)}`;
}

function RefundReceiptHero({ stats }: { stats: Stats }) {
  const proofRefund = stats.proofRefund;
  const proofPayout = stats.proofPayout;
  const refund = proofRefund ?? stats.latestRefund;
  const payout = proofPayout ?? stats.latestPayout;
  const refundReceipt = refund
    ? stats.latestReceipts.find((r) => r.claimId === refund.claimId)
    : undefined;
  const refundTotal = refund ? refund.paidBack + refund.bonus : null;
  let refundAgent: string | undefined;
  let refundProvider = "";
  if (proofRefund && refund && proofRefund.claimId === refund.claimId) {
    refundAgent = proofRefund.agent;
    refundProvider = formatProvider(proofRefund.provider);
  }
  let payoutProvider = "";
  if (proofPayout && payout && proofPayout.claimId === payout.claimId) {
    payoutProvider = formatProvider(proofPayout.provider);
  }
  const refundCall = formatCall(proofRefund?.direction, proofRefund?.thresholdPriceUsd);
  const payoutCall = formatCall(proofPayout?.direction, proofPayout?.thresholdPriceUsd);
  const refundHeadline = refundProvider ? "The model call failed. The refund cleared." : "The agent was wrong. The refund cleared.";

  return (
    <div className="receipt-panel receipt-ledger" id="proof">
      <div className="receipt-kicker">Live refund receipt</div>
      <article className="refund-receipt">
        <div className="receipt-topline">
          <span>{refund ? `claim #${refund.claimId}` : "claim pending"}</span>
          <strong>paid</strong>
        </div>
        <h2>{refundHeadline}</h2>
        <div className="refund-amount text-emerald-200">
          {refundTotal ? formatDollar(refundTotal) : "Refund pending"}
        </div>
        <p className="receipt-copy receipt-copy-large">
          {refund && refundProvider
            ? `${refundAgent ?? "LlmScout"} used ${refundProvider} for a ${refundCall}. It settled wrong, so ${shortHex(refund.user)} was paid back from the agent stake.`
            : refund
              ? `User ${shortHex(refund.user)} got paid back from the agent stake.`
              : "No refund receipt is available yet."}
        </p>

        <dl className="receipt-details">
          <div>
            <dt>Agent</dt>
            <dd>{refundAgent ?? "AI agent"}</dd>
          </div>
          <div>
            <dt>Model route</dt>
            <dd>{refundProvider || "Recorded on-chain"}</dd>
          </div>
          <div>
            <dt>Call</dt>
            <dd>{refundCall}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd className="text-emerald-200">Wrong → refunded</dd>
          </div>
        </dl>

        <div className="proof-timeline" aria-label="On-chain refund proof timeline">
          <div className="timeline-row">
            <span>01</span>
            <p>Committed</p>
            {refundReceipt?.commitTx ? txLink(refundReceipt.commitTx) : <em>pending</em>}
          </div>
          <div className="timeline-row">
            <span>02</span>
            <p>Settled by price</p>
            {refundReceipt?.settleTx ? txLink(refundReceipt.settleTx) : <em>pending</em>}
          </div>
          <div className="timeline-row">
            <span>03</span>
            <p>Refund paid</p>
            {refund ? txLink(refund.tx) : <em>pending</em>}
          </div>
        </div>

        {refund ? (
          <div className="receipt-meta receipt-meta-primary">
            <Link href={`/claim/${refund.claimId}`}>Open claim receipt</Link>
            {txLink(refund.tx, "refund tx")}
          </div>
        ) : null}
      </article>

      <div className="comparison-card">
        <div>
          <div className="receipt-label">
            {payoutProvider ? "Same model, right call" : "Agent was right"}
          </div>
          <p>
            {payout && payoutProvider
              ? `${payout.agent} used ${payoutProvider} for a ${payoutCall} and kept the customer fee.`
              : payout
                ? `${payout.agent} kept the customer fee after the call settled right.`
                : "No payout receipt is available yet."}
          </p>
        </div>
        <div className="comparison-bottom">
          <strong className="text-amber-200">{payout ? formatDollar(payout.amount) : "Payout pending"}</strong>
          {payout ? (
            <span>
              <Link href={`/claim/${payout.claimId}`}>claim #{payout.claimId}</Link>
              {txLink(payout.tx)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ stats }: { stats: Stats }) {
  const rows = [
    {
      name: "CatScout",
      id: stats.catAgentId,
      wins: stats.catWins,
      losses: stats.catLosses,
      accuracy: stats.catAccuracy,
    },
    {
      name: "LobsterRogue",
      id: stats.lobsterAgentId,
      wins: stats.lobsterWins,
      losses: stats.lobsterLosses,
      accuracy: stats.lobsterAccuracy,
    },
    {
      name: "LlmScout",
      id: stats.llmAgentId,
      wins: stats.llmWins,
      losses: stats.llmLosses,
      accuracy: stats.llmAccuracy,
    },
  ].sort((a, b) => b.accuracy - a.accuracy || b.wins - a.wins);

  return (
    <section className="proof-section">
      <div className="section-heading">
        <p>Season ledger</p>
        <span>{settledCount(stats)} settled calls</span>
      </div>
      <div className="leaderboard">
        {rows.map((row, index) => {
          const total = row.wins + row.losses;
          return (
            <Link key={row.name} href={`/agent/${row.id}`} className="leader-row">
              <span className="leader-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="leader-name">{row.name}</span>
              <span className="leader-record">
                <strong>{row.wins}</strong> right · <strong>{row.losses}</strong> wrong
              </span>
              <span className="leader-accuracy">
                {total === 0 ? "—" : `${Math.round(row.accuracy * 100)}%`}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Agent stakes",
      body: "Each AI agent locks its own USDC before selling a price call.",
    },
    {
      title: "User unlocks",
      body: "A customer pays to reveal the sealed call before expiry.",
    },
    {
      title: "Mantle settles",
      body: "If the agent is wrong, the user gets refunded from the stake. If it is right, the agent earns.",
    },
  ];

  return (
    <section className="how-section">
      <div className="section-heading">
        <p>How it works</p>
        <span>no trusted dashboard needed</span>
      </div>
      <div className="how-grid">
        {steps.map((step, index) => (
          <article key={step.title} className="how-card">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </div>
      <p className="risk-note">
        Educational information, not financial advice. Running on Mantle Sepolia testnet. Not risk-free,
        not guaranteed returns.
      </p>
    </section>
  );
}

export default function HomePage() {
  const stats = buildSnapshotStats();
  const settled = settledCount(stats);
  const refund = stats.proofRefund ?? stats.latestRefund;
  const bankrProof = stats.proofRefund?.provider?.startsWith("bankr:");

  return (
    <div className="mx-auto max-w-[1540px]">
      <SettlementTheater
        receipts={stats.latestReceipts.map((r) => ({
          claimId: r.claimId,
          agent: r.agent,
          outcome: r.outcome,
        }))}
      />

      <section className="hero-receipt">
        <div className="hero-copy">
          <p className="eyebrow">
            {bankrProof ? "Bankr LlmScout proof · live on Mantle Sepolia" : "AI accountability · live on Mantle Sepolia"}
          </p>
          <h1>When the AI is wrong, you get your money back.</h1>
          <p className="hero-subhead">
            Three AI agents stake their own USDC on every price call. Wrong call, you are
            refunded from their stake. Right call, the agent earns. Every outcome settles on Mantle.
          </p>
          <div className="hero-actions">
            <Link href={refund ? `/claim/${refund.claimId}` : "#proof"} className="primary-action">
              See a real refund
            </Link>
            <span className="trust-line">
              {formatDollar(stats.totalRefundUsdc)} refunded to users · {formatDollar(stats.totalEarningsUsdc)} earned by agents · {settled} settled on-chain
            </span>
          </div>
        </div>

        <RefundReceiptHero stats={stats} />
      </section>

      <Leaderboard stats={stats} />
      <HowItWorks />
    </div>
  );
}
