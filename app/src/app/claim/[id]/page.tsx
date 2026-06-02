export const maxDuration = 60;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import ShareClaim from "@/components/ShareClaim";

export const dynamic = "force-dynamic";
export const revalidate = 15;

type SnapshotReceipt = ReturnType<typeof buildSnapshotStats>["latestReceipts"][number];

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

function ProofTimeline({
  events,
  receipt,
  agentRight,
}: {
  events: TimelineEvent[];
  receipt?: SnapshotReceipt;
  agentRight: boolean;
}) {
  const commit = eventTx(events, "commit") ?? receiptTx(receipt, "commit");
  const settle = eventTx(events, "settle") ?? receiptTx(receipt, "settle");
  const payment = agentRight
    ? eventTx(events, "payout") ?? receiptTx(receipt, "payout")
    : eventTx(events, "refund") ?? receiptTx(receipt, "refund");

  const rows = [
    { label: "Committed", body: "The model made this call and locked its bond.", tx: commit },
    { label: "Settled by Pyth", body: "Pyth checked the market after expiry.", tx: settle },
    {
      label: agentRight ? "Agent paid" : "Refund paid",
      body: agentRight ? "The right call let the agent earn." : "The wrong call paid users back onchain.",
      tx: payment,
    },
  ];

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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await loadClaimDetail(BigInt(id));
    if (!detail) return { title: `Claim #${id} · Clawback` };
    const { agent, accounting } = detail;
    const outcome = accounting.settled ? (accounting.agentRight ? "agent earned" : "refund cleared") : "pending";
    return {
      title: `${agent.handle} · Claim #${id} · ${outcome} · Clawback`,
      description: `${agent.handle} claim #${id}: ${outcome}. Onchain receipt on Mantle Sepolia.`,
    };
  } catch {
    return { title: `Claim #${id} · Clawback` };
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

  const detail = await loadClaimDetail(claimId);
  if (!detail) notFound();

  const stats = buildSnapshotStats();
  const { claim, agent, accounting } = detail;
  const matchingReceipt = stats.latestReceipts.find((receipt) => receipt.claimId === Number(claim.id));
  const proofRefund = stats.proofRefund?.claimId === Number(claim.id) ? stats.proofRefund : undefined;
  const proofPayout = stats.proofPayout?.claimId === Number(claim.id) ? stats.proofPayout : undefined;
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
            <dd>{agentRight ? "Agent" : "Payers"}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{paidAmount > 0n ? formatDollar(paidAmount) : "Pending"}</dd>
          </div>
        </dl>
      </section>

      <ClaimLiveStatus settled={isSettled} expirySec={Number(claim.expiry)} />

      <section className="detail-grid">
        <ProofTimeline events={timeline} receipt={matchingReceipt} agentRight={agentRight} />
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
          <h2>{paidAmount > 0n ? formatDollar(paidAmount) : "—"}</h2>
          <p>{paidLabel}</p>
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
