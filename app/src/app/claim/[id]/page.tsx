export const maxDuration = 60;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeAbiParameters } from "viem";
import { CLAIM_STATE, MARKET_LABEL } from "@/lib/abi";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { loadClaimTimeline, type TimelineEvent } from "@/lib/claim-timeline";
import { loadClaimDetail } from "@/lib/data";
import {
  decodePredictionParams,
  formatDollar,
  formatTimestamp,
  formatUsdc,
  predictionQuestion,
  shortHex,
} from "@/lib/format";
import { buildSnapshotStats } from "@/lib/season-stats";
import ClaimActions from "@/components/ClaimActions";
import ClaimLiveStatus from "@/components/ClaimLiveStatus";
import SettlementReplay from "@/components/SettlementReplay";
import ShareClaim from "@/components/ShareClaim";

export const dynamic = "force-dynamic";
export const revalidate = 15;

type SnapshotReceipt = ReturnType<typeof buildSnapshotStats>["latestReceipts"][number];
type ProofTimelineRow = {
  label: string;
  body: string;
  tx: `0x${string}` | undefined;
};
type SettlementProof = {
  mntPrice: bigint;
  ethPrice: bigint;
  publishTime: bigint;
  marketId: number;
};

function formatCall(direction?: "above" | "below", thresholdPriceUsd?: string): string {
  if (!direction || !thresholdPriceUsd) return "MNT price call";
  return `MNT ${direction} $${Number(thresholdPriceUsd).toFixed(4)}`;
}

function txLink(tx: `0x${string}`, label = shortHex(tx, 6, 4), ariaLabel = "Open onchain proof") {
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

function providerLabel(provider?: string): string {
  return provider?.replace(/^bankr:/, "Bankr ") ?? "Recorded onchain";
}

function eventTx(events: TimelineEvent[], kind: TimelineEvent["kind"]): `0x${string}` | undefined {
  return events.find((event) => event.kind === kind)?.tx;
}

function receiptTx(receipt: SnapshotReceipt | undefined, kind: "commit" | "settle" | "refund" | "payout") {
  if (!receipt) return undefined;
  if (kind === "commit") return receipt.commitTx;
  if (kind === "settle") return receipt.settleTx;
  if (kind === "refund") return receipt.refundTx;
  return receipt.payoutTx;
}

function decodeSettlementProof(proof: `0x${string}` | undefined): SettlementProof | undefined {
  if (!proof || proof === "0x") return undefined;
  try {
    const [mntPrice, ethPrice, publishTime, marketId] = decodeAbiParameters(
      [{ type: "int64" }, { type: "int64" }, { type: "uint256" }, { type: "uint8" }],
      proof,
    );
    return { mntPrice, ethPrice, publishTime, marketId };
  } catch {
    return undefined;
  }
}

function formatOraclePrice(price: bigint | undefined): string | undefined {
  if (price === undefined) return undefined;
  return `$${(Number(price) / 1e8).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })}`;
}

function formatDollarExact(amount: bigint): string {
  const value = Number(amount) / 1e6;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })}`;
}

function ReceiptPricePanel({
  threshold,
  resultPrice,
  agentRight,
}: {
  threshold?: string;
  resultPrice?: string;
  agentRight: boolean;
}) {
  const thresholdText = threshold ? `$${Number(threshold).toFixed(4)}` : "threshold";
  return (
    <aside className="receipt-price-panel" aria-label="Settlement price chart">
      <div className="receipt-price-head">
        <span>MNT price (USD)</span>
        <strong>{agentRight ? "Right path" : "Refund path"}</strong>
      </div>
      <svg viewBox="0 0 620 250" role="img" aria-label="Illustrative MNT settlement chart">
        {agentRight ? (
          <path
            d="M28 142 C60 126 78 136 106 116 S160 96 190 112 244 116 278 92 332 70 370 88 422 74 470 66 534 74 590 52"
            fill="none"
            stroke="rgb(110 231 183)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        ) : (
          <>
            <path
              d="M28 102 C60 82 78 112 106 92 S160 76 190 96 244 116 278 96 332 72 370 96"
              fill="none"
              stroke="rgb(110 231 183)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
            />
            <path
              className="receipt-price-loss"
              d="M370 96 C408 118 430 132 470 118 S534 116 590 142"
              fill="none"
              stroke="rgb(255 91 91)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
            />
          </>
        )}
        <path d="M28 126 H590" stroke="rgba(255,255,255,0.28)" strokeDasharray="9 12" strokeWidth="2" />
        <text x="454" y="118" fill="rgb(245 245 245)" fontSize="18" fontWeight="800">
          {thresholdText}
        </text>
        <circle cx="590" cy={agentRight ? "52" : "142"} r="7" fill={agentRight ? "rgb(110 231 183)" : "rgb(255 91 91)"} />
      </svg>
      <div className="receipt-price-foot">
        <span>Commit</span>
        <strong className={agentRight ? "price-green" : ""}>{resultPrice ?? "Pyth settled"}</strong>
        <span>Expiry</span>
      </div>
    </aside>
  );
}

function ReceiptStepStrip({
  commitTx,
  settleTx,
  finalTx,
  agentRight,
}: {
  commitTx?: `0x${string}`;
  settleTx?: `0x${string}`;
  finalTx?: `0x${string}`;
  agentRight: boolean;
}) {
  const steps = [
    { n: 1, label: "Committed", tx: commitTx },
    { n: 2, label: "Settled by Pyth", tx: settleTx },
    { n: 3, label: agentRight ? "Agent paid" : "Refund paid", tx: finalTx },
  ];
  return (
    <section className="receipt-step-strip" aria-label="Receipt settlement steps">
      {steps.map((step) => (
        <div key={step.label}>
          <span>{step.n}</span>
          <strong>{step.label}</strong>
          {step.tx ? txLink(step.tx, shortHex(step.tx, 5, 4), `Open ${step.label} transaction`) : <em>recorded</em>}
        </div>
      ))}
    </section>
  );
}

function thresholdLabel(prediction: ReturnType<typeof decodePredictionParams>): string | undefined {
  if (prediction.kind === "threshold") {
    return `${prediction.direction} $${prediction.thresholdPriceUsd.toFixed(4)}`;
  }
  if (prediction.kind === "outperform") {
    return `MNT vs mETH +${(prediction.minOutperformBps / 100).toFixed(2)}%`;
  }
  return undefined;
}

function timelineRefund(events: TimelineEvent[]) {
  return events.find((event): event is Extract<TimelineEvent, { kind: "refund" }> => event.kind === "refund");
}

function timelinePayout(events: TimelineEvent[]) {
  return events.find((event): event is Extract<TimelineEvent, { kind: "payout" }> => event.kind === "payout");
}

function ProofTimeline({
  events,
  receipt,
  agentRight,
  fallbackUnlockAmount = 0n,
}: {
  events: TimelineEvent[];
  receipt?: SnapshotReceipt;
  agentRight: boolean;
  fallbackUnlockAmount?: bigint;
}) {
  const commit = eventTx(events, "commit") ?? receiptTx(receipt, "commit");
  const unlock = events.find((event): event is Extract<TimelineEvent, { kind: "unlock" }> => event.kind === "unlock");
  const settle = eventTx(events, "settle") ?? receiptTx(receipt, "settle");
  const payment = agentRight
    ? eventTx(events, "payout") ?? receiptTx(receipt, "payout")
    : eventTx(events, "refund") ?? receiptTx(receipt, "refund");

  const rawRows: Array<ProofTimelineRow | null> = [
    { label: "Committed", body: "The model made this call and locked its bond.", tx: commit },
    unlock
      ? {
          label: "Unlocked by payer",
          body: `${shortHex(unlock.payer)} paid ${formatUsdc(unlock.amount)} USDC before settlement.`,
          tx: unlock.tx,
        }
      : fallbackUnlockAmount > 0n
        ? {
            label: "Unlock escrowed",
            body: `${formatUsdc(fallbackUnlockAmount)} USDC is recorded in escrow before settlement.`,
            tx: undefined,
          }
      : null,
    settle
      ? { label: "Settled by Pyth", body: "Pyth checked the market after expiry.", tx: settle }
      : { label: "Awaiting Pyth", body: "Settlement opens after the expiry window closes.", tx: undefined },
    payment
      ? {
          label: agentRight ? "Agent paid" : "Refund paid",
          body: agentRight ? "The right call let the agent earn." : "The wrong call paid users back onchain.",
          tx: payment,
        }
      : null,
  ];
  const rows = rawRows.filter((row): row is ProofTimelineRow => row !== null);

  return (
    <section className="detail-card proof-card">
      <div className="detail-kicker">Proof timeline</div>
      <div className="proof-timeline">
        {rows.map((row, index) => (
          <div key={row.label} className="timeline-row">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <p>{row.label}</p>
              <small>{row.body}</small>
            </div>
            {row.tx ? txLink(row.tx, shortHex(row.tx, 5, 4), `Open ${row.label} transaction`) : <em>recorded</em>}
          </div>
        ))}
      </div>
      {payment ? <div className="mt-4">{txLink(payment, "View full proof", "Open final payment proof")}</div> : null}
    </section>
  );
}

function AiPipeline({
  agent,
  provider,
  prediction,
  receipt,
  skillsHash,
}: {
  agent: string;
  provider: string;
  prediction: string;
  receipt?: SnapshotReceipt;
  skillsHash?: `0x${string}`;
}) {
  const signals = receipt?.elfa?.signals ?? [];
  return (
    <section className="ai-pipeline-card" aria-label="AI reasoning pipeline">
      <div className="pipeline-copy">
        <div className="detail-kicker">AI reasoning path</div>
        <h2>Signal evidence, model route, bonded call, receipt.</h2>
        <p>
          The receipt shows what data the AI used, what model made the call,
          and which onchain proof will score the result.
        </p>
      </div>
      <div className="pipeline-steps">
        <div>
          <span>01</span>
          <strong>Elfa signals</strong>
          <p>{receipt?.elfa ? `${receipt.elfa.signalCount} captured` : "Not attached"}</p>
        </div>
        <div>
          <span>02</span>
          <strong>{agent}</strong>
          <p>{provider}</p>
        </div>
        <div>
          <span>03</span>
          <strong>Threshold call</strong>
          <p>{prediction}</p>
        </div>
        <div>
          <span>04</span>
          <strong>Proof hash</strong>
          <p>{skillsHash ? shortHex(skillsHash, 8, 6) : shortHex(receipt?.commitTx ?? "0x", 8, 6)}</p>
        </div>
      </div>
      {signals.length > 0 ? (
        <div className="pipeline-signals" aria-label="Captured Elfa signal examples">
          {signals.slice(0, 3).map((signal, index) => (
            <article key={`${signal.description}-${index}`}>
              <span>Elfa {signal.kind}</span>
              <strong>Market signal {String(index + 1).padStart(2, "0")}</strong>
              <p>{signal.description}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SnapshotClaimFallback({
  receipt,
  stats,
}: {
  receipt: SnapshotReceipt;
  stats: ReturnType<typeof buildSnapshotStats>;
}) {
  const isSettled = receipt.outcome === "right" || receipt.outcome === "wrong";
  const agentRight = receipt.outcome === "right";
  const isWrong = receipt.outcome === "wrong";
  const finalTx = receipt.refundTx ?? receipt.payoutTx ?? receipt.settleTx ?? receipt.commitTx;
  const amount =
    stats.proofRefund?.claimId === receipt.claimId
      ? formatDollar(stats.proofRefund.paidBack + stats.proofRefund.bonus)
      : stats.proofPayout?.claimId === receipt.claimId
        ? formatDollar(stats.proofPayout.amount)
        : receipt.refundTx
          ? "Refunded"
          : receipt.payoutTx
            ? "Agent earned"
            : "Pending";
  const callText = formatCall(receipt.direction, receipt.thresholdPriceUsd);
  const provider = providerLabel(receipt.provider);
  const snapshotRefund = stats.proofRefund?.claimId === receipt.claimId ? stats.proofRefund : undefined;
  const snapshotPayout = stats.proofPayout?.claimId === receipt.claimId ? stats.proofPayout : undefined;
  const replayMoneyLabel = agentRight
    ? snapshotPayout
      ? formatDollarExact(snapshotPayout.amount)
      : amount
    : snapshotRefund
      ? `${formatDollarExact(snapshotRefund.paidBack)} + ${formatDollarExact(snapshotRefund.bonus)} bonus`
      : amount;
  const replayMoneyDetail = agentRight
    ? `${receipt.agent} received ${replayMoneyLabel} from the settled claim path.`
    : snapshotRefund
      ? `Buyer refund: ${formatDollarExact(snapshotRefund.paidBack)} paid back plus ${formatDollarExact(snapshotRefund.bonus)} bonus from the slashed bond.`
      : "The final refund transaction is recorded on Mantle.";
  const replayThreshold = receipt.thresholdPriceUsd
    ? `$${Number(receipt.thresholdPriceUsd).toFixed(4)}${receipt.direction ? ` ${receipt.direction}` : ""}`
    : undefined;

  return (
    <div className="claw-page page-wide">
      <div className="detail-breadcrumb">
        <div>
          <Link href="/feed">Receipts</Link>
          <span>/</span>
          <span>Claim #{receipt.claimId}</span>
        </div>
      </div>

      <div className="receipt-detail-topgrid">
        <section className={`receipt-summary-card ${agentRight ? "receipt-summary-earned" : "receipt-summary-refund"}`}>
          <div className="summary-copy">
            <div className="dot-label">Snapshot proof</div>
            <h1>
              {!isSettled
                ? "Awaiting settlement"
                : agentRight
                  ? "Right → agent earned"
                  : "Wrong → refund cleared"}
            </h1>
            <p>
              Live contract reads are rate-limited, so this page is rendering the pinned proof snapshot.
              The transaction links remain public Mantle receipts.
            </p>
          </div>
          <dl className="summary-metrics">
            <div>
              <dt>Prediction</dt>
              <dd>{callText}</dd>
            </div>
            <div>
              <dt>Actual result</dt>
              <dd>{isSettled ? (agentRight ? "Right" : "Wrong") : "Pending"}</dd>
            </div>
            <div>
              <dt>Paid to</dt>
              <dd>{agentRight ? "Agent" : isWrong ? "Payers" : "Pending"}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{amount}</dd>
            </div>
          </dl>
        </section>
        <ReceiptPricePanel
          threshold={receipt.thresholdPriceUsd}
          agentRight={agentRight}
        />
      </div>

      <ReceiptStepStrip
        commitTx={receipt.commitTx}
        settleTx={receipt.settleTx}
        finalTx={agentRight ? receipt.payoutTx : receipt.refundTx}
        agentRight={agentRight}
      />

      <section className="decision-dossier" aria-label="Snapshot decision dossier">
        <article className="dossier-card dossier-main">
          <div className="detail-kicker">Decision summary</div>
          <h2>{isSettled ? (agentRight ? "The model was right." : "The model was wrong.") : "The model is still on the hook."}</h2>
          <p>
            {isSettled
              ? agentRight
                ? "The agent can claim earned revenue after the market settled in its favor."
                : "The wrong call is accountable: the slashed bond backs the refund path."
              : "The agent has committed capital and will be scored after expiry."}
          </p>
          <ul>
            <li>Prediction: <strong>{callText}</strong></li>
            <li>Outcome: <strong>{isSettled ? (agentRight ? "Right" : "Wrong") : "Pending"}</strong></li>
            <li>Receipt value: <strong>{amount}</strong></li>
          </ul>
        </article>

        <article className="dossier-card">
          <div className="detail-kicker">AI provenance</div>
          <h3>{receipt.agent}</h3>
          <p>{provider}</p>
          {receipt.elfa ? (
            <div className="elfa-proof-pill">
              <span>Elfa captured</span>
              <strong>{receipt.elfa.signalCount} signals</strong>
            </div>
          ) : null}
        </article>

        <article className="dossier-card">
          <div className="detail-kicker">Onchain proof</div>
          <h3>Public tx</h3>
          <p>Open the Mantle transaction to verify the pinned receipt independently.</p>
          {txLink(finalTx, shortHex(finalTx, 6, 4), "Open snapshot proof transaction")}
        </article>
      </section>

      <AiPipeline
        agent={receipt.agent}
        provider={provider}
        prediction={callText}
        receipt={receipt}
      />

      {isSettled ? (
        <SettlementReplay
          claimId={String(receipt.claimId)}
          agentHandle={receipt.agent}
          agentRight={agentRight}
          callText={callText}
          bondLabel={receipt.bondAmount ? formatDollarExact(receipt.bondAmount) : "the recorded bond"}
          unlockLabel={amount}
          thresholdLabel={replayThreshold}
          moneyLabel={replayMoneyLabel}
          moneyDetail={replayMoneyDetail}
          commitTx={receipt.commitTx}
          settleTx={receipt.settleTx}
          finalTx={agentRight ? receipt.payoutTx : receipt.refundTx}
        />
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await loadClaimDetail(BigInt(id));
    if (!detail) return { title: `Claim #${id}` };
    const { agent, accounting } = detail;
    const outcome = accounting.settled ? (accounting.agentRight ? "agent earned" : "refund cleared") : "pending";
    return {
      title: `${agent.handle} · Claim #${id} · ${outcome}`,
      description: `${agent.handle} claim #${id}: ${outcome}. Onchain receipt on Mantle Sepolia.`,
    };
  } catch {
    return { title: `Claim #${id}` };
  }
}

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let claimId: bigint;
  try {
    claimId = BigInt(id);
  } catch {
    notFound();
  }

  const stats = buildSnapshotStats();
  let detail: Awaited<ReturnType<typeof loadClaimDetail>> | null = null;
  try {
    detail = await loadClaimDetail(claimId);
  } catch (err) {
    console.warn(`loadClaimDetail(${claimId.toString()}) failed; using snapshot fallback if available:`, err);
  }
  if (!detail) {
    const snapshot = stats.latestReceipts.find((receipt) => receipt.claimId === Number(claimId));
    if (!snapshot) notFound();
    return <SnapshotClaimFallback receipt={snapshot} stats={stats} />;
  }

  const { claim, agent, accounting } = detail;
  const proofRefund = stats.proofRefund?.claimId === Number(claim.id) ? stats.proofRefund : undefined;
  const proofPayout = stats.proofPayout?.claimId === Number(claim.id) ? stats.proofPayout : undefined;
  const proofReceipt: SnapshotReceipt | undefined = proofRefund
    ? {
        claimId: proofRefund.claimId,
        agent: proofRefund.agent,
        outcome: "wrong",
        commitTx: proofRefund.commitTx ?? proofRefund.tx,
        settleTx: proofRefund.settleTx,
        commitAt: proofRefund.commitAt,
        settleAt: proofRefund.settleAt,
        refundTx: proofRefund.tx,
        provider: proofRefund.provider,
        fellBack: proofRefund.fellBack,
        direction: proofRefund.direction,
        thresholdPriceUsd: proofRefund.thresholdPriceUsd,
        elfa: proofRefund.elfa,
      }
    : proofPayout
      ? {
          claimId: proofPayout.claimId,
          agent: proofPayout.agent,
          outcome: "right",
          commitTx: proofPayout.commitTx ?? proofPayout.tx,
          settleTx: proofPayout.settleTx,
          commitAt: proofPayout.commitAt,
          settleAt: proofPayout.settleAt,
          payoutTx: proofPayout.tx,
          provider: proofPayout.provider,
          fellBack: proofPayout.fellBack,
          direction: proofPayout.direction,
          thresholdPriceUsd: proofPayout.thresholdPriceUsd,
          elfa: proofPayout.elfa,
        }
      : undefined;
  const matchingReceipt =
    stats.latestReceipts.find((receipt) => receipt.claimId === Number(claim.id)) ?? proofReceipt;
  const elfa = proofRefund?.elfa ?? proofPayout?.elfa ?? matchingReceipt?.elfa;
  const prediction = decodePredictionParams(claim.marketId, claim.predictionParams);
  const question = predictionQuestion(prediction, claim.expiry);
  const market = MARKET_LABEL[claim.marketId] ?? `market #${claim.marketId}`;
  const isSettled = claim.state === CLAIM_STATE.SETTLED || accounting.settled;
  const agentRight = accounting.agentRight;
  const outcomeText = !isSettled
    ? "Awaiting settlement"
    : agentRight
      ? "Right → agent earned"
      : "Wrong → refund cleared";
  const paidAmount = agentRight
    ? proofPayout?.amount ?? accounting.totalPaid
    : proofRefund
      ? proofRefund.paidBack + proofRefund.bonus
      : accounting.totalPaid;
  const paidLabel = agentRight ? "Agent earned" : "Payers received";
  const provider = providerLabel(proofRefund?.provider ?? proofPayout?.provider ?? matchingReceipt?.provider);
  const callText = formatCall(
    proofRefund?.direction ?? proofPayout?.direction ?? matchingReceipt?.direction,
    proofRefund?.thresholdPriceUsd ?? proofPayout?.thresholdPriceUsd ?? matchingReceipt?.thresholdPriceUsd,
  );

  let timeline: TimelineEvent[] = [];
  try {
    timeline = await Promise.race([
      loadClaimTimeline(claim.id),
      new Promise<TimelineEvent[]>((resolve) => setTimeout(() => resolve([]), 4_000)),
    ]);
  } catch (err) {
    console.warn(`loadClaimTimeline(${claim.id.toString()}) failed:`, err);
  }

  const shareOutcome = isSettled ? (agentRight ? "right" : "wrong") : "pending";
  const unlockEvents = timeline.filter((event): event is Extract<TimelineEvent, { kind: "unlock" }> => event.kind === "unlock");
  const totalUnlocked = unlockEvents.reduce((sum, event) => sum + event.amount, 0n) || accounting.totalPaid;
  const receiptValue = isSettled ? paidAmount : totalUnlocked;
  const receiptValueLabel = receiptValue > 0n
    ? formatDollar(receiptValue)
    : isSettled
      ? agentRight
        ? "Earned onchain"
        : "Refunded onchain"
      : "No unlock yet";
  const beneficiaryLabel = !isSettled ? (totalUnlocked > 0n ? "Escrowed" : "Pending") : agentRight ? "Agent" : "Payers";
  const valueLabel = !isSettled ? "Unlocks paid" : paidLabel;
  const settlementProof = decodeSettlementProof(accounting.settlementProof);
  const replayCallText = callText === "MNT price call" ? question : callText;
  const replayCommitTx = eventTx(timeline, "commit") ?? receiptTx(matchingReceipt, "commit");
  const replaySettleTx = eventTx(timeline, "settle") ?? receiptTx(matchingReceipt, "settle");
  const replayFinalTx = agentRight
    ? eventTx(timeline, "payout") ?? receiptTx(matchingReceipt, "payout")
    : eventTx(timeline, "refund") ?? receiptTx(matchingReceipt, "refund");
  const refundEvent = timelineRefund(timeline);
  const payoutEvent = timelinePayout(timeline);
  const refundPaidBack = proofRefund?.paidBack ?? refundEvent?.paidBack;
  const refundBonus = proofRefund?.bonus ?? refundEvent?.bonus;
  const payoutAmount = proofPayout?.amount ?? payoutEvent?.amount ?? (agentRight ? paidAmount : undefined);
  const replayMoneyLabel = agentRight
    ? payoutAmount
      ? formatDollarExact(payoutAmount)
      : receiptValueLabel
    : refundPaidBack !== undefined && refundBonus !== undefined
      ? `${formatDollarExact(refundPaidBack)} + ${formatDollarExact(refundBonus)} bonus`
      : receiptValueLabel;
  const replayMoneyDetail = agentRight
    ? `${agent.handle} received ${replayMoneyLabel} after the Pyth result landed on the agent side.`
    : refundPaidBack !== undefined && refundBonus !== undefined
      ? `Buyer refund: ${formatDollarExact(refundPaidBack)} paid back plus ${formatDollarExact(refundBonus)} bonus from the slashed bond.`
      : "The wrong call sent the final refund through the escrow receipt path.";

  return (
    <div className="claw-page page-wide">
      <div className="detail-breadcrumb">
        <div>
          <Link href="/feed">Receipts</Link>
          <span>/</span>
          <span>Claim #{claim.id.toString()}</span>
        </div>
        <ShareClaim
          claimId={claim.id.toString()}
          agentHandle={agent.handle}
          outcome={shareOutcome}
          bondAmountUsdc6={claim.bondAmount.toString()}
          totalPaidUsdc6={accounting.totalPaid.toString()}
        />
      </div>

      <div className="receipt-detail-topgrid">
        <section className={`receipt-summary-card ${agentRight ? "receipt-summary-earned" : "receipt-summary-refund"}`}>
          <div className="summary-copy">
            <div className="dot-label">Outcome</div>
            <h1>{outcomeText}</h1>
            <p>
              {agent.handle} predicted {callText === "MNT price call" ? question : callText}.{" "}
              {isSettled
                ? agentRight
                  ? "The call settled right, so the agent kept the earned payment."
                  : "The call settled wrong, so the slashed bond paid users back."
                : "The call is still live and will settle after expiry."}
            </p>
          </div>
          <dl className="summary-metrics">
            <div>
              <dt>Prediction</dt>
              <dd>{callText}</dd>
            </div>
            <div>
              <dt>Actual result</dt>
              <dd>{isSettled ? (agentRight ? "Right" : "Wrong") : "Pending"}</dd>
            </div>
            <div>
              <dt>Paid to</dt>
              <dd>{beneficiaryLabel}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{receiptValueLabel}</dd>
            </div>
          </dl>
        </section>
        <ReceiptPricePanel
          threshold={
            proofRefund?.thresholdPriceUsd ??
            proofPayout?.thresholdPriceUsd ??
            matchingReceipt?.thresholdPriceUsd
          }
          resultPrice={formatOraclePrice(settlementProof?.mntPrice)}
          agentRight={agentRight}
        />
      </div>

      <ReceiptStepStrip
        commitTx={replayCommitTx}
        settleTx={replaySettleTx}
        finalTx={replayFinalTx}
        agentRight={agentRight}
      />

      <ClaimLiveStatus settled={isSettled} expirySec={Number(claim.expiry)} />

      <section className="decision-dossier" aria-label="Decision dossier">
        <article className="dossier-card dossier-main">
          <div className="detail-kicker">Decision summary</div>
          <h2>
            {isSettled
              ? agentRight
                ? "The model was right."
                : "The model was wrong."
              : "The model is still on the hook."}
          </h2>
          <p>
            {isSettled
              ? agentRight
                ? "Pyth settled the market in the agent's favor, so the agent can claim the earned revenue."
                : "Pyth settled against the prediction, so the agent bond becomes the refund source for buyers."
              : "The agent has committed capital and the outcome will be scored after the expiry window closes."}
          </p>
          <ul>
            <li>Prediction: <strong>{callText === "MNT price call" ? question : callText}</strong></li>
            <li>Outcome: <strong>{isSettled ? (agentRight ? "Right" : "Wrong") : "Pending"}</strong></li>
            <li>{valueLabel}: <strong>{receiptValueLabel}</strong></li>
          </ul>
        </article>

        <article className="dossier-card">
          <div className="detail-kicker">AI provenance</div>
          <h3>{agent.handle}</h3>
          <p>{provider}</p>
          {elfa ? (
            <div className="elfa-proof-pill">
              <span>Elfa captured</span>
              <strong>{elfa.signalCount} signals</strong>
            </div>
          ) : (
            <div className="elfa-proof-pill muted">
              <span>Elfa</span>
              <strong>Not attached</strong>
            </div>
          )}
        </article>

        <article className="dossier-card">
          <div className="detail-kicker">Onchain accountability</div>
          <h3>{formatUsdc(claim.bondAmount)} USDC</h3>
          <p>
            Agent bond locked before settlement. If the call is wrong, the refund path is paid from slashed capital.
          </p>
          {matchingReceipt?.commitTx ? txLink(matchingReceipt.commitTx, "Open commit proof", "Open commit transaction") : null}
        </article>
      </section>

      <AiPipeline
        agent={agent.handle}
        provider={provider}
        prediction={callText === "MNT price call" ? question : callText}
        receipt={matchingReceipt}
        skillsHash={claim.skillsOutputHash}
      />

      {isSettled ? (
        <SettlementReplay
          claimId={claim.id.toString()}
          agentHandle={agent.handle}
          agentRight={agentRight}
          callText={replayCallText}
          bondLabel={formatDollarExact(claim.bondAmount)}
          unlockLabel={totalUnlocked > 0n ? formatDollarExact(totalUnlocked) : `${formatDollarExact(claim.unlockPrice)} per unlock`}
          thresholdLabel={thresholdLabel(prediction)}
          settlementPriceLabel={formatOraclePrice(settlementProof?.mntPrice)}
          publishTimeLabel={settlementProof?.publishTime ? formatTimestamp(settlementProof.publishTime) : undefined}
          moneyLabel={replayMoneyLabel}
          moneyDetail={replayMoneyDetail}
          commitTx={replayCommitTx}
          settleTx={replaySettleTx}
          finalTx={replayFinalTx}
        />
      ) : null}

      <section className="detail-grid">
        <ProofTimeline
          events={timeline}
          receipt={matchingReceipt}
          agentRight={agentRight}
          fallbackUnlockAmount={!isSettled ? totalUnlocked : 0n}
        />
        <section className="detail-card actions-card">
          <div className="detail-kicker">Actions</div>
          <p>
            Wallet-free browsing is enabled. Connect only if you want to unlock a live claim,
            claim a refund, or settle after expiry.
          </p>
          <ClaimActions
            claimId={claim.id}
            agentId={claim.agentId}
            agentOwner={agent.owner}
            unlockPrice={claim.unlockPrice}
            state={claim.state}
            settled={isSettled}
            agentRight={agentRight}
            expirySec={claim.expiry}
          />
        </section>
        <section className={`detail-card payment-card ${agentRight ? "payment-earned" : "payment-refund"}`}>
          <span>{isSettled ? (agentRight ? "Agent earned" : "Refunded") : "Pending"}</span>
          <h2>{receiptValueLabel}</h2>
          <p>{valueLabel}</p>
          <Link href={`/claim/${claim.id.toString()}`}>Claim #{claim.id.toString()}</Link>
        </section>
      </section>

      <section className="detail-card claim-details-card">
        <div className="detail-kicker">Claim details</div>
        <div className="claim-detail-grid">
          <div>
            <span>Agent</span>
            <strong>{agent.handle}</strong>
          </div>
          <div>
            <span>Model route</span>
            <strong>{provider}</strong>
          </div>
          {elfa ? (
            <div>
              <span>Elfa signals</span>
              <strong>{elfa.signalCount} captured</strong>
            </div>
          ) : null}
          <div>
            <span>Market</span>
            <strong>{market}</strong>
          </div>
          <div>
            <span>Bond locked</span>
            <strong>{formatUsdc(claim.bondAmount)} USDC</strong>
          </div>
          <div>
            <span>Unlock price</span>
            <strong>{formatUsdc(claim.unlockPrice)} USDC</strong>
          </div>
          <div>
            <span>Expires</span>
            <strong>{formatTimestamp(claim.expiry)}</strong>
          </div>
        </div>
        <div className="claim-question">
          <span>Call / question</span>
          <p>{claim.revealedClaimText || question}</p>
        </div>
      </section>

      <section className="detail-card technical-card">
        <div className="detail-kicker">Onchain proof</div>
        <dl>
          <div>
            <dt>Claim hash</dt>
            <dd>{claim.claimHash}</dd>
          </div>
          <div>
            <dt>Reasoning / skills hash</dt>
            <dd>{claim.skillsOutputHash}</dd>
          </div>
          <div>
            <dt>ClaimMarket</dt>
            <dd>
              <a href={`${EXPLORER}/address/${ADDRESSES.claimMarket}`} target="_blank" rel="noreferrer">
                {shortHex(ADDRESSES.claimMarket)} ↗
              </a>
            </dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>
              <Link href={`/agent/${claim.agentId.toString()}`}>
                {agent.handle} (id {claim.agentId.toString()})
              </Link>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
