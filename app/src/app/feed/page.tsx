import type { Metadata } from "next";
import Link from "next/link";
import { EXPLORER } from "@/lib/addresses";
import { buildSnapshotStats } from "@/lib/season-stats";
import { formatDollar, shortHex } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Receipts · Clawback",
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

function ReceiptLine({ receipt, stats }: { receipt: Receipt; stats: Stats }) {
  const isRefund = receipt.outcome === "wrong" || Boolean(receipt.refundTx);
  const result = isRefund ? "Refunded" : receipt.outcome === "right" ? "Paid to agent" : "Pending";
  const tx = proofTx(receipt);

  return (
    <tr>
      <td>
        <AgentBadge agent={receipt.agent} />
      </td>
      <td>
        <Link href={`/claim/${receipt.claimId}`} className="font-semibold text-neutral-100 hover:text-white">
          Claim #{receipt.claimId}
        </Link>
        <p>{formatCall(receipt.direction, receipt.thresholdPriceUsd)}</p>
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
      <td className="tabular-nums">{receiptAmount(receipt, stats)}</td>
      <td>
        <a
          href={`${EXPLORER}/tx/${tx}`}
          target="_blank"
          rel="noreferrer"
          className="tx-link"
          aria-label={`Open onchain proof for claim ${receipt.claimId}`}
        >
          {shortHex(tx, 5, 4)}
          <span aria-hidden>↗</span>
        </a>
      </td>
    </tr>
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
    <div className="claw-page page-narrow">
      <section className="page-hero">
        <p>Onchain receipt feed</p>
        <h1>Receipts</h1>
        <span>
          Every AI call, settlement, refund, and payout with the onchain proof one click away.
        </span>
      </section>

      <section className="stat-strip" aria-label="Season stats">
        <div>
          <span>Total calls</span>
          <strong>{stats.totalClaims}</strong>
        </div>
        <div>
          <span>Right calls</span>
          <strong className="text-amber-200">{stats.settledRight}</strong>
        </div>
        <div>
          <span>Wrong calls</span>
          <strong className="text-red-300">{stats.settledWrong}</strong>
        </div>
        <div>
          <span>Paid back to users</span>
          <strong className="text-emerald-200">{formatDollar(stats.totalRefundUsdc)}</strong>
        </div>
      </section>

      <section className="receipts-panel">
        <div className="receipts-toolbar">
          <div>
            <h2>Recent receipts</h2>
            <p>Latest settlements from CatScout, LobsterRogue, and LlmScout.</p>
          </div>
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

        {rows.length === 0 ? (
          <div className="empty-receipts">No receipts for this filter yet.</div>
        ) : (
          <div className="receipt-table-wrap">
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Claim</th>
                  <th>Outcome</th>
                  <th>Result</th>
                  <th>Refund / payout</th>
                  <th>Tx / proof</th>
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
  );
}
