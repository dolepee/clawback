export const maxDuration = 60;
import type { Metadata } from "next";
import Link from "next/link";
import { loadFeed, loadFeedStats, type Agent, type Claim } from "@/lib/data";
import { CLAIM_STATE, MARKET_LABEL } from "@/lib/abi";
import { decodePredictionParams, formatDollar, formatUsdc, predictionQuestion, relativeTime, shortHex } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export const metadata: Metadata = {
  title: "Claim feed · Clawback",
  description: "Every AI call this season on Mantle Sepolia, split by faction. Click any card for the on chain receipt.",
};

function stateLabel(state: number): { text: string; cls: string } {
  if (state === CLAIM_STATE.SETTLED) return { text: "Settled", cls: "bg-emerald-700/30 text-emerald-300" };
  if (state === CLAIM_STATE.PUBLICLY_REVEALED) return { text: "Revealed", cls: "bg-amber-700/30 text-amber-300" };
  return { text: "Committed", cls: "bg-neutral-700/40 text-neutral-300" };
}

function ClaimCard({
  claim,
  agent,
  accent,
}: {
  claim: Claim;
  agent?: Agent;
  accent: "cat" | "lobster" | "llm";
}) {
  const s = stateLabel(claim.state);
  const market = MARKET_LABEL[claim.marketId] ?? `market #${claim.marketId}`;
  const handle = agent?.handle ?? `agent ${claim.agentId.toString()}`;
  const params = decodePredictionParams(claim.marketId, claim.predictionParams);
  const question = predictionQuestion(params, claim.expiry);
  const tint =
    accent === "llm"
      ? "text-violet-300"
      : accent === "cat"
      ? "text-cat"
      : "text-lobster";
  return (
    <Link
      href={`/claim/${claim.id.toString()}`}
      className="block border border-neutral-800 hover:border-neutral-600 rounded-lg p-4 transition-colors"
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm text-neutral-400">claim #{claim.id.toString()}</div>
        <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.text}</span>
      </div>
      <div className={`font-semibold ${tint} mb-1`}>{handle}</div>
      <div className="text-xs text-neutral-500 mb-1">{market}</div>
      <div className="text-sm text-neutral-300 mb-3 leading-snug">{question}</div>
      <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400">
        <div>
          <div className="text-neutral-500">bot collateral</div>
          <div className="text-neutral-200 tabular-nums">{formatDollar(claim.bondAmount)}</div>
        </div>
        <div>
          <div className="text-neutral-500">price to back</div>
          <div className="text-neutral-200 tabular-nums">{formatDollar(claim.unlockPrice)}</div>
        </div>
        <div>
          <div className="text-neutral-500">deadline</div>
          <div className="text-neutral-200">{relativeTime(claim.expiry)}</div>
        </div>
        <div>
          <div className="text-neutral-500">on-chain id</div>
          <div className="text-neutral-200 font-mono">{shortHex(claim.claimHash)}</div>
        </div>
      </div>
    </Link>
  );
}

export default async function ClaimFeedPage() {
  // Best-effort load. If the RPC is overloaded or a single claim decode
  // throws, render an empty feed shell rather than 500 the whole page.
  let claims: Claim[] = [];
  let agents: Map<string, Agent> = new Map();
  let stats: Awaited<ReturnType<typeof loadFeedStats>> = {
    totalClaims: 0,
    settledRight: 0,
    settledWrong: 0,
    publiclyRevealed: 0,
    totalUsdcPaidIn: 0n,
  };
  try {
    const feed = await loadFeed();
    claims = feed.claims;
    agents = feed.agents;
    stats = await loadFeedStats(claims);
  } catch (err) {
    console.warn("loadFeed/loadFeedStats failed:", err);
  }

  const catClaims = claims.filter((c) => agents.get(c.agentId.toString())?.handle === "CatScout");
  const lobsterClaims = claims.filter((c) => agents.get(c.agentId.toString())?.handle === "LobsterRogue");
  const llmClaims = claims.filter((c) => agents.get(c.agentId.toString())?.handle === "LlmScout");

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-2 text-sm text-neutral-500">
        <Link href="/" className="hover:text-white">home</Link> / claim feed
      </div>
      <h1 className="text-2xl md:text-3xl font-bold mb-2">Claim feed</h1>
      <p className="text-neutral-400 mb-2 text-sm md:text-base">Every bet placed by the three bots, with the on-chain receipt one click away.</p>
      <p className="text-neutral-500 text-xs mb-6">Live from Mantle Sepolia.</p>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-6 md:mb-8">
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Total bets</div>
          <div className="text-xl font-semibold tabular-nums">{stats.totalClaims}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Bot was right</div>
          <div className="text-xl font-semibold text-emerald-400 tabular-nums">{stats.settledRight}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Bot was wrong</div>
          <div className="text-xl font-semibold text-rose-400 tabular-nums">{stats.settledWrong}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Revealed</div>
          <div className="text-xl font-semibold text-amber-300 tabular-nums">{stats.publiclyRevealed}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Paid in by customers</div>
          <div className="text-xl font-semibold tabular-nums">{formatDollar(stats.totalUsdcPaidIn)}</div>
        </div>
      </section>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section>
          <h2 className="text-cat font-semibold mb-3 flex items-center gap-2">
            <span>🐈</span> CatScout <span className="text-neutral-600 font-normal">({catClaims.length})</span>
          </h2>
          <div className="space-y-3">
            {catClaims.length === 0 ? (
              <div className="text-neutral-500 text-sm">No bets yet.</div>
            ) : (
              catClaims.map((c) => (
                <ClaimCard key={c.id.toString()} claim={c} agent={agents.get(c.agentId.toString())} accent="cat" />
              ))
            )}
          </div>
        </section>
        <section>
          <h2 className="text-lobster font-semibold mb-3 flex items-center gap-2">
            <span>🦞</span> LobsterRogue <span className="text-neutral-600 font-normal">({lobsterClaims.length})</span>
          </h2>
          <div className="space-y-3">
            {lobsterClaims.length === 0 ? (
              <div className="text-neutral-500 text-sm">No bets yet.</div>
            ) : (
              lobsterClaims.map((c) => (
                <ClaimCard key={c.id.toString()} claim={c} agent={agents.get(c.agentId.toString())} accent="lobster" />
              ))
            )}
          </div>
        </section>
        <section>
          <h2 className="text-violet-300 font-semibold mb-3 flex items-center gap-2">
            <span>🧠</span> LlmScout <span className="text-neutral-600 font-normal">({llmClaims.length})</span>
          </h2>
          <div className="space-y-3">
            {llmClaims.length === 0 ? (
              <div className="text-neutral-500 text-sm">No bets yet.</div>
            ) : (
              llmClaims.map((c) => (
                <ClaimCard key={c.id.toString()} claim={c} agent={agents.get(c.agentId.toString())} accent="llm" />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
