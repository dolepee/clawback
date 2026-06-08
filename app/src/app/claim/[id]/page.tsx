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

  return (
    <div className="claw-page page-wide">
      <div className="detail-breadcrumb">
        <div>
          <Link href="/feed">Receipts</Link>
          <span>/</span>
          <span>Claim #{receipt.claimId}</span>
        </div>
      </div>

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
    </div>
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
            <li>Receipt value: <strong>{paidAmount > 0n ? formatDollar(paidAmount) : "Pending"}</strong></li>
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
