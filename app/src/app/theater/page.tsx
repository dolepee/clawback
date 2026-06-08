import type { Metadata } from "next";
import Link from "next/link";
import { EXPLORER } from "@/lib/addresses";
import { buildSnapshotStats } from "@/lib/season-stats";
import { formatDollar, shortHex } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "AI Accountability Theater · Clawback",
  description: "Watch the full Clawback loop: signals, model call, bonded commit, Pyth settlement, and refund or payout.",
};

type Stats = ReturnType<typeof buildSnapshotStats>;
type Receipt = Stats["latestReceipts"][number];

function providerLabel(provider?: string): string {
  return provider?.replace(/^bankr:/, "Bankr ") ?? "Recorded onchain";
}

function callLabel(receipt?: Receipt): string {
  if (!receipt?.direction || !receipt.thresholdPriceUsd) return "MNT threshold call";
  return `MNT ${receipt.direction} $${Number(receipt.thresholdPriceUsd).toFixed(4)}`;
}

function proofTx(receipt?: Receipt): `0x${string}` | undefined {
  return receipt?.refundTx ?? receipt?.payoutTx ?? receipt?.settleTx ?? receipt?.commitTx;
}

function outcomeLabel(receipt?: Receipt): string {
  if (!receipt) return "Pending";
  if (receipt.outcome === "wrong") return "Wrong -> refunded";
  if (receipt.outcome === "right") return "Right -> agent earned";
  return "Pending -> on the hook";
}

function amountLabel(receipt: Receipt | undefined, stats: Stats): string {
  if (!receipt) return "Pending";
  if (stats.proofRefund?.claimId === receipt.claimId) return formatDollar(stats.proofRefund.paidBack + stats.proofRefund.bonus);
  if (stats.proofPayout?.claimId === receipt.claimId) return formatDollar(stats.proofPayout.amount);
  if (stats.latestRefund?.claimId === receipt.claimId) return formatDollar(stats.latestRefund.paidBack + stats.latestRefund.bonus);
  if (stats.latestPayout?.claimId === receipt.claimId) return formatDollar(stats.latestPayout.amount);
  if (receipt.refundTx) return "Refunded";
  if (receipt.payoutTx) return "Agent earned";
  return "Pending";
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

function TheaterStep({
  index,
  title,
  body,
  value,
}: {
  index: string;
  title: string;
  body: string;
  value?: string;
}) {
  return (
    <article className="theater-step">
      <span>{index}</span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
        {value ? <strong>{value}</strong> : null}
      </div>
    </article>
  );
}

function SignalStack({ receipt }: { receipt?: Receipt }) {
  const signals = receipt?.elfa?.signals ?? [];
  return (
    <div className="signal-stack">
      <div className="detail-kicker">AI input stack</div>
      <h2>{receipt?.elfa ? `${receipt.elfa.signalCount} Elfa signals captured` : "Signals pending"}</h2>
      <p>
        Clawback shows the data source behind the model call before the agent locks capital.
        Judges do not need to trust a black-box screenshot.
      </p>
      <div className="signal-list">
        {signals.slice(0, 4).map((signal, index) => (
          <div key={`${signal.label}-${index}`}>
            <span>Elfa {signal.kind}</span>
            <strong>Market signal {String(index + 1).padStart(2, "0")}</strong>
            <p>{signal.description}</p>
          </div>
        ))}
        {signals.length === 0 ? (
          <div>
            <span>provenance</span>
            <strong>Awaiting signal receipt</strong>
            <p>The next LlmScout claim with Elfa provenance will populate this lane.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReceiptOutcomeCard({
  title,
  receipt,
  stats,
}: {
  title: string;
  receipt?: Receipt;
  stats: Stats;
}) {
  const tx = proofTx(receipt);
  return (
    <article className={`theater-outcome-card outcome-${receipt?.outcome ?? "pending"}`}>
      <div className="detail-kicker">{title}</div>
      <h3>{outcomeLabel(receipt)}</h3>
      <p>{receipt ? `${receipt.agent} · ${callLabel(receipt)}` : "No receipt available yet."}</p>
      <dl>
        <div>
          <dt>Receipt</dt>
          <dd>{receipt ? `#${receipt.claimId}` : "-"}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{amountLabel(receipt, stats)}</dd>
        </div>
      </dl>
      {tx ? (
        <a href={`${EXPLORER}/tx/${tx}`} target="_blank" rel="noreferrer">
          Open proof {shortHex(tx, 5, 4)} <span aria-hidden>↗</span>
        </a>
      ) : null}
    </article>
  );
}

export default function TheaterPage() {
  const stats = buildSnapshotStats();
  const elfaReceipt = stats.latestReceipts.find((receipt) => receipt.elfa);
  const refundReceipt =
    proofRefundReceipt(stats) ??
    stats.latestReceipts.find((receipt) => receipt.outcome === "wrong");
  const payoutReceipt =
    proofPayoutReceipt(stats) ??
    stats.latestReceipts.find((receipt) => receipt.outcome === "right");

  return (
    <div className="claw-page page-wide">
      <section className="theater-hero">
        <div>
          <p>Guided demo path</p>
          <h1>Watch an AI call get judged.</h1>
          <span>
            A single visual path for non-technical judges: Elfa signals feed the model,
            the agent bonds the call, Pyth settles the truth, and Clawback pays the right side.
          </span>
        </div>
        <Link href={elfaReceipt ? `/claim/${elfaReceipt.claimId}` : "/feed"}>Open live Elfa receipt</Link>
      </section>

      <section className="theater-stage" aria-label="AI accountability flow">
        <SignalStack receipt={elfaReceipt} />
        <div className="theater-flow">
          <TheaterStep
            index="01"
            title="Signals captured"
            body="Elfa market context is attached to the LlmScout provenance packet."
            value={elfaReceipt?.elfa ? `${elfaReceipt.elfa.signalCount} signals` : "pending"}
          />
          <TheaterStep
            index="02"
            title="Model makes a call"
            body="The model route and threshold decision are displayed before settlement."
            value={providerLabel(elfaReceipt?.provider)}
          />
          <TheaterStep
            index="03"
            title="Bond locked on Mantle"
            body="The agent posts its own capital before the claim enters the public board."
            value={elfaReceipt?.bondAmount ? formatDollar(elfaReceipt.bondAmount) : "bonded"}
          />
          <TheaterStep
            index="04"
            title="Pyth settles the truth"
            body="The outcome is scored onchain after expiry, not manually decided by the app."
            value={elfaReceipt?.outcome === "pending" ? "awaiting expiry" : outcomeLabel(elfaReceipt)}
          />
        </div>
      </section>

      <section className="outcome-showcase" aria-label="Completed receipt examples">
        <ReceiptOutcomeCard title="If the AI is wrong" receipt={refundReceipt} stats={stats} />
        <ReceiptOutcomeCard title="If the AI is right" receipt={payoutReceipt} stats={stats} />
        <ReceiptOutcomeCard title="Current Elfa-backed call" receipt={elfaReceipt} stats={stats} />
      </section>
    </div>
  );
}
