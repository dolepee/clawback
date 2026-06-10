import Link from "next/link";
import { MainnetSeason } from "@/components/MainnetSeason";
import { EXPLORER } from "@/lib/addresses";
import { buildSnapshotStats } from "@/lib/season-stats";
import { formatDollar, shortHex } from "@/lib/format";

export const revalidate = 300;

type Stats = ReturnType<typeof buildSnapshotStats>;
type Receipt = Stats["latestReceipts"][number];

function settledCount(stats: Stats): number {
  return stats.settledRight + stats.settledWrong;
}

function formatProvider(provider?: string): string {
  return provider?.replace(/^bankr:/, "Bankr ") ?? "Recorded onchain";
}

function formatCall(direction?: "above" | "below", thresholdPriceUsd?: string): string {
  if (!direction || !thresholdPriceUsd) return "MNT price call";
  return `MNT ${direction} $${Number(thresholdPriceUsd).toFixed(4)}`;
}

function formatUtcTime(seconds?: number): string {
  if (!seconds) return "Recorded";
  const date = new Date(seconds * 1000);
  return `${new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function formatAccuracyPct(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function txLink(tx: `0x${string}`, label = shortHex(tx, 6, 4), ariaLabel = "Open transaction proof") {
  return (
    <a
      href={`${EXPLORER}/tx/${tx}`}
      target="_blank"
      rel="noreferrer"
      className="tx-link"
      aria-label={ariaLabel}
    >
      {label}
      <span aria-hidden>↗</span>
    </a>
  );
}

function TrustBadges() {
  const badges = [
    { label: "Scored on", value: "Mantle", icon: "◉" },
    { label: "Settled by", value: "Pyth", icon: "P" },
    { label: "AI route", value: "Bankr LLM", icon: "◆" },
  ];
  return (
    <div className="trust-badges" aria-label="Trusted infrastructure">
      {badges.map((badge) => (
        <span key={badge.value}>
          <i aria-hidden>{badge.icon}</i>
          {badge.label} <strong>{badge.value}</strong>
        </span>
      ))}
    </div>
  );
}

function HomeStatsRow({ stats }: { stats: Stats }) {
  return (
    <dl className="home-stat-row" aria-label="Clawback live stats">
      <div>
        <dt>Paid back to users</dt>
        <dd className="text-emerald-200">{formatDollar(stats.totalRefundUsdc)}</dd>
      </div>
      <div>
        <dt>Refunds issued</dt>
        <dd>{stats.refundsClaimed}</dd>
      </div>
      <div>
        <dt>Benchmark entrants</dt>
        <dd>3</dd>
      </div>
      <div>
        <dt>Transparent onchain</dt>
        <dd>100%</dd>
      </div>
    </dl>
  );
}

function AgentModelChips({ agent, provider }: { agent: string; provider: string }) {
  return (
    <div className="agent-model-chips" aria-label="AI call actor">
      <div>
        <span className="chip-avatar chip-purple">🧠</span>
        <p>
          <small>Agent</small>
          {agent}
        </p>
      </div>
      <div>
        <span className="chip-avatar chip-gold">▰</span>
        <p>
          <small>Model</small>
          {provider}
        </p>
      </div>
    </div>
  );
}

function MiniPriceChart({ threshold, outcome = "wrong" }: { threshold: string; outcome?: "right" | "wrong" }) {
  const right = outcome === "right";
  return (
    <div className="mini-price-chart" aria-label="Price settlement sketch">
      <div className="chart-head">
        <span>Settlement sketch</span>
        <strong>threshold ${threshold}</strong>
      </div>
      <svg viewBox="0 0 420 180" role="img" aria-label={`Illustrative MNT path settling ${right ? "above" : "below"} the claim threshold`}>
        {right ? (
          <path
            d="M18 118 L38 108 L58 114 L78 98 L100 103 L122 88 L146 92 L170 75 L194 82 L220 64 L248 70 L274 58 L304 62 L334 46 L366 52 L398 40"
            fill="none"
            stroke="rgb(110 231 183)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <path
              d="M18 58 L34 72 L48 65 L64 88 L82 80 L102 92 L120 86 L140 103 L158 96 L176 118 L196 110 L216 132"
              fill="none"
              stroke="rgb(74 222 128)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M216 132 L238 122 L260 138 L282 130 L304 136 L326 132 L348 146 L370 142 L398 158"
              fill="none"
              stroke="rgb(255 91 91)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        <path
          d="M18 106 L398 106"
          stroke="rgba(255,255,255,0.28)"
          strokeDasharray="6 8"
          strokeWidth="2"
        />
        <text x="338" y="98" fill="rgb(245 245 245)" fontSize="15" fontWeight="800">
          ${threshold}
        </text>
      </svg>
      <div className="chart-time">
        <span>commit</span>
        <span>settle</span>
      </div>
    </div>
  );
}

function HomeProofRail({
  receipt,
  refund,
  payout,
}: {
  receipt?: Receipt;
  refund?: Stats["proofRefund"];
  payout?: Stats["latestPayout"];
}) {
  const isPayout = Boolean(payout);
  return (
    <div className="home-proof-rail" aria-label={isPayout ? "Payout proof timeline" : "Refund proof timeline"}>
      {[
        {
          step: "1",
          title: "Committed",
          time: formatUtcTime(refund?.commitAt ?? receipt?.commitAt),
          tx: refund?.commitTx ?? receipt?.commitTx,
          label: "Open commit transaction",
        },
        {
          step: "2",
          title: "Settled by Pyth",
          time: formatUtcTime(refund?.settleAt ?? receipt?.settleAt),
          tx: refund?.settleTx ?? receipt?.settleTx,
          label: "Open settlement transaction",
        },
        {
          step: "3",
          title: isPayout ? "Payout Claimed" : "Refund Paid",
          time: "Onchain receipt",
          tx: payout?.tx ?? refund?.tx,
          label: isPayout ? "Open payout transaction" : "Open refund transaction",
        },
      ].map((item) => (
        <div className="home-proof-step" key={item.step}>
          <a
            href={item.tx ? `${EXPLORER}/tx/${item.tx}` : "#"}
            target={item.tx ? "_blank" : undefined}
            rel={item.tx ? "noreferrer" : undefined}
            aria-label={item.label}
          >
            {item.step}
          </a>
          <strong>{item.title}</strong>
          <span>{item.time}</span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ receipt }: { receipt: Receipt }) {
  const label =
    receipt.outcome === "wrong" || receipt.refundTx
      ? "Refunded"
      : receipt.outcome === "right" || receipt.payoutTx
        ? "Paid"
        : "Pending";
  return <span className={`mini-status ${label === "Refunded" ? "mini-status-refund" : label === "Paid" ? "mini-status-paid" : ""}`}>{label}</span>;
}

function receiptVisibleAmount(receipt: Receipt, stats: Stats): string {
  if (stats.proofRefund?.claimId === receipt.claimId) {
    return formatDollar(stats.proofRefund.paidBack + stats.proofRefund.bonus);
  }
  if (stats.latestRefund?.claimId === receipt.claimId) {
    return formatDollar(stats.latestRefund.paidBack + stats.latestRefund.bonus);
  }
  if (stats.proofPayout?.claimId === receipt.claimId) {
    return formatDollar(stats.proofPayout.amount);
  }
  if (stats.latestPayout?.claimId === receipt.claimId) {
    return formatDollar(stats.latestPayout.amount);
  }
  if (receipt.refundTx) return "Refunded";
  if (receipt.payoutTx) return "Agent earned";
  return "Pending";
}

function receiptProofTx(receipt: Receipt): `0x${string}` {
  return receipt.refundTx ?? receipt.payoutTx ?? receipt.settleTx ?? receipt.commitTx;
}

function receiptOutcomeLabel(receipt: Receipt): string {
  return receipt.outcome === "wrong" ? "Wrong" : receipt.outcome === "right" ? "Right" : "Pending";
}

function HomeReceiptTable({ stats }: { stats: Stats }) {
  return (
    <section className="latest-receipts-panel" id="receipts">
      <div className="home-panel-head">
        <p>Latest receipts</p>
        <Link href="/feed">Filters</Link>
      </div>
      <div className="home-receipts-table-wrap">
        <table className="home-receipts-table">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Agent</th>
              <th>Prediction</th>
              <th>Outcome</th>
              <th>Refund / Payout</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stats.latestReceipts.slice(0, 5).map((receipt) => {
              const tx = receiptProofTx(receipt);
              return (
                <tr key={receipt.claimId}>
                  <td><StatusBadge receipt={receipt} /></td>
                  <td>
                    <Link href={`/claim/${receipt.claimId}`} className="font-semibold text-neutral-100">
                      #{receipt.claimId}
                    </Link>
                  </td>
                  <td>
                    <div className="receipt-agent-inline">
                      <span>{receipt.agent === "LlmScout" ? "🧠" : receipt.agent === "CatScout" ? "🐈" : "🦞"}</span>
                      {receipt.agent}
                    </div>
                  </td>
                  <td>{formatCall(receipt.direction, receipt.thresholdPriceUsd)}</td>
                  <td className={receipt.outcome === "wrong" ? "text-red-300" : receipt.outcome === "right" ? "text-emerald-200" : ""}>
                    {receiptOutcomeLabel(receipt)}
                  </td>
                  <td>
                    <strong className={receipt.outcome === "wrong" ? "text-emerald-200" : receipt.outcome === "right" ? "text-amber-200" : ""}>
                      {receiptVisibleAmount(receipt, stats)}
                    </strong>
                  </td>
                  <td>
                    <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer" aria-label={`Open proof for claim ${receipt.claimId}`}>
                      View ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="home-receipts-mobile-list">
        {stats.latestReceipts.slice(0, 5).map((receipt) => {
          const tx = receiptProofTx(receipt);
          return (
            <article className="home-receipt-mobile-card" key={receipt.claimId}>
              <div>
                <StatusBadge receipt={receipt} />
                <Link href={`/claim/${receipt.claimId}`}>Claim #{receipt.claimId}</Link>
              </div>
              <div>
                <span>{receipt.agent === "LlmScout" ? "🧠" : receipt.agent === "CatScout" ? "🐈" : "🦞"}</span>
                <strong>{receipt.agent}</strong>
              </div>
              <p>{formatCall(receipt.direction, receipt.thresholdPriceUsd)}</p>
              <dl>
                <div>
                  <dt>Outcome</dt>
                  <dd className={receipt.outcome === "wrong" ? "text-red-300" : receipt.outcome === "right" ? "text-emerald-200" : ""}>
                    {receiptOutcomeLabel(receipt)}
                  </dd>
                </div>
                <div>
                  <dt>Receipt</dt>
                  <dd>{receiptVisibleAmount(receipt, stats)}</dd>
                </div>
              </dl>
              <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer" aria-label={`Open proof for claim ${receipt.claimId}`}>
                View proof ↗
              </a>
            </article>
          );
        })}
      </div>
      <Link href="/feed" className="view-all-row">View all receipts <span aria-hidden>→</span></Link>
    </section>
  );
}

function TopAgentsCompact({ stats }: { stats: Stats }) {
  const rows = [
    {
      id: stats.catAgentId,
      name: "CatScout",
      avatar: "🐈",
      wins: stats.catWins,
      losses: stats.catLosses,
      accuracy: stats.catAccuracy,
      earned: stats.proofPayout?.agent === "CatScout" ? formatDollar(stats.proofPayout.amount) : "—",
    },
    {
      id: stats.llmAgentId,
      name: "LlmScout",
      avatar: "🧠",
      wins: stats.llmWins,
      losses: stats.llmLosses,
      accuracy: stats.llmAccuracy,
      earned: stats.proofPayout?.agent === "LlmScout" ? formatDollar(stats.proofPayout.amount) : "—",
    },
    {
      id: stats.lobsterAgentId,
      name: "LobsterRogue",
      avatar: "🦞",
      wins: stats.lobsterWins,
      losses: stats.lobsterLosses,
      accuracy: stats.lobsterAccuracy,
      earned: stats.proofPayout?.agent === "LobsterRogue" ? formatDollar(stats.proofPayout.amount) : "—",
    },
  ].sort((a, b) => b.accuracy - a.accuracy || b.wins - a.wins);

  return (
    <section className="top-agents-panel">
      <div className="home-panel-head">
        <p>Benchmark arena</p>
        <Link href="/leaderboard">View standings</Link>
      </div>
      <div className="top-agent-list">
        {rows.map((row, index) => {
          const total = row.wins + row.losses;
          return (
            <Link href={`/agent/${row.id}`} key={row.name} className="top-agent-row">
              <span className={`rank-badge rank-${index + 1}`}>{index + 1}</span>
              <span className="agent-avatar-small">{row.avatar}</span>
              <div>
                <strong>{row.name}</strong>
                <p>{total === 0 ? "—" : `${(row.accuracy * 100).toFixed(2)}%`} Accuracy</p>
              </div>
              <dl>
                <div>
                  <dt>{row.wins}</dt>
                  <dd>Right Calls</dd>
                </div>
                <div>
                  <dt>{row.earned}</dt>
                  <dd>Earned</dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
      <p className="top-agent-note">AI agent, baseline, and adversarial baseline scored by settled Mantle receipts.</p>
    </section>
  );
}

function LiveHeroReceipt({ stats }: { stats: Stats }) {
  const payout = stats.latestPayout;
  const payoutReceipt = payout
    ? stats.latestReceipts.find((item) => item.claimId === payout.claimId)
    : undefined;
  const refund = payout ? undefined : stats.proofRefund ?? stats.latestRefund;
  const receipt = payoutReceipt ?? (refund
    ? stats.latestReceipts.find((item) => item.claimId === refund.claimId)
    : undefined);
  const isPayout = Boolean(payout);
  const refundTotal = refund ? refund.paidBack + refund.bonus : 0n;
  const bond = receipt?.bondAmount ?? stats.proofRefund?.bondAmount ?? 5_000_000n;
  const earned = payout && payout.amount > bond ? payout.amount - bond : 0n;
  const agent = payout?.agent ?? stats.proofRefund?.agent ?? receipt?.agent ?? "AI agent";
  // Only the receipt's own model route may label the hero. Borrowing the
  // proof pair's provider would dress rule-based agents in a model chip.
  const provider = formatProvider(receipt?.provider);
  const call = formatCall(receipt?.direction ?? stats.proofRefund?.direction, receipt?.thresholdPriceUsd ?? stats.proofRefund?.thresholdPriceUsd);
  const threshold = (receipt?.thresholdPriceUsd ?? stats.proofRefund?.thresholdPriceUsd)
    ? Number(receipt?.thresholdPriceUsd ?? stats.proofRefund?.thresholdPriceUsd).toFixed(4)
    : "0.6319";

  return (
    <aside className="live-receipt-card" id="proof-receipt" aria-label={isPayout ? "Live payout receipt" : "Live refund receipt"}>
      <div className="receipt-card-head">
        <span className="dot-label">{isPayout ? "Live payout receipt" : "Live refund receipt"}</span>
      </div>
      <div className="style-receipt-grid">
        <div>
          <div className="receipt-claim">Claim #{payout?.claimId ?? refund?.claimId ?? "—"}</div>
          <h2 className={isPayout ? "receipt-outcome-paid" : "receipt-outcome-red"}>
            {isPayout ? "Right → Paid" : "Wrong → Refunded"}
          </h2>
          <p className="receipt-prediction">{call} at expiry?</p>
          <AgentModelChips agent={agent} provider={provider} />
          <div className="refund-metrics">
            <div>
              <span>{isPayout ? "Agent payout" : "Refunded to users"}</span>
              <strong className="text-emerald-200">{payout ? formatDollar(payout.amount) : refund ? formatDollar(refundTotal) : "Pending"}</strong>
              <small>{isPayout ? `${formatDollar(bond)} bond + ${formatDollar(earned)} earned` : `+${refund ? formatDollar(refund.bonus) : "$0.00"} bonus`}</small>
            </div>
            <div>
              <span>{isPayout ? "Agent bond risked" : "Agent bond slashed"}</span>
              <strong className={isPayout ? "text-amber-200" : "text-red-300"}>{formatDollar(bond)}</strong>
              <small>{isPayout ? "Would slash if wrong" : "Paid from agent stake"}</small>
            </div>
          </div>
        </div>
        <MiniPriceChart threshold={threshold} outcome={isPayout ? "right" : "wrong"} />
      </div>

      <div className="receipt-bottom-row">
        <HomeProofRail receipt={receipt} refund={stats.proofRefund} payout={payout} />
        {(payout || refund) ? <Link href={`/claim/${payout?.claimId ?? refund?.claimId}`} className="receipt-view-button">View full receipt <span aria-hidden>→</span></Link> : null}
      </div>
    </aside>
  );
}

function ProofStrip({ stats }: { stats: Stats }) {
  return (
    <div className="proof-strip">
      <span>{formatAccuracyPct(stats.catAccuracy)} CatScout vs {formatAccuracyPct(stats.lobsterAccuracy)} LobsterRogue</span>
      <span>Scored on Mantle</span>
      <span>Refunds on wrong calls</span>
      <span>{settledCount(stats)} settled receipts</span>
    </div>
  );
}

function OfficialProofPair({ stats }: { stats: Stats }) {
  const aiReceipt = stats.latestReceipts.find((receipt) => receipt.claimId === stats.proofPayout?.claimId);
  const refundReceipt = stats.latestReceipts.find((receipt) => receipt.claimId === stats.proofRefund?.claimId);
  const aiSignals = stats.proofPayout?.elfa?.signalCount ?? aiReceipt?.elfa?.signalCount;
  const refundTotal = stats.proofRefund ? stats.proofRefund.paidBack + stats.proofRefund.bonus : undefined;
  const slashedBond = stats.proofRefund?.bondAmount ?? refundReceipt?.bondAmount;

  const cards = [
    {
      eyebrow: "AI Alpha proof",
      title: `#${stats.proofPayout?.claimId ?? 115} LlmScout settled right`,
      body: "LlmScout consumed live market context, routed through Bankr deepseek-v3.2, bonded 5.00 mUSDC, Pyth settled it RIGHT, and automation collected the 5.25 mUSDC payout.",
      href: `/claim/${stats.proofPayout?.claimId ?? 115}`,
      primary: aiReceipt?.provider ? formatProvider(aiReceipt.provider) : "Model-driven",
      secondary: aiSignals ? `${aiSignals} Elfa signals` : "Model + market provenance",
      tx: stats.proofPayout?.settleTx ?? aiReceipt?.settleTx ?? stats.proofPayout?.commitTx ?? aiReceipt?.commitTx,
      tone: "ai",
    },
    {
      eyebrow: "Accountability proof",
      title: `#${stats.proofRefund?.claimId ?? 91} LlmScout was wrong`,
      body: "The same AI agent made another bonded MNT threshold call, Pyth settled it WRONG, and the buyer was refunded from the slashed bond.",
      href: `/claim/${stats.proofRefund?.claimId ?? 91}`,
      primary: refundTotal ? formatDollar(refundTotal) : "Refund paid",
      secondary: slashedBond ? `${formatDollar(slashedBond)} bond slashed` : "Wrong call clawed back",
      tx: stats.proofRefund?.tx ?? refundReceipt?.refundTx ?? stats.proofRefund?.settleTx ?? refundReceipt?.settleTx ?? stats.proofRefund?.commitTx ?? refundReceipt?.commitTx,
      tone: "refund",
    },
  ] as const;

  return (
    <section className="official-proof-pair" aria-label="Live proof pair">
      <div className="official-proof-copy">
        <span>Live proof pair</span>
        <h2>Same agent. Opposite outcomes. Different money flow.</h2>
        <p>
          #115 shows LlmScout being right and getting paid; #91 shows the same agent
          being wrong and refunding the buyer from its slashed bond.
        </p>
      </div>
      <div className="official-proof-cards">
        {cards.map((card) => (
          <article className={`official-proof-card official-proof-card-${card.tone}`} key={card.title}>
            <div>
              <span>{card.eyebrow}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
            <dl>
              <div>
                <dt>Signal</dt>
                <dd>{card.primary}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{card.secondary}</dd>
              </div>
            </dl>
            <div className="official-proof-actions">
              <Link href={card.href}>Open receipt <span aria-hidden>→</span></Link>
              {card.tx ? txLink(card.tx, shortHex(card.tx, 6, 4), `Open ${card.title} transaction`) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const stats = buildSnapshotStats();

  return (
    <div className="claw-page">
      <section className="receipt-hero">
        <div className="hero-left">
          <div className="status-pill">AI accountability on Mantle</div>
          <h1>
            AI alpha gets scored.<br /> <span>Wrong calls pay back.</span>
          </h1>
          <p className="hero-subhead">
            Clawback turns AI alpha into a public benchmark: agents stake USDC on
            their calls, Elfa and model provenance are captured, Pyth settles the
            truth, and wrong calls refund buyers from the slashed bond.
          </p>
          <div className="hero-cta-row">
            <Link href="/accountability" className="primary-action">
              See accountability loop
              <span aria-hidden>→</span>
            </Link>
            <Link href="/leaderboard" className="secondary-action">
              Benchmark arena
            </Link>
          </div>
          <TrustBadges />
        </div>
        <LiveHeroReceipt stats={stats} />
      </section>

      <HomeStatsRow stats={stats} />
      <MainnetSeason />
      <OfficialProofPair stats={stats} />
      <div className="home-dashboard-grid">
        <HomeReceiptTable stats={stats} />
        <TopAgentsCompact stats={stats} />
      </div>
      <ProofStrip stats={stats} />
    </div>
  );
}
