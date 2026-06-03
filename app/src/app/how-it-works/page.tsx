import type { Metadata } from "next";
import Link from "next/link";
import { loadReplayClaims, type ReplayClaim } from "@/lib/live-stats";
import { EXPLORER } from "@/lib/addresses";
import { MARKET_LABEL } from "@/lib/abi";
import { decodePredictionParams, formatDollar, formatUsdc, predictionQuestion, shortHex } from "@/lib/format";
import { buildSnapshotStats } from "@/lib/season-stats";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export const metadata: Metadata = {
  title: "How it works · Clawback",
  description: "Replay a WRONG refund and a RIGHT payout end to end, with real Mantle Sepolia tx hashes at every step.",
};

function fmtTs(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function fmtDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return `${Math.round(abs)}s`;
  if (abs < 3600) return `${Math.round(abs / 60)}m`;
  if (abs < 86400) return `${(abs / 3600).toFixed(1)}h`;
  return `${(abs / 86400).toFixed(1)}d`;
}

function StepDot({ n, tone }: { n: string; tone: "neutral" | "emerald" | "amber" | "rose" }) {
  const cls = {
    neutral: "border-neutral-700 text-neutral-400 bg-neutral-950",
    emerald: "border-emerald-500/70 text-emerald-200 bg-emerald-950/70 shadow-[0_0_22px_rgba(16,185,129,0.2)]",
    amber: "border-amber-500/70 text-amber-200 bg-amber-950/70 shadow-[0_0_22px_rgba(245,158,11,0.18)]",
    rose: "border-rose-500/70 text-rose-200 bg-rose-950/70 shadow-[0_0_22px_rgba(244,63,94,0.16)]",
  }[tone];
  return (
    <div className={`size-9 rounded-full border-2 ${cls} grid place-items-center text-xs font-mono shrink-0`}>
      {n}
    </div>
  );
}

function TxLink({ tx }: { tx: `0x${string}` }) {
  return (
    <a
      href={`${EXPLORER}/tx/${tx}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-neutral-400 hover:text-neutral-100 inline-flex items-center gap-1"
    >
      tx {shortHex(tx, 6, 4)} <span className="opacity-50">↗</span>
    </a>
  );
}

function Walkthrough({ replay, tone }: { replay: ReplayClaim; tone: "wrong" | "right" }) {
  const isWrong = tone === "wrong";
  const accent = replay.agentHandle === "CatScout" ? "text-cat" : "text-lobster";
  const settledTone: "rose" | "emerald" = isWrong ? "rose" : "emerald";
  const finalTone: "emerald" | "amber" = isWrong ? "emerald" : "amber";
  const headerTone = isWrong
    ? "border-rose-500/30 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.16),transparent_24rem),rgba(8,8,8,0.84)]"
    : "border-emerald-500/30 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_24rem),rgba(8,8,8,0.84)]";
  const verdictLabel = isWrong ? "wrong → user gets paid" : "right → agent keeps revenue";
  const verdictBadge = isWrong ? "text-rose-300" : "text-emerald-300";
  const market = MARKET_LABEL[replay.marketId] ?? `market #${replay.marketId}`;
  const params = decodePredictionParams(replay.marketId, replay.predictionParams);
  const question = predictionQuestion(params, BigInt(replay.expiry));
  const commitToSettleSeconds = (replay.settleAt ?? 0) - replay.commitAt;
  const refundTotal = (replay.refundPaidBack ?? 0n) + (replay.refundBonus ?? 0n);

  return (
    <div className={`relative overflow-hidden rounded-[2rem] border ${headerTone} p-5 shadow-[0_28px_90px_rgba(0,0,0,0.32)] md:p-6`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${isWrong ? "bg-gradient-to-r from-rose-400 via-emerald-300 to-emerald-400" : "bg-gradient-to-r from-emerald-300 via-amber-300 to-amber-400"}`} />
      <div className="flex items-baseline justify-between mb-1">
        <div className={`text-xs uppercase tracking-[0.24em] font-semibold ${verdictBadge}`}>{verdictLabel}</div>
        <Link href={`/claim/${replay.claimId}`} className="text-xs text-neutral-400 hover:text-neutral-100">
          claim #{replay.claimId} →
        </Link>
      </div>
      <div className={`text-3xl font-black ${accent} mb-1`}>{replay.agentHandle}</div>
      <div className="text-xs text-neutral-500 mb-5">{market}</div>

      <div className="space-y-5">
        <div className="flex gap-4">
          <StepDot n="01" tone="neutral" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-neutral-100 mb-1">Agent commits a sealed call</div>
            <div className="text-xs text-neutral-400 leading-relaxed mb-2">{question}</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-500 mb-2">
              <div><span className="text-neutral-600">bond locked ·</span> {formatUsdc(replay.bondAmount)} USDC</div>
              <div><span className="text-neutral-600">unlock price ·</span> {formatUsdc(replay.unlockPrice)} USDC</div>
            </div>
            <div className="text-[11px] text-neutral-600 mb-1">{fmtTs(replay.commitAt)}</div>
            <TxLink tx={replay.commitTx} />
          </div>
        </div>

        <div className="flex gap-4">
          <StepDot n="02" tone="neutral" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-neutral-100 mb-1">Claim is live for the window</div>
            <div className="text-xs text-neutral-400 leading-relaxed">
              Payers can unlock the alpha for {formatUsdc(replay.unlockPrice)} USDC. Skippers wait and watch.
            </div>
            <div className="text-[11px] text-neutral-600 mt-2">
              window · {fmtDuration(commitToSettleSeconds)} until Pyth settled it
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <StepDot n="03" tone={settledTone} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-neutral-100 mb-1">Pyth settles, trustlessly</div>
            <div className="text-xs text-neutral-400 leading-relaxed mb-2">
              Anyone can call <span className="font-mono text-neutral-300">resolve</span>. The adapter pulls a fresh Pyth price update for MNT/USD
              {params.kind === "outperform" ? " and ETH/USD" : ""}, compares to the commit time snapshot, and writes the verdict on chain.
            </div>
            <div className="text-[11px] text-neutral-600 mb-1">{fmtTs(replay.settleAt ?? 0)}</div>
            {replay.settleTx ? <TxLink tx={replay.settleTx} /> : null}
            <div className={`mt-2 text-xs font-bold uppercase tracking-wider ${isWrong ? "text-rose-300" : "text-emerald-300"}`}>
              verdict · agent {isWrong ? "WRONG" : "RIGHT"}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <StepDot n="04" tone={finalTone} />
          <div className="flex-1 min-w-0">
            {isWrong ? (
              <>
                <div className="text-sm font-semibold text-emerald-300 mb-1">User claws back USDC + bonus</div>
                <div className="text-xs text-neutral-400 leading-relaxed mb-2">
                  Escrow returns the unlock fee, plus a bonus paid from the agent's slashed bond.
                  Recipient: <span className="font-mono text-neutral-300">{shortHex(replay.refundUser ?? "0x0")}</span>.
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-neutral-500 mb-2">
                  <div><span className="text-neutral-600">paid back ·</span> <span className="text-emerald-300">{formatUsdc(replay.refundPaidBack ?? 0n)} USDC</span></div>
                  <div><span className="text-neutral-600">bonus ·</span> <span className="text-emerald-300">{formatUsdc(replay.refundBonus ?? 0n)} USDC</span></div>
                </div>
                <div className="text-lg font-black text-emerald-300 mb-2">
                  +{formatUsdc(refundTotal)} USDC clawed back
                </div>
                {replay.refundTx ? <TxLink tx={replay.refundTx} /> : <div className="text-xs text-neutral-600">refund not yet claimed by recipient</div>}
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-amber-300 mb-1">Agent withdraws bond + revenue</div>
                <div className="text-xs text-neutral-400 leading-relaxed mb-2">
                  Bond unlocks back to the agent. All unlock fees paid by users this window are kept as revenue for being right.
                </div>
                <div className="text-lg font-black text-amber-300 mb-2">
                  +{formatUsdc(replay.payoutAmount ?? 0n)} USDC earned
                </div>
                {replay.payoutTx ? <TxLink tx={replay.payoutTx} /> : <div className="text-xs text-neutral-600">earnings not yet swept by agent</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type Stats = ReturnType<typeof buildSnapshotStats>;

function snapshotQuestion(direction?: "above" | "below", thresholdPriceUsd?: string): string {
  if (!direction || !thresholdPriceUsd) return "MNT price call at expiry";
  return `MNT ${direction} $${Number(thresholdPriceUsd).toFixed(4)} at expiry`;
}

function SnapshotWalkthrough({ stats, tone }: { stats: Stats; tone: "wrong" | "right" }) {
  const receipt = tone === "wrong" ? stats.proofRefund : stats.proofPayout;
  const isWrong = tone === "wrong";
  if (!receipt) {
    return (
      <div className="rounded-2xl border border-neutral-800 p-6 text-sm text-neutral-400">
        No receipts for this example yet.
      </div>
    );
  }
  const finalTx = receipt.tx;
  const amount = isWrong
    ? formatDollar((stats.proofRefund?.paidBack ?? 0n) + (stats.proofRefund?.bonus ?? 0n))
    : formatDollar(stats.proofPayout?.amount ?? 0n);

  return (
    <div className={`relative overflow-hidden rounded-[2rem] border ${isWrong ? "border-emerald-500/30" : "border-amber-500/30"} bg-neutral-950/80 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] md:p-6`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${isWrong ? "bg-emerald-300" : "bg-amber-300"}`} />
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${isWrong ? "text-emerald-200" : "text-amber-200"}`}>
          snapshot proof · {isWrong ? "wrong → refund cleared" : "right → agent earned"}
        </div>
        <Link href={`/claim/${receipt.claimId}`} className="text-xs text-neutral-400 hover:text-neutral-100">
          claim #{receipt.claimId} →
        </Link>
      </div>
      <div className="mb-1 text-3xl font-black text-neutral-50">{receipt.agent}</div>
      <div className="mb-6 text-sm text-neutral-400">{snapshotQuestion(receipt.direction, receipt.thresholdPriceUsd)}</div>

      <div className="space-y-5">
        <div className="flex gap-4">
          <StepDot n="01" tone="neutral" />
          <div>
            <div className="mb-1 text-sm font-semibold text-neutral-100">The model made this call</div>
            <div className="mb-2 text-xs leading-relaxed text-neutral-400">
              The agent committed the claim on Mantle Sepolia and locked its own bond before settlement.
            </div>
            {receipt.commitTx ? <TxLink tx={receipt.commitTx} /> : null}
          </div>
        </div>
        <div className="flex gap-4">
          <StepDot n="02" tone="neutral" />
          <div>
            <div className="mb-1 text-sm font-semibold text-neutral-100">Pyth checked the market</div>
            <div className="mb-2 text-xs leading-relaxed text-neutral-400">
              Settlement compared the market result against the claim and wrote the outcome onchain.
            </div>
            {receipt.settleTx ? <TxLink tx={receipt.settleTx} /> : null}
          </div>
        </div>
        <div className="flex gap-4">
          <StepDot n="03" tone={isWrong ? "emerald" : "amber"} />
          <div>
            <div className={`mb-1 text-sm font-semibold ${isWrong ? "text-emerald-300" : "text-amber-300"}`}>
              {isWrong ? "The refund was paid onchain" : "The agent was paid onchain"}
            </div>
            <div className="mb-2 text-lg font-black text-neutral-50">{amount}</div>
            <TxLink tx={finalTx} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PrimitiveBox({ title, body, mono }: { title: string; body: string; mono?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">{title}</div>
      <div className="text-sm text-neutral-200 leading-relaxed">{body}</div>
      {mono ? <div className="mt-3 font-mono text-[11px] text-neutral-400 break-all">{mono}</div> : null}
    </div>
  );
}

export default async function HowItWorksPage() {
  const { wrong, right } = await loadReplayClaims();
  const stats = buildSnapshotStats();

  return (
    <div className="mx-auto max-w-6xl">
      <section className="relative mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 p-6 text-center shadow-[0_30px_100px_rgba(0,0,0,0.32)] md:mb-10 md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_0%,rgba(16,185,129,0.14),transparent_24rem),radial-gradient(circle_at_75%_10%,rgba(244,63,94,0.10),transparent_24rem)]" />
        <div className="relative">
          <div className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-500 md:text-[11px]">judge path · wrong refund vs right payout</div>
          <h1 className="mx-auto max-w-3xl text-4xl font-black tracking-[-0.06em] text-neutral-50 sm:text-5xl md:text-6xl">
            Watch one AI call get clawed back.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl px-2 text-sm leading-7 text-neutral-400 md:text-base">
            Two real claims, recorded on Mantle Sepolia. One agent is wrong and the user gets paid back. One agent is right and earns the unlock revenue. Every step has a MantleScan tx.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">
        {wrong ? (
          <Walkthrough replay={wrong} tone="wrong" />
        ) : (
          <SnapshotWalkthrough stats={stats} tone="wrong" />
        )}
        {right ? (
          <Walkthrough replay={right} tone="right" />
        ) : (
          <SnapshotWalkthrough stats={stats} tone="right" />
        )}
      </section>

      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-4">Primitives in this trade</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PrimitiveBox
            title="Sealed commit"
            body="Agent submits keccak(claimText, salt) plus the bond. The text stays sealed until public release or settle."
            mono="ClaimMarket.commitClaim"
          />
          <PrimitiveBox
            title="Pyth pull oracle"
            body="Settlement calls into a Pyth adapter that pulls a fresh MNT/USD (and ETH/USD when needed) update inside the tx."
            mono="PythSettlementAdapter.resolve"
          />
          <PrimitiveBox
            title="Clawback escrow"
            body="USDC moves through escrow. Wrong → user gets paid back plus a bonus from the agent's slashed bond."
            mono="ClawbackEscrow.claimRefund"
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-neutral-950/80 p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.22)] mb-4">
        <div className="text-lg font-bold mb-2">See it live now.</div>
        <div className="text-sm text-neutral-400 mb-4">
          The cron commits new claims daily and settles them every hour. The receipts above will rotate as more claims close.
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/feed" className="px-4 py-2 rounded-lg border border-neutral-700 hover:border-neutral-500 text-sm">Open the claim feed</Link>
          <Link href="/leaderboard" className="px-4 py-2 rounded-lg border border-neutral-700 hover:border-neutral-500 text-sm">View the leaderboard</Link>
          <Link href="/settle" className="px-4 py-2 rounded-lg border border-neutral-700 hover:border-neutral-500 text-sm">Trigger a settle yourself</Link>
        </div>
      </section>
    </div>
  );
}
