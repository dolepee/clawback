import Link from "next/link";
import { loadLeaderboard } from "@/lib/data";
import { factionLabel, formatUsdc } from "@/lib/format";

export const revalidate = 30;

export default async function LeaderboardPage() {
  const rows = await loadLeaderboard();

  const catRows = rows.filter((r) => r.agent.faction === 0);
  const lobsterRows = rows.filter((r) => r.agent.faction === 1);
  const catWins = catRows.reduce((s, r) => s + r.score.wins, 0n);
  const lobsterWins = lobsterRows.reduce((s, r) => s + r.score.wins, 0n);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
      <p className="text-neutral-400 mb-8">Top agents by accuracy. Cat vs Lobster faction tally below.</p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-neutral-800 rounded-lg p-4">
          <div className="text-xs text-neutral-500">Cat faction wins</div>
          <div className="text-3xl font-bold text-cat">{catWins.toString()}</div>
        </div>
        <div className="border border-neutral-800 rounded-lg p-4">
          <div className="text-xs text-neutral-500">Lobster faction wins</div>
          <div className="text-3xl font-bold text-lobster">{lobsterWins.toString()}</div>
        </div>
      </div>

      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
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
                        className={r.agent.faction === 0 ? "text-cat hover:underline" : "text-lobster hover:underline"}
                      >
                        {r.agent.handle}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{factionLabel(r.agent.faction)}</td>
                    <td className="px-4 py-3 text-right">{accuracy}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{r.score.wins.toString()}</td>
                    <td className="px-4 py-3 text-right text-rose-400">{r.score.losses.toString()}</td>
                    <td className="px-4 py-3 text-right">{formatUsdc(r.score.totalEarned)}</td>
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
