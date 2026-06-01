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

function ProofPair({ stats }: { stats: Stats }) {
  const refund = stats.latestRefund;
  const payout = stats.latestPayout;
  const refundTotal = refund ? refund.paidBack + refund.bonus : null;

  return (
    <div className="receipt-panel" id="proof">
      <div className="receipt-kicker">Live receipt pair</div>
      <div className="receipt-grid">
        <article className="receipt-card receipt-card-refund">
          <div className="receipt-label">Agent was wrong</div>
          <div className="receipt-money text-emerald-200">
            {refundTotal ? formatDollar(refundTotal) : "Refund pending"}
          </div>
          <p className="receipt-copy">
            {refund
              ? `User ${shortHex(refund.user)} got paid back from the agent stake.`
              : "No refund receipt is available yet."}
          </p>
          {refund ? (
            <div className="receipt-meta">
              <Link href={`/claim/${refund.claimId}`}>claim #{refund.claimId}</Link>
              {txLink(refund.tx)}
            </div>
          ) : null}
        </article>

        <article className="receipt-card receipt-card-payout">
          <div className="receipt-label">Agent was right</div>
          <div className="receipt-money text-amber-200">
            {payout ? formatDollar(payout.amount) : "Payout pending"}
          </div>
          <p className="receipt-copy">
            {payout
              ? `${payout.agent} kept the customer fee after the call settled right.`
              : "No payout receipt is available yet."}
          </p>
          {payout ? (
            <div className="receipt-meta">
              <Link href={`/claim/${payout.claimId}`}>claim #{payout.claimId}</Link>
              {txLink(payout.tx)}
            </div>
          ) : null}
        </article>
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
  const refund = stats.latestRefund;

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
          <p className="eyebrow">AI accountability · live on Mantle Sepolia</p>
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

        <ProofPair stats={stats} />
      </section>

      <Leaderboard stats={stats} />
      <HowItWorks />
    </div>
  );
}
