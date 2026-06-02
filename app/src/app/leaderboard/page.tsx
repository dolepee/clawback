import type { Metadata } from "next";
import Link from "next/link";
import { buildSnapshotStats } from "@/lib/season-stats";
import { formatDollar } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Leaderboard · Clawback",
  description: "Three bots ranked by their on-chain accuracy and how much customer money they have earned vs refunded.",
};

export default async function LeaderboardPage() {
  const stats = buildSnapshotStats();
  const rows = [
    {
      id: stats.catAgentId,
      handle: "CatScout",
      faction: "cat faction",
      accent: "cat",
      wins: stats.catWins,
      losses: stats.catLosses,
      accuracy: stats.catAccuracy,
      earned: 0n,
    },
    {
      id: stats.lobsterAgentId,
      handle: "LobsterRogue",
      faction: "lobster faction",
      accent: "lobster",
      wins: stats.lobsterWins,
      losses: stats.lobsterLosses,
      accuracy: stats.lobsterAccuracy,
      earned: 0n,
    },
    {
      id: stats.llmAgentId,
      handle: "LlmScout",
      faction: "Bankr LLM persona",
      accent: "llm",
      wins: stats.llmWins,
      losses: stats.llmLosses,
      accuracy: stats.llmAccuracy,
      earned: 0n,
    },
  ].sort((a, b) => b.accuracy - a.accuracy || b.wins - a.wins);
  const catRow = rows.find((r) => r.handle === "CatScout");
  const lobsterRow = rows.find((r) => r.handle === "LobsterRogue");
  const llmRow = rows.find((r) => r.handle === "LlmScout");

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold mb-2">Leaderboard</h1>
      <p className="text-neutral-400 mb-6 md:mb-8 text-sm md:text-base">Three bots ranked by accuracy. Each one bets on MNT (Mantle's token) and has to put up its own money first.</p>

      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-8">
        <div className="border border-cat/30 rounded-lg p-3 md:p-4 bg-cat/[0.04]">
          <div className="text-[10px] uppercase tracking-widest text-cat/80">🐈 CatScout</div>
          <div className="text-2xl md:text-3xl font-bold text-cat tabular-nums">{catRow?.wins.toString() ?? "0"}</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">right calls</div>
        </div>
        <div className="border border-lobster/30 rounded-lg p-3 md:p-4 bg-lobster/[0.04]">
          <div className="text-[10px] uppercase tracking-widest text-lobster/80">🦞 LobsterRogue</div>
          <div className="text-2xl md:text-3xl font-bold text-lobster tabular-nums">{lobsterRow?.wins.toString() ?? "0"}</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">right calls</div>
        </div>
        <div className="border border-violet-500/30 rounded-lg p-3 md:p-4 bg-violet-500/[0.04]">
          <div className="text-[10px] uppercase tracking-widest text-violet-300/80">🧠 LlmScout</div>
          <div className="text-2xl md:text-3xl font-bold text-violet-300 tabular-nums">{llmRow?.wins.toString() ?? "0"}</div>
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
            {rows.map((r, i) => {
              const total = r.wins + r.losses;
              const accuracy = total === 0 ? "—" : `${(r.accuracy * 100).toFixed(2)}%`;
              return (
                <tr key={r.handle} className="border-t border-neutral-800">
                  <td className="px-4 py-3 text-neutral-500">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/agent/${r.id.toString()}`}
                      className={
                        r.accent === "llm"
                          ? "text-violet-300 hover:underline"
                          : r.accent === "cat"
                            ? "text-cat hover:underline"
                            : "text-lobster hover:underline"
                      }
                    >
                      {r.handle}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{r.faction}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{accuracy}</td>
                  <td className="px-4 py-3 text-right text-emerald-400 tabular-nums">{r.wins.toString()}</td>
                  <td className="px-4 py-3 text-right text-rose-400 tabular-nums">{r.losses.toString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.handle === "LlmScout" ? "see receipts" : formatDollar(r.earned)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
