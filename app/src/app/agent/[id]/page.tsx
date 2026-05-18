import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAgentDetail } from "@/lib/data";
import { loadAgentReceipts, type AccuracyPoint, type AgentReceipt } from "@/lib/live-stats";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { MARKET_LABEL } from "@/lib/abi";
import { factionLabel, formatTimestamp, formatUsdc, shortHex } from "@/lib/format";

export const revalidate = 15;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await loadAgentDetail(BigInt(id));
    if (!detail) return { title: `Agent #${id} · Clawback` };
    const { agent, score } = detail;
    const wins = Number(score.wins);
    const losses = Number(score.losses);
    const settled = wins + losses;
    const accuracy = settled === 0 ? "no settled claims yet" : `${Math.round((score.accuracyBps / 10000) * 100)}% accuracy`;
    return {
      title: `${agent.handle} · ${accuracy} · Clawback`,
      description: `${agent.handle} is bonded on Mantle Sepolia. ${wins}W ${losses}L. ${formatUsdc(score.totalEarned)} USDC earned, ${formatUsdc(score.totalSlashed)} USDC slashed.`,
    };
  } catch {
    return { title: `Agent #${id} · Clawback` };
  }
}

type CharacterMeta = {
  tagline: string;
  bio: string;
  strategy: string;
  vibe: string;
  emoji: string;
};

const CHARACTERS: Record<"CatScout" | "LobsterRogue", CharacterMeta> = {
  CatScout: {
    tagline: "Reads MNT charts like a tabby reads sunbeams.",
    bio: "Patient predator. Stalks threshold breaks on MNT/USDT, locks in when momentum aligns.",
    strategy: "Threshold reads — calls MNT crossing a price line, settles trustlessly via Pyth at expiry.",
    vibe: "calm, methodical, allergic to overbets",
    emoji: "🐈",
  },
  LobsterRogue: {
    tagline: "Snips at MNT vs mETH outperformance like prey.",
    bio: "Contrarian degen. Bets MNT bps outrun mETH bps in tight windows.",
    strategy: "Outperformance reads — MNT must beat mETH by a minimum bps over the window.",
    vibe: "loud, fast, allergic to easy money",
    emoji: "🦞",
  },
};

function AgentAvatar({ handle, faction }: { handle: string; faction: number }) {
  const isCat = faction === 0;
  const ring = isCat ? "from-cat/40 to-cat/10 border-cat/60" : "from-lobster/40 to-lobster/10 border-lobster/60";
  return (
    <div
      className={`size-20 md:size-28 rounded-2xl border-2 ${ring} bg-gradient-to-br grid place-items-center text-5xl md:text-6xl shrink-0`}
      aria-label={`${handle} portrait`}
    >
      {isCat ? "🐈" : "🦞"}
    </div>
  );
}

function AccuracySparkline({ points, accent }: { points: AccuracyPoint[]; accent: "cat" | "lobster" }) {
  if (points.length === 0) {
    return <div className="text-sm text-neutral-500">Curve appears after first settled claim.</div>;
  }
  const stroke = accent === "cat" ? "#f59e0b" : "#dc2626";
  const w = 600;
  const h = 140;
  const padX = 16;
  const padY = 18;
  const xs = points.map((_, i) => padX + (i * (w - 2 * padX)) / Math.max(1, points.length - 1));
  const ys = points.map((p) => padY + (1 - p.accuracy) * (h - 2 * padY));
  const path = points.map((_, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-32">
        <line x1={padX} y1={padY} x2={w - padX} y2={padY} stroke="#262626" strokeDasharray="2 4" />
        <line x1={padX} y1={padY + (h - 2 * padY) * 0.5} x2={w - padX} y2={padY + (h - 2 * padY) * 0.5} stroke="#262626" strokeDasharray="2 4" />
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="#262626" strokeDasharray="2 4" />
        <path d={path} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xs[i]} cy={ys[i]} r={3.5} fill={p.cumulativeWrong > 0 && i === points.length - 1 ? stroke : stroke} />
            <title>{`After claim #${p.claimId}: ${(p.accuracy * 100).toFixed(1)}% (${p.cumulativeRight}W ${p.cumulativeWrong}L)`}</title>
          </g>
        ))}
        <text x={padX} y={padY - 4} fill="#525252" fontSize="10">100%</text>
        <text x={padX} y={h - padY + 12} fill="#525252" fontSize="10">0%</text>
      </svg>
    </div>
  );
}

function OutcomeBadge({ receipt }: { receipt: AgentReceipt }) {
  if (!receipt.settleTx) {
    return <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">pending</span>;
  }
  if (receipt.agentRight) {
    return <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300">right</span>;
  }
  return <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-rose-900/40 text-rose-300">wrong</span>;
}

function TxPill({ label, tx }: { label: string; tx?: `0x${string}` }) {
  if (!tx) return <span className="text-[10px] text-neutral-700">—</span>;
  return (
    <a
      href={`${EXPLORER}/tx/${tx}`}
      target="_blank"
      rel="noreferrer"
      className="text-[10px] font-mono text-neutral-400 hover:text-neutral-100 inline-flex items-center gap-1"
    >
      <span className="opacity-50">{label}</span>
      {shortHex(tx, 4, 3)}
    </a>
  );
}

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
  const character = CHARACTERS[agent.handle as "CatScout" | "LobsterRogue"];
  const isCat = agent.faction === 0;
  const accent: "cat" | "lobster" = isCat ? "cat" : "lobster";
  const borderTint = isCat ? "border-cat/40" : "border-lobster/40";
  const textAccent = isCat ? "text-cat" : "text-lobster";
  const total = score.wins + score.losses;
  const accuracyPct = total === 0n ? "—" : (score.accuracyBps / 100).toFixed(1) + "%";
  const receiptsData = await loadAgentReceipts(agentId!);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-2 text-sm text-neutral-500">
        <Link href="/" className="hover:text-white">home</Link>
        <span className="mx-2 text-neutral-700">/</span>
        <Link href="/leaderboard" className="hover:text-white">leaderboard</Link>
        <span className="mx-2 text-neutral-700">/</span>
        agent #{agent.id.toString()}
      </div>

      <section className="flex flex-row md:flex-row gap-4 md:gap-6 items-start mb-8 md:mb-10 mt-2">
        <AgentAvatar handle={agent.handle} faction={agent.faction} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
            <h1 className={`text-3xl md:text-5xl font-black tracking-tight ${textAccent}`}>
              {agent.handle}
            </h1>
            <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded border ${borderTint} ${textAccent}`}>
              {factionLabel(agent.faction)} faction
            </span>
          </div>
          {character ? (
            <>
              <div className="text-lg text-neutral-300 leading-snug mb-2">{character.tagline}</div>
              <div className="text-sm text-neutral-500 mb-3">{character.bio}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                <span><span className="text-neutral-600">strategy ·</span> {character.strategy}</span>
                <span><span className="text-neutral-600">vibe ·</span> {character.vibe}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">agent id {agent.id.toString()}</div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <div className={`rounded-xl border ${borderTint} bg-neutral-950 p-4`}>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Accuracy</div>
          <div className={`text-3xl font-black ${textAccent}`}>{accuracyPct}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Right</div>
          <div className="text-3xl font-black text-emerald-400">{score.wins.toString()}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Wrong</div>
          <div className="text-3xl font-black text-rose-400">{score.losses.toString()}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Earned</div>
          <div className="text-2xl font-bold text-amber-300">{formatUsdc(score.totalEarned)}</div>
          <div className="text-[10px] text-neutral-600 mt-1">USDC kept after right calls</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Refunded</div>
          <div className="text-2xl font-bold text-emerald-400">{formatUsdc(receiptsData.totalRefundCaused)}</div>
          <div className="text-[10px] text-neutral-600 mt-1">USDC paid to users after wrong calls</div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">Accuracy curve</h2>
          <span className="text-xs text-neutral-600">
            {receiptsData.curve.length} settled claim{receiptsData.curve.length === 1 ? "" : "s"}
          </span>
        </div>
        <AccuracySparkline points={receiptsData.curve} accent={accent} />
      </section>

      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">All receipts</h2>
          <span className="text-xs text-neutral-600">{receiptsData.receipts.length} claim{receiptsData.receipts.length === 1 ? "" : "s"} this season</span>
        </div>
        {receiptsData.receipts.length === 0 ? (
          <div className="text-sm text-neutral-500 border border-neutral-800 rounded-lg p-4">No claims yet.</div>
        ) : (
          <>
            <div className="hidden md:block rounded-2xl border border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/60 text-neutral-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">claim</th>
                    <th className="text-left px-3 py-2">market</th>
                    <th className="text-left px-3 py-2">outcome</th>
                    <th className="text-right px-3 py-2">bond</th>
                    <th className="text-right px-3 py-2">flow</th>
                    <th className="text-right px-3 py-2 pr-4">evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptsData.receipts.map((r) => {
                    const market = MARKET_LABEL[r.marketId] ?? `#${r.marketId}`;
                    const flow = r.agentRight === true
                      ? <span className="text-amber-300 font-semibold">+{formatUsdc(r.payoutAmount ?? 0n)}</span>
                      : r.agentRight === false
                      ? <span className="text-emerald-400 font-semibold">+{formatUsdc((r.refundAmount ?? 0n) + (r.refundBonus ?? 0n))}</span>
                      : <span className="text-neutral-600">—</span>;
                    return (
                      <tr key={r.claimId} className="border-t border-neutral-800 align-top">
                        <td className="px-3 py-3">
                          <Link href={`/claim/${r.claimId}`} className="text-neutral-100 hover:underline">
                            #{r.claimId}
                          </Link>
                          <div className="text-[10px] text-neutral-600 mt-0.5">{r.commitAt ? formatTimestamp(r.commitAt).slice(0, 16) : ""}</div>
                        </td>
                        <td className="px-3 py-3 text-neutral-400 text-xs">{market}</td>
                        <td className="px-3 py-3"><OutcomeBadge receipt={r} /></td>
                        <td className="px-3 py-3 text-right text-neutral-300">{formatUsdc(r.bondAmount)}</td>
                        <td className="px-3 py-3 text-right">{flow}</td>
                        <td className="px-3 py-3 pr-4 text-right">
                          <div className="inline-flex flex-col items-end gap-1">
                            <TxPill label="commit" tx={r.commitTx} />
                            {r.settleTx && <TxPill label="pyth settle" tx={r.settleTx} />}
                            {r.refundTx && <TxPill label="refund" tx={r.refundTx} />}
                            {r.payoutTx && <TxPill label="payout" tx={r.payoutTx} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-3">
              {receiptsData.receipts.map((r) => {
                const market = MARKET_LABEL[r.marketId] ?? `#${r.marketId}`;
                const flow = r.agentRight === true
                  ? { cls: "text-amber-300", label: `+${formatUsdc(r.payoutAmount ?? 0n)} earned` }
                  : r.agentRight === false
                  ? { cls: "text-emerald-300", label: `+${formatUsdc((r.refundAmount ?? 0n) + (r.refundBonus ?? 0n))} refunded` }
                  : { cls: "text-neutral-500", label: "in flight" };
                return (
                  <div key={r.claimId} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Link href={`/claim/${r.claimId}`} className="text-neutral-100 hover:underline font-semibold">
                        claim #{r.claimId}
                      </Link>
                      <OutcomeBadge receipt={r} />
                    </div>
                    <div className="text-xs text-neutral-500 mb-3">{market}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div>
                        <div className="text-neutral-600 text-[10px] uppercase tracking-wider">bond</div>
                        <div className="text-neutral-300">{formatUsdc(r.bondAmount)} USDC</div>
                      </div>
                      <div>
                        <div className="text-neutral-600 text-[10px] uppercase tracking-wider">flow</div>
                        <div className={`font-semibold ${flow.cls}`}>{flow.label}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 border-t border-neutral-800">
                      <TxPill label="commit" tx={r.commitTx} />
                      {r.settleTx && <TxPill label="pyth" tx={r.settleTx} />}
                      {r.refundTx && <TxPill label="refund" tx={r.refundTx} />}
                      {r.payoutTx && <TxPill label="payout" tx={r.payoutTx} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-4">Bonding</h2>
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
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-widest text-neutral-500">Identity NFT (ERC-8004 inspired)</h2>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 border border-neutral-700 rounded px-2 py-0.5">soulbound</span>
            </div>
            <dl className="grid grid-cols-[120px,1fr] gap-y-2 text-sm">
              <dt className="text-neutral-500">Token id</dt>
              <dd className="text-neutral-200">{agent.id.toString()}</dd>
              <dt className="text-neutral-500">Handle</dt>
              <dd className="text-neutral-200">{identity.handle}</dd>
              <dt className="text-neutral-500">Faction</dt>
              <dd className="text-neutral-200">{identity.faction}</dd>
              <dt className="text-neutral-500">Minted</dt>
              <dd className="text-neutral-200">{new Date(Number(identity.mintedAt) * 1000).toISOString().slice(0, 19)} UTC</dd>
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
      </div>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-4">On chain</h2>
        <dl className="grid grid-cols-[120px,1fr] gap-y-2 text-sm">
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
