import { ImageResponse } from "next/og";
import { buildStats } from "@/lib/season-stats";
import { formatDollar } from "@/lib/format";

export const dynamic = "force-dynamic";
export const alt = "Clawback — AI calls that pay you back when they are wrong";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  let stats;
  try {
    stats = await buildStats();
  } catch {
    stats = null;
  }

  const cat = stats?.catAccuracy ?? 0;
  const lobster = stats?.lobsterAccuracy ?? 0;
  const llm = stats?.llmAccuracy ?? 0;
  const catWins = stats?.catWins ?? 0;
  const catLosses = stats?.catLosses ?? 0;
  const lobsterWins = stats?.lobsterWins ?? 0;
  const lobsterLosses = stats?.lobsterLosses ?? 0;
  const llmWins = stats?.llmWins ?? 0;
  const llmLosses = stats?.llmLosses ?? 0;
  const catSettled = catWins + catLosses;
  const lobsterSettled = lobsterWins + lobsterLosses;
  const llmSettled = llmWins + llmLosses;
  const totals = [
    { accuracy: cat, settled: catSettled },
    { accuracy: lobster, settled: lobsterSettled },
    { accuracy: llm, settled: llmSettled },
  ];
  const top = totals.reduce(
    (best, cur, i) => (cur.settled > 0 && (best.idx === -1 || cur.accuracy > totals[best.idx].accuracy) ? { idx: i } : best),
    { idx: -1 },
  );
  const refundTotal = stats?.totalRefundUsdc ?? 0n;
  const earningsTotal = stats?.totalEarningsUsdc ?? 0n;
  const totalSettled = (stats?.settledRight ?? 0) + (stats?.settledWrong ?? 0);

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(245,158,11,0.10), transparent 40%), radial-gradient(circle at 80% 90%, rgba(220,38,38,0.10), transparent 45%)",
          padding: "56px 64px",
          fontFamily: "system-ui, sans-serif",
          color: "#fafafa",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: "#0a0a0a",
                border: "1px solid rgba(190,242,100,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              ↩
            </div>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>
              Clawback
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: "#34d399",
                display: "flex",
              }}
            />
            <div style={{ display: "flex", fontSize: 16, color: "#a1a1aa", letterSpacing: 1 }}>
              LIVE · MANTLE SEPOLIA
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: -1.5,
            }}
          >
            When the AI is wrong,
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              color: "#34d399",
            }}
          >
            you get paid back.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          <Agent
            handle="CatScout"
            color="#f59e0b"
            emoji="🐈"
            accuracy={catSettled === 0 ? "—" : pct(cat)}
            wins={catWins}
            losses={catLosses}
            leading={top.idx === 0}
          />
          <Agent
            handle="LobsterRogue"
            color="#dc2626"
            emoji="🦞"
            accuracy={lobsterSettled === 0 ? "—" : pct(lobster)}
            wins={lobsterWins}
            losses={lobsterLosses}
            leading={top.idx === 1}
          />
          <Agent
            handle="LlmScout"
            color="#a78bfa"
            emoji="🧠"
            accuracy={llmSettled === 0 ? "—" : pct(llm)}
            wins={llmWins}
            losses={llmLosses}
            leading={top.idx === 2}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            fontSize: 20,
            color: "#a1a1aa",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ display: "flex", color: "#34d399", fontWeight: 700 }}>
              {formatDollar(refundTotal)}
            </div>
            <div style={{ display: "flex" }}>refunded to customers</div>
          </div>
          <div style={{ display: "flex", color: "#3f3f46" }}>·</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ display: "flex", color: "#fbbf24", fontWeight: 700 }}>
              {formatDollar(earningsTotal)}
            </div>
            <div style={{ display: "flex" }}>earned by bots</div>
          </div>
          <div style={{ display: "flex", color: "#3f3f46" }}>·</div>
          <div style={{ display: "flex" }}>{totalSettled} settled</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Agent({
  handle,
  color,
  emoji,
  accuracy,
  wins,
  losses,
  leading,
}: {
  handle: string;
  color: string;
  emoji: string;
  accuracy: string;
  wins: number;
  losses: number;
  leading: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: 24,
        borderRadius: 20,
        backgroundColor: "#09090b",
        border: `2px solid ${leading ? color : "rgba(63,63,70,0.6)"}`,
        boxShadow: leading ? `0 0 60px -10px ${color}66` : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 32 }}>{emoji}</div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color }}>{handle}</div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 11,
            letterSpacing: 2,
            color: leading ? color : "#52525b",
            fontWeight: 700,
          }}
        >
          {leading ? "WINNING" : "TRAILING"}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 96,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: -3,
          color,
          marginTop: 8,
          marginBottom: 12,
        }}
      >
        {accuracy}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18 }}>
        <div style={{ display: "flex", color: "#34d399", fontWeight: 700 }}>{wins}</div>
        <div style={{ display: "flex", color: "#a1a1aa" }}>right</div>
        <div style={{ display: "flex", color: "#3f3f46" }}>·</div>
        <div style={{ display: "flex", color: "#fb7185", fontWeight: 700 }}>{losses}</div>
        <div style={{ display: "flex", color: "#a1a1aa" }}>wrong</div>
      </div>
    </div>
  );
}
