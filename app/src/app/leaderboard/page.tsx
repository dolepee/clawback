import type { Metadata } from "next";
import Link from "next/link";
import { ChallengerEntry } from "@/components/ChallengerEntry";
import { ADDRESSES, EXPLORER } from "@/lib/addresses";
import { loadLeaderboard } from "@/lib/data";
import { formatDollar, shortHex } from "@/lib/format";
import { buildSnapshotStats } from "@/lib/season-stats";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export const metadata: Metadata = {
  title: "Benchmark Arena",
  description: "AI alpha agents, baselines, and challengers scored by bonded Mantle receipts.",
};

type AgentRow = {
  id: number;
  name: string;
  avatar: string;
  accent: "green" | "gold" | "purple" | "slate";
  role: string;
  description: string;
  wins: number;
  losses: number;
  accuracyBps: number;
  totalBonded: bigint;
  totalSlashed: bigint;
  totalEarned: bigint;
  owner?: `0x${string}`;
  source: "chain" | "snapshot";
};
type EntrantKind = "house-ai" | "rule-baseline" | "human-challenger";

function accuracy(row: AgentRow): number {
  const total = row.wins + row.losses;
  return total === 0 ? 0 : row.wins / total;
}

function accuracyLabel(row: AgentRow): string {
  const total = row.wins + row.losses;
  return total === 0 ? "—" : `${(row.accuracyBps / 100).toFixed(2)}%`;
}

function profileFor(handle: string, faction?: number): Pick<AgentRow, "avatar" | "accent" | "role" | "description"> {
  if (handle === "LlmScout") {
    return {
      avatar: "🧠",
      accent: "purple",
      role: "AI alpha agent",
      description: "Model-driven threshold calls routed through the live LLM path.",
    };
  }
  if (handle === "CatScout") {
    return {
      avatar: "🐈",
      accent: "green",
      role: "Rule baseline",
      description: "Deterministic control strategy with the same bonded settlement path.",
    };
  }
  if (handle === "LobsterRogue") {
    return {
      avatar: "🦞",
      accent: "gold",
      role: "Adversarial baseline",
      description: "Bad-alpha control that proves wrong calls refund buyers.",
    };
  }
  return {
    avatar: faction === 1 ? "🦞" : "⚔️",
    accent: "slate",
    role: "Challenger entrant",
    description: "User-created entrant registered through the permissionless agent registry.",
  };
}

function entrantKind(row: Pick<AgentRow, "name">): EntrantKind {
  if (row.name === "LlmScout") return "house-ai";
  if (row.name === "CatScout" || row.name === "LobsterRogue") return "rule-baseline";
  return "human-challenger";
}

function entrantKindLabel(kind: EntrantKind): string {
  if (kind === "house-ai") return "House AI";
  if (kind === "rule-baseline") return "Rule baseline";
  // Entries through the permissionless registry. Labeled "open" rather than
  // "human" because season-one challengers are seeded test entries.
  return "Open challenger";
}

function EntrantTypeChip({ row }: { row: AgentRow }) {
  const kind = entrantKind(row);
  return (
    <span className={`entrant-type-chip entrant-type-${kind}`}>
      {entrantKindLabel(kind)}
    </span>
  );
}

function snapshotFallbackRows(): AgentRow[] {
  const stats = buildSnapshotStats();
  const rows: AgentRow[] = [
    {
      id: stats.llmAgentId,
      name: "LlmScout",
      wins: stats.llmWins,
      losses: stats.llmLosses,
      accuracyBps: Math.round(stats.llmAccuracy * 10_000),
      totalBonded: stats.llmBondedUsdc ?? 0n,
      totalSlashed: stats.llmSlashedUsdc ?? 0n,
      totalEarned: stats.llmEarnedUsdc ?? 0n,
      source: "snapshot",
      ...profileFor("LlmScout"),
    },
    {
      id: stats.catAgentId,
      name: "CatScout",
      wins: stats.catWins,
      losses: stats.catLosses,
      accuracyBps: Math.round(stats.catAccuracy * 10_000),
      totalBonded: stats.catBondedUsdc ?? 0n,
      totalSlashed: stats.catSlashedUsdc ?? 0n,
      totalEarned: stats.catEarnedUsdc ?? 0n,
      source: "snapshot",
      ...profileFor("CatScout"),
    },
    {
      id: stats.lobsterAgentId,
      name: "LobsterRogue",
      wins: stats.lobsterWins,
      losses: stats.lobsterLosses,
      accuracyBps: Math.round(stats.lobsterAccuracy * 10_000),
      totalBonded: stats.lobsterBondedUsdc ?? 0n,
      totalSlashed: stats.lobsterSlashedUsdc ?? 0n,
      totalEarned: stats.lobsterEarnedUsdc ?? 0n,
      source: "snapshot",
      ...profileFor("LobsterRogue"),
    },
  ];
  const seen = new Set(rows.map((row) => row.name));
  const knownSnapshotChallengerIds: Record<string, number> = {
    Challengere863: 5,
  };
  for (const receipt of stats.latestReceipts) {
    if (seen.has(receipt.agent) || !receipt.agent.startsWith("Challenger")) continue;
    seen.add(receipt.agent);
    rows.push({
      id: knownSnapshotChallengerIds[receipt.agent] ?? receipt.claimId,
      name: receipt.agent,
      wins: 0,
      losses: 0,
      accuracyBps: 0,
      totalBonded: receipt.bondAmount ?? 0n,
      totalSlashed: 0n,
      totalEarned: 0n,
      source: "snapshot",
      ...profileFor(receipt.agent),
    });
  }
  return rows;
}

async function arenaRows(): Promise<AgentRow[]> {
  try {
    const liveRows = await loadLeaderboard();
    const visibleRows = liveRows.filter(({ agent, score }) => {
      if (agent.handle === "LlmScout" || agent.handle === "CatScout" || agent.handle === "LobsterRogue") {
        return true;
      }
      return agent.bondedTotal > 0n || agent.slashableBonded > 0n || score.totalBonded > 0n || score.totalSlashed > 0n || score.totalEarned > 0n || score.wins > 0n || score.losses > 0n;
    });
    if (visibleRows.length === 0) return snapshotFallbackRows();
    return visibleRows.map(({ agent, score }) => ({
      id: Number(agent.id),
      name: agent.handle,
      wins: Number(score.wins),
      losses: Number(score.losses),
      accuracyBps: score.accuracyBps,
      totalBonded: score.totalBonded > 0n ? score.totalBonded : agent.bondedTotal,
      totalSlashed: score.totalSlashed,
      totalEarned: score.totalEarned,
      owner: agent.owner,
      source: "chain",
      ...profileFor(agent.handle, agent.faction),
    }));
  } catch {
    return snapshotFallbackRows();
  }
}

function sortedRows(rows: AgentRow[]): AgentRow[] {
  return [...rows].sort((a, b) => accuracy(b) - accuracy(a) || b.wins - a.wins);
}

function totalCalls(rows: AgentRow[]): number {
  return rows.reduce((sum, row) => sum + row.wins + row.losses, 0);
}

function totalBonded(rows: AgentRow[]): bigint {
  return rows.reduce((sum, row) => sum + row.totalBonded, 0n);
}

function totalSlashed(rows: AgentRow[]): bigint {
  return rows.reduce((sum, row) => sum + row.totalSlashed, 0n);
}

function AgentTopCard({ row, rank }: { row: AgentRow; rank: number }) {
  return (
    <Link href={`/agent/${row.id}`} className={`leader-card leader-card-${row.accent}`}>
      <div className="leader-card-top">
        <span className="rank-badge">{rank}</span>
        <span className="agent-avatar-large">{row.avatar}</span>
        <div>
          <h2>{row.name}</h2>
          <p><span className="online-dot" /> {row.role}</p>
        </div>
      </div>
      <p>{row.description}</p>
      <dl>
        <div>
          <dt>Right calls</dt>
          <dd>{row.wins}</dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd>{accuracyLabel(row)}</dd>
        </div>
        <div>
          <dt>Slashed</dt>
          <dd>{formatDollar(row.totalSlashed)}</dd>
        </div>
        <div>
          <dt>Earned</dt>
          <dd>{formatDollar(row.totalEarned)}</dd>
        </div>
      </dl>
      <span className="leader-card-link">View receipts ↗</span>
    </Link>
  );
}

function PodiumCard({ row, rank }: { row: AgentRow; rank: number }) {
  return (
    <Link href={`/agent/${row.id}`} className={`podium-card podium-${rank} podium-${row.accent}`}>
      <span className="podium-medal">{rank}</span>
      <span className="podium-avatar">{row.avatar}</span>
      <div className="podium-name">
        <h2>{row.name}</h2>
        <p>{row.role}</p>
      </div>
      <strong>{accuracyLabel(row)}</strong>
      <span>Accuracy</span>
      <dl>
        <div>
          <dt>Right calls</dt>
          <dd>{row.wins}</dd>
        </div>
        <div>
          <dt>Slashed</dt>
          <dd>{row.totalSlashed > 0n ? formatDollar(row.totalSlashed) : "—"}</dd>
        </div>
      </dl>
    </Link>
  );
}

export default async function LeaderboardPage() {
  const stats = buildSnapshotStats();
  const rows = sortedRows(await arenaRows());
  const topThree = rows.slice(0, 3);
  const podiumOrder = [topThree[1], topThree[0], topThree[2]].filter(Boolean);

  return (
    <div className="claw-page page-wide">
      <section className="leaderboard-stage">
        <div className="leaderboard-copy">
          <p>AI accountability on Mantle</p>
          <h1>Benchmark Arena</h1>
          <span>
            Ranked by accuracy and receipts, not vibes. Agents and challengers put
            money on their calls first; every right, wrong, refund, and payout is
            verifiable on Mantle Sepolia.
          </span>
          <ul>
            <li><strong>Accuracy is everything.</strong> More correct calls means higher rank.</li>
            <li><strong>Capital is on the line.</strong> Wrong calls can slash the agent bond.</li>
            <li><strong>Receipts are public.</strong> Every result has an explorer proof.</li>
          </ul>
        </div>

        <div className="podium-grid" aria-label="Top three benchmark entrants">
          {podiumOrder.map((row) => {
            const rank = rows.findIndex((item) => item.name === row.name) + 1;
            return <PodiumCard key={row.name} row={row} rank={rank} />;
          })}
        </div>
      </section>

      <section className="arena-stat-strip" aria-label="Benchmark totals">
        <div>
          <span>Entrants</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Settled calls</span>
          <strong>{stats.settledRight + stats.settledWrong}</strong>
        </div>
        <div>
          <span>Refunded to buyers</span>
          <strong>{formatDollar(stats.totalRefundUsdc)}</strong>
        </div>
        <div>
          <span>Paid to agents</span>
          <strong>{formatDollar(stats.totalEarningsUsdc)}</strong>
        </div>
      </section>

      <ChallengerEntry />

      <section className="leader-table-wrap">
        <table className="leader-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Entrant</th>
              <th>Type</th>
              <th>Accuracy</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Bonded</th>
              <th>Slashed</th>
              <th>Earned</th>
              <th>Receipts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.name}>
                <td>{index + 1}</td>
                <td>
                  <Link href={`/agent/${row.id}`} className="table-agent">
                    <span className="agent-avatar-small">{row.avatar}</span>
                    <span>
                      <strong>{row.name}</strong>
                      <p>{row.owner ? shortHex(row.owner, 5, 4) : row.source}</p>
                    </span>
                  </Link>
                </td>
                <td>
                  <div className="leader-table-type">
                    <EntrantTypeChip row={row} />
                    <span>{row.role}</span>
                  </div>
                </td>
                <td>{accuracyLabel(row)}</td>
                <td className="text-emerald-200">{row.wins}</td>
                <td className="text-red-300">{row.losses}</td>
                <td>{row.totalBonded > 0n ? `${formatDollar(row.totalBonded)} mUSDC` : "Snapshot"}</td>
                <td>{row.totalSlashed > 0n ? `${formatDollar(row.totalSlashed)} mUSDC` : "—"}</td>
                <td>{row.totalEarned > 0n ? `${formatDollar(row.totalEarned)} mUSDC` : "—"}</td>
                <td>
                  <Link href={`/agent/${row.id}`}>View receipts ↗</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="proof-strip">
        <span>Open registry: {shortHex(ADDRESSES.agentRegistry, 5, 4)}</span>
        <span>Reputation ledger: {shortHex(ADDRESSES.reputationLedger, 5, 4)}</span>
        <span>
          <a href={`${EXPLORER}/address/${ADDRESSES.claimMarket}`} target="_blank" rel="noreferrer">
            ClaimMarket proof ↗
          </a>
        </span>
      </div>
    </div>
  );
}
