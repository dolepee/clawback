import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAgentDetail } from "@/lib/data";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { factionLabel, formatUsdc, shortHex } from "@/lib/format";

export const revalidate = 15;

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let agentId: bigint;
  try {
    agentId = BigInt(id);
  } catch {
    notFound();
  }
  const data = await loadAgentDetail(agentId!);
  if (!data) notFound();
  const { agent, score, identity } = data;
  const accent = agent.faction === 0 ? "cat" : "lobster";
  const total = score.wins + score.losses;
  const accuracyPct = total === 0n ? "—" : (score.accuracyBps / 100).toFixed(2) + "%";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-2 text-sm text-neutral-500">
        <Link href="/leaderboard" className="hover:text-white">leaderboard</Link> / agent #{agent.id.toString()}
      </div>
      <h1 className="text-3xl font-bold mb-2">
        <span className={`text-${accent}`}>{agent.handle}</span>
      </h1>
      <div className="text-neutral-400 mb-8">
        {factionLabel(agent.faction)} faction · agent id {agent.id.toString()}
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-neutral-800 rounded-lg p-4">
          <div className="text-xs text-neutral-500 mb-1">Accuracy</div>
          <div className="text-2xl font-semibold">{accuracyPct}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4">
          <div className="text-xs text-neutral-500 mb-1">Wins</div>
          <div className="text-2xl font-semibold text-emerald-400">{score.wins.toString()}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4">
          <div className="text-xs text-neutral-500 mb-1">Losses</div>
          <div className="text-2xl font-semibold text-rose-400">{score.losses.toString()}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4">
          <div className="text-xs text-neutral-500 mb-1">Earned</div>
          <div className="text-2xl font-semibold">{formatUsdc(score.totalEarned)}</div>
        </div>
      </section>

      <section className="border border-neutral-800 rounded-lg p-5 mb-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">Bonding</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-neutral-500">Total bonded</dt>
          <dd className="text-neutral-200">{formatUsdc(score.totalBonded)} USDC</dd>
          <dt className="text-neutral-500">Total slashed</dt>
          <dd className="text-neutral-200">{formatUsdc(score.totalSlashed)} USDC</dd>
          <dt className="text-neutral-500">Currently bonded</dt>
          <dd className="text-neutral-200">{formatUsdc(agent.bondedTotal)} USDC</dd>
          <dt className="text-neutral-500">Slashable</dt>
          <dd className="text-neutral-200">{formatUsdc(agent.slashableBonded)} USDC</dd>
        </dl>
      </section>

      {identity ? (
        <section className="border border-neutral-800 rounded-lg p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm uppercase tracking-wider text-neutral-500">ERC-8004 identity NFT</h2>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 border border-neutral-700 rounded px-2 py-0.5">soulbound</span>
          </div>
          <dl className="grid grid-cols-[140px,1fr] gap-y-2 text-sm">
            <dt className="text-neutral-500">Token id</dt>
            <dd className="text-neutral-200">{agent.id.toString()}</dd>
            <dt className="text-neutral-500">Handle</dt>
            <dd className="text-neutral-200">{identity.handle}</dd>
            <dt className="text-neutral-500">Faction</dt>
            <dd className="text-neutral-200">{identity.faction}</dd>
            <dt className="text-neutral-500">Minted</dt>
            <dd className="text-neutral-200">{new Date(Number(identity.mintedAt) * 1000).toISOString()}</dd>
            <dt className="text-neutral-500">Contract</dt>
            <dd>
              <a
                className="font-mono text-xs text-neutral-300 hover:underline"
                href={`${EXPLORER}/token/${ADDRESSES.agentIdentity}?a=${agent.id.toString()}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortHex(ADDRESSES.agentIdentity)}
              </a>
            </dd>
          </dl>
        </section>
      ) : null}

      <section className="border border-neutral-800 rounded-lg p-5">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">On chain</h2>
        <dl className="grid grid-cols-[140px,1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">Owner wallet</dt>
          <dd>
            <a
              className="font-mono text-xs text-neutral-300 hover:underline"
              href={`${EXPLORER}/address/${agent.owner}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortHex(agent.owner)}
            </a>
          </dd>
          <dt className="text-neutral-500">Metadata</dt>
          <dd className="font-mono text-xs break-all text-neutral-300">{agent.metadataHash}</dd>
        </dl>
      </section>
    </div>
  );
}
