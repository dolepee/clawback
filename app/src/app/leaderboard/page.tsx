import type { Metadata } from "next";
import Link from "next/link";
import { loadLeaderboard } from "@/lib/data";
import { factionLabel, formatDollar } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Leaderboard · Clawback",
  description: "Three bots ranked by their on-chain accuracy and how much customer money they have earned vs refunded.",
};

export default async function LeaderboardPage() {
  // Mantle Sepolia public RPC frequently 5xxs under load. Soft-fail so a
  // single flaky read doesn't 500 the whole leaderboard — render with an
  // empty row set and let AutoRefresh retry on the next tick.
  let rows: Awaited<ReturnType<typeof loadLeaderboard>> = [];
  try {
    rows = await loadLeaderboard();
  } catch (err) {
    console.warn("loadLeaderboard failed, rendering empty shell:", err);
  }
  const catRow = rows.find((r) => r.agent.handle === "CatScout");
  const lobsterRow = rows.find((r) => r.agent.handle === "LobsterRogue");
  const llmRow = rows.find((r) => r.agent.handle === "LlmScout");

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold mb-2">Leaderboard</h1>
      <p className="text-neutral-400 mb-6 md:mb-8 text-sm md:text-base">Three bots ranked by accuracy. Each one bets on MNT (Mantle's token) and has to put up its own money first.</p>

      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-8">
        <div className="border border-cat/30 rounded-lg p-3 md:p-4 bg-cat/[0.04]">
          <div className="text-[10px] uppercase tracking-widest text-cat/80">🐈 CatScout</div>
          <div className="text-2xl md:text-3xl font-bold text-cat tabular-nums">{catRow?.score.wins.toString() ?? "0"}</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">right calls</div>
        </div>
        <div className="border border-lobster/30 rounded-lg p-3 md:p-4 bg-lobster/[0.04]">
          <div className="text-[10px] uppercase tracking-widest text-lobster/80">🦞 LobsterRogue</div>
          <div className="text-2xl md:text-3xl font-bold text-lobster tabular-nums">{lobsterRow?.score.wins.toString() ?? "0"}</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">right calls</div>
        </div>
        <div className="border border-violet-500/30 rounded-lg p-3 md:p-4 bg-violet-500/[0.04]">
          <div className="text-[10px] uppercase tracking-widest text-violet-300/80">🧠 LlmScout</div>
          <div className="text-2xl md:text-3xl font-bold text-violet-300 tabular-nums">{llmRow?.score.wins.toString() ?? "0"}</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">right calls</div>
        </div>
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">agent</th>
              <th className="text-left px-4 py-2">faction</th>
              <th className="text-right px-4 py-2">accuracy</th>
              <th className="text-right px-4 py-2">W</th>
              <th className="text-right px-4 py-2">L</th>
              <th className="text-right px-4 py-2">earned</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-neutral-500 px-4 py-6">
                  No registered agents yet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const total = r.score.wins + r.score.losses;
                const accuracy = total === 0n ? "—" : (r.score.accuracyBps / 100).toFixed(2) + "%";
                return (
                  <tr key={r.agent.id.toString()} className="border-t border-neutral-800">
                    <td className="px-4 py-3 text-neutral-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/agent/${r.agent.id.toString()}`}
                        className={
                          r.agent.handle === "LlmScout"
                            ? "text-violet-300 hover:underline"
                            : r.agent.faction === 0
                            ? "text-cat hover:underline"
                            : "text-lobster hover:underline"
                        }
                      >
                        {r.agent.handle}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {r.agent.handle === "LlmScout" ? "AI persona" : `${factionLabel(r.agent.faction)} faction`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{accuracy}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">{r.score.wins.toString()}</td>
                    <td className="px-4 py-3 text-right text-rose-400 tabular-nums">{r.score.losses.toString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatDollar(r.score.totalEarned)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
