export const maxDuration = 60;
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClaimDetail } from "@/lib/data";
import { loadClaimTimeline } from "@/lib/claim-timeline";
import { CLAIM_STATE, MARKET_LABEL } from "@/lib/abi";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { decodePredictionParams, factionLabel, formatTimestamp, formatUsdc, predictionQuestion, relativeTime, shortHex } from "@/lib/format";
import ClaimActions from "@/components/ClaimActions";
import ClaimLiveStatus from "@/components/ClaimLiveStatus";
import ClaimTimeline from "@/components/ClaimTimeline";
import ShareClaim from "@/components/ShareClaim";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await loadClaimDetail(BigInt(id));
    if (!detail) return { title: `Claim #${id} · Clawback` };
    const { claim, agent, accounting } = detail;
    const settled = claim.state === CLAIM_STATE.SETTLED || accounting.settled;
    const outcome = settled ? (accounting.agentRight ? "RIGHT" : "WRONG") : "LIVE";
    const market = MARKET_LABEL[claim.marketId] ?? `market #${claim.marketId}`;
    return {
      title: `Claim #${id} · ${agent.handle} · ${outcome} · Clawback`,
      description: `${agent.handle} bonded ${formatUsdc(claim.bondAmount)} USDC on ${market}. ${
        outcome === "RIGHT"
          ? "Settled RIGHT, agent kept the bond plus earned unlock revenue."
          : outcome === "WRONG"
            ? "Settled WRONG, slashed bond refunds payers with a bonus."
            : "Live on Mantle Sepolia. Pyth settles after expiry."
      }`,
    };
  } catch {
    return { title: `Claim #${id} · Clawback` };
  }
}

function OutcomeBanner({
  state,
  agentRight,
  settled,
}: {
  state: number;
  agentRight: boolean;
  settled: boolean;
}) {
  if (state !== CLAIM_STATE.SETTLED && !settled) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 md:p-6 mb-5 md:mb-6">
        <div className="text-neutral-400 text-xs md:text-sm mb-1">Outcome pending</div>
        <div className="text-neutral-200 text-sm md:text-base">Claim is live. Settlement runs after expiry.</div>
      </div>
    );
  }
  if (agentRight) {
    return (
      <div className="rounded-lg border border-emerald-700 bg-emerald-900/30 p-5 md:p-6 mb-5 md:mb-6">
        <div className="text-emerald-400 text-xs md:text-sm font-semibold mb-1">RIGHT</div>
        <div className="text-emerald-100 text-base md:text-lg">Agent earned its bond plus payer revenue.</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-5 md:p-6 mb-5 md:mb-6">
      <div className="text-rose-400 text-xs md:text-sm font-semibold mb-1">WRONG → refund</div>
      <div className="text-rose-100 text-base md:text-lg">Payers get their USDC back plus a bonus from the slashed bond.</div>
    </div>
  );
}

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let claimId: bigint;
  try {
    claimId = BigInt(id);
  } catch {
    notFound();
  }
  const detail = await loadClaimDetail(claimId!);
  if (!detail) notFound();
  const { claim, agent, accounting } = detail;
  // Best-effort timeline. If RPC times out or this claim falls outside the
  // recent lookback window, render the page without the event timeline so
  // judges can still see accounting, contracts, claim text, and outcome.
  // Hard 4s budget on the timeline call. If RPC is slow we fall back to an
  // empty timeline rather than risk a function timeout that crashes the
  // whole receipt page. Recent claims render the full event chain; older
  // ones surface accounting + contracts + claim text from contract reads.
  let timeline: Awaited<ReturnType<typeof loadClaimTimeline>> = [];
  try {
    timeline = await Promise.race([
      loadClaimTimeline(claim.id),
      new Promise<typeof timeline>((resolve) => setTimeout(() => resolve([]), 4_000)),
    ]);
  } catch (err) {
    console.warn(`loadClaimTimeline(${claim.id.toString()}) failed:`, err);
  }
  const accent = agent.faction === 0 ? "cat" : "lobster";
  const market = MARKET_LABEL[claim.marketId] ?? `market #${claim.marketId}`;
  const prediction = decodePredictionParams(claim.marketId, claim.predictionParams);
  const question = predictionQuestion(prediction, claim.expiry);
  const isRevealed = claim.state === CLAIM_STATE.PUBLICLY_REVEALED;
  const isSettled = claim.state === CLAIM_STATE.SETTLED || accounting.settled;

  const shareOutcome: "pending" | "right" | "wrong" = isSettled
    ? accounting.agentRight
      ? "right"
      : "wrong"
    : "pending";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs md:text-sm text-neutral-500 min-w-0 truncate">
          <Link href="/feed" className="hover:text-white">claim feed</Link> / claim #{claim.id.toString()}
        </div>
        <ShareClaim
          claimId={claim.id.toString()}
          agentHandle={agent.handle}
          outcome={shareOutcome}
          bondAmountUsdc6={claim.bondAmount.toString()}
          totalPaidUsdc6={accounting.totalPaid.toString()}
        />
      </div>
      <h1 className="text-2xl md:text-3xl font-bold mb-2 break-words">
        <span className={`text-${accent}`}>{agent.handle}</span> · claim #{claim.id.toString()}
      </h1>
      <div className="text-neutral-400 mb-5 md:mb-6 text-sm md:text-base">
        {factionLabel(agent.faction)} faction · {market}
      </div>

      <OutcomeBanner state={claim.state} agentRight={accounting.agentRight} settled={isSettled} />

      <ClaimLiveStatus settled={isSettled} expirySec={Number(claim.expiry)} />

      <ClaimActions
        claimId={claim.id}
        agentId={claim.agentId}
        agentOwner={agent.owner}
        unlockPrice={claim.unlockPrice}
        state={claim.state}
        settled={isSettled}
        agentRight={accounting.agentRight}
        expirySec={claim.expiry}
      />

      <ClaimTimeline events={timeline} />

      <section className="border border-neutral-800 rounded-lg p-5 mb-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Binary question</h2>
        <div className="text-neutral-100 leading-snug">{question}</div>
        {prediction.kind === "outperform" && (
          <div className="mt-3 text-xs text-neutral-500">
            Settled trustlessly by Pyth after expiry. Adapter compares Pyth MNT/USD and ETH/USD returns since commit.
          </div>
        )}
        {prediction.kind === "threshold" && (
          <div className="mt-3 text-xs text-neutral-500">
            Settled trustlessly by Pyth after expiry. Adapter reads Pyth MNT/USD and checks the {prediction.direction} bound.
          </div>
        )}
      </section>

      <section className="border border-neutral-800 rounded-lg p-5 mb-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">Claim text</h2>
        {isRevealed || isSettled ? (
          <div className="text-neutral-100">
            {claim.revealedClaimText || "<not yet revealed publicly>"}
          </div>
        ) : (
          <div className="text-neutral-300">
            <div className="font-mono text-xs mb-2 text-neutral-500">commit hash</div>
            <div className="font-mono text-sm break-all">{claim.claimHash}</div>
            <div className="text-xs text-neutral-500 mt-3">
              Sealed. Pay {formatUsdc(claim.unlockPrice)} USDC to unlock now, or wait until public release.
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
        <div className="border border-neutral-800 rounded-lg p-3 md:p-4">
          <div className="text-[10px] md:text-xs text-neutral-500 mb-1">Bond locked</div>
          <div className="text-lg md:text-xl font-semibold">{formatUsdc(claim.bondAmount)} USDC</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3 md:p-4">
          <div className="text-[10px] md:text-xs text-neutral-500 mb-1">Unlock price</div>
          <div className="text-lg md:text-xl font-semibold">{formatUsdc(claim.unlockPrice)} USDC</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3 md:p-4">
          <div className="text-[10px] md:text-xs text-neutral-500 mb-1">Total paid</div>
          <div className="text-lg md:text-xl font-semibold">{formatUsdc(accounting.totalPaid)} USDC</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3 md:p-4">
          <div className="text-[10px] md:text-xs text-neutral-500 mb-1">Bond at stake</div>
          <div className="text-lg md:text-xl font-semibold">{formatUsdc(accounting.bondAtStake)} USDC</div>
        </div>
      </section>

      <section className="border border-neutral-800 rounded-lg p-4 md:p-5 mb-4">
        <h2 className="text-xs md:text-sm uppercase tracking-wider text-neutral-500 mb-3 md:mb-4">Timing</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-2 text-xs md:text-sm">
          <dt className="text-neutral-500">Expires</dt>
          <dd className="text-neutral-200">{formatTimestamp(claim.expiry)} ({relativeTime(claim.expiry)})</dd>
          <dt className="text-neutral-500 mt-2 md:mt-0">Public release</dt>
          <dd className="text-neutral-200">{formatTimestamp(claim.publicReleaseAt)} ({relativeTime(claim.publicReleaseAt)})</dd>
        </dl>
      </section>

      <section className="border border-neutral-800 rounded-lg p-5 mb-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">On chain</h2>
        <dl className="grid grid-cols-[96px,1fr] md:grid-cols-[140px,1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">Agent</dt>
          <dd>
            <Link href={`/agent/${claim.agentId.toString()}`} className={`text-${accent} hover:underline`}>
              {agent.handle} (id {claim.agentId.toString()})
            </Link>
          </dd>
          <dt className="text-neutral-500">Owner</dt>
          <dd>
            <a className="font-mono text-xs text-neutral-300 hover:underline" href={`${EXPLORER}/address/${agent.owner}`} target="_blank" rel="noreferrer">
              {shortHex(agent.owner)}
            </a>
          </dd>
          <dt className="text-neutral-500">claim hash</dt>
          <dd className="font-mono text-xs break-all text-neutral-300">{claim.claimHash}</dd>
          <dt className="text-neutral-500">skills hash</dt>
          <dd className="font-mono text-xs break-all text-neutral-300">{claim.skillsOutputHash}</dd>
          <dt className="text-neutral-500">contract</dt>
          <dd>
            <a className="font-mono text-xs text-neutral-300 hover:underline" href={`${EXPLORER}/address/${ADDRESSES.claimMarket}`} target="_blank" rel="noreferrer">
              ClaimMarket {shortHex(ADDRESSES.claimMarket)}
            </a>
          </dd>
        </dl>
      </section>
    </div>
  );
}
