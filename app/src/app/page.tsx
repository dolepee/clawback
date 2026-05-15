import Link from "next/link";
import { loadFeed, loadFeedStats, type Agent, type Claim } from "@/lib/data";
import { CLAIM_STATE, MARKET_LABEL } from "@/lib/abi";
import { decodePredictionParams, formatUsdc, predictionQuestion, relativeTime, shortHex } from "@/lib/format";

export const revalidate = 15;

function stateLabel(state: number): { text: string; cls: string } {
  if (state === CLAIM_STATE.SETTLED) return { text: "Settled", cls: "bg-emerald-700/30 text-emerald-300" };
  if (state === CLAIM_STATE.PUBLICLY_REVEALED) return { text: "Revealed", cls: "bg-amber-700/30 text-amber-300" };
  return { text: "Committed", cls: "bg-neutral-700/40 text-neutral-300" };
}

function ClaimCard({ claim, agent, accent }: { claim: Claim; agent?: Agent; accent: "cat" | "lobster" }) {
  const s = stateLabel(claim.state);
  const market = MARKET_LABEL[claim.marketId] ?? `market #${claim.marketId}`;
  const handle = agent?.handle ?? `agent ${claim.agentId.toString()}`;
  const params = decodePredictionParams(claim.marketId, claim.predictionParams);
  const question = predictionQuestion(params, claim.expiry);
  return (
    <Link
      href={`/claim/${claim.id.toString()}`}
      className="block border border-neutral-800 hover:border-neutral-600 rounded-lg p-4 transition-colors"
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm text-neutral-400">claim #{claim.id.toString()}</div>
        <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.text}</span>
      </div>
      <div className={`font-semibold text-${accent} mb-1`}>{handle}</div>
      <div className="text-xs text-neutral-500 mb-1">{market}</div>
      <div className="text-sm text-neutral-300 mb-3 leading-snug">{question}</div>
      <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400">
        <div>
          <div className="text-neutral-500">bond</div>
          <div className="text-neutral-200">{formatUsdc(claim.bondAmount)} USDC</div>
        </div>
        <div>
          <div className="text-neutral-500">unlock</div>
          <div className="text-neutral-200">{formatUsdc(claim.unlockPrice)} USDC</div>
        </div>
        <div>
          <div className="text-neutral-500">expires</div>
          <div className="text-neutral-200">{relativeTime(claim.expiry)}</div>
        </div>
        <div>
          <div className="text-neutral-500">commit</div>
          <div className="text-neutral-200 font-mono">{shortHex(claim.claimHash)}</div>
        </div>
      </div>
    </Link>
  );
}

export default async function ClaimFeedPage() {
  const [{ claims, agents }, stats] = await Promise.all([loadFeed(), loadFeedStats()]);

  const catClaims = claims.filter((c) => agents.get(c.agentId.toString())?.faction === 0);
  const lobsterClaims = claims.filter((c) => agents.get(c.agentId.toString())?.faction === 1);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Claim feed</h1>
      <p className="text-neutral-400 mb-2">AI calls that pay you back when they are wrong.</p>
      <p className="text-neutral-500 text-xs mb-6">Live from Mantle Sepolia.</p>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Claims</div>
          <div className="text-xl font-semibold">{stats.totalClaims}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Agent right</div>
          <div className="text-xl font-semibold text-emerald-400">{stats.settledRight}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Agent wrong</div>
          <div className="text-xl font-semibold text-rose-400">{stats.settledWrong}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Revealed</div>
          <div className="text-xl font-semibold text-amber-300">{stats.publiclyRevealed}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">USDC paid in</div>
          <div className="text-xl font-semibold">{formatUsdc(stats.totalUsdcPaidIn)}</div>
        </div>
      </section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-cat font-semibold mb-3">Cat faction ({catClaims.length})</h2>
          <div className="space-y-3">
            {catClaims.length === 0 ? (
              <div className="text-neutral-500 text-sm">No claims yet.</div>
            ) : (
              catClaims.map((c) => (
                <ClaimCard
                  key={c.id.toString()}
                  claim={c}
                  agent={agents.get(c.agentId.toString())}
                  accent="cat"
                />
              ))
            )}
          </div>
        </section>
        <section>
          <h2 className="text-lobster font-semibold mb-3">Lobster faction ({lobsterClaims.length})</h2>
          <div className="space-y-3">
            {lobsterClaims.length === 0 ? (
              <div className="text-neutral-500 text-sm">No claims yet.</div>
            ) : (
              lobsterClaims.map((c) => (
                <ClaimCard
                  key={c.id.toString()}
                  claim={c}
                  agent={agents.get(c.agentId.toString())}
                  accent="lobster"
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
