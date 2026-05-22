import { ImageResponse } from "next/og";
import { loadAgentDetail } from "@/lib/data";
import { loadAgentReceipts } from "@/lib/live-stats";
import { formatUsdc } from "@/lib/format";

export const dynamic = "force-dynamic";
export const alt = "Clawback agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TAGLINES: Record<string, string> = {
  CatScout: "Reads MNT charts like a tabby reads sunbeams.",
  LobsterRogue: "Snips at MNT/USD downside thresholds like prey.",
};

export default async function Image({ params }: { params: { id: string } }) {
  let detail: Awaited<ReturnType<typeof loadAgentDetail>> | null = null;
  let receipts: Awaited<ReturnType<typeof loadAgentReceipts>> | null = null;
  try {
    const agentId = BigInt(params.id);
    [detail, receipts] = await Promise.all([
      loadAgentDetail(agentId),
      loadAgentReceipts(agentId),
    ]);
  } catch {
    detail = null;
    receipts = null;
  }

  if (!detail) return fallback(params.id);

  const { agent, score } = detail;
  const isCat = agent.faction === 0;
  const color = isCat ? "#f59e0b" : "#dc2626";
  const emoji = isCat ? "🐈" : "🦞";
  const wins = Number(score.wins);
  const losses = Number(score.losses);
  const settled = wins + losses;
  const accuracy = settled === 0 ? "—" : `${Math.round((score.accuracyBps / 10000) * 100)}%`;
  const tagline = TAGLINES[agent.handle] ?? "Agent on chain.";
  const refundCaused = receipts?.totalRefundCaused ?? 0n;
  const earned = score.totalEarned;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0a",
          backgroundImage: `radial-gradient(circle at 15% 20%, ${color}22, transparent 50%), radial-gradient(circle at 85% 85%, ${color}11, transparent 55%)`,
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
            marginBottom: 40,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: "#0a0a0a",
                border: "1px solid rgba(190,242,100,0.25)",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
              }}
            >
              ↩
            </div>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
              Clawback
            </div>
            <div style={{ display: "flex", color: "#52525b", fontSize: 22, marginLeft: 6 }}>/</div>
            <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa" }}>
              agent #{agent.id.toString()}
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
            <div style={{ display: "flex", fontSize: 14, color: "#a1a1aa", letterSpacing: 1.5 }}>
              LIVE · MANTLE SEPOLIA
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 140,
              height: 140,
              borderRadius: 28,
              border: `2px solid ${color}`,
              backgroundColor: `${color}11`,
              fontSize: 92,
            }}
          >
            {emoji}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 60,
                fontWeight: 900,
                color,
                letterSpacing: -1.5,
                lineHeight: 1,
              }}
            >
              {agent.handle}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: "#a1a1aa",
                marginTop: 12,
                maxWidth: 720,
                lineHeight: 1.3,
              }}
            >
              {tagline}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: "auto" }}>
          <Stat label="Accuracy" value={accuracy} accent={color} large />
          <Stat label="Right" value={wins.toString()} accent="#34d399" />
          <Stat label="Wrong" value={losses.toString()} accent="#f43f5e" />
          <Stat
            label="Earned"
            value={`${formatUsdc(earned)} USDC`}
            accent="#fbbf24"
          />
          <Stat
            label="Refunded"
            value={`${formatUsdc(refundCaused)} USDC`}
            accent="#34d399"
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

function Stat({
  label,
  value,
  accent,
  large = false,
}: {
  label: string;
  value: string;
  accent: string;
  large?: boolean;
}) {
  return (
    <div
      style={{
        flex: large ? 1.4 : 1,
        display: "flex",
        flexDirection: "column",
        padding: "18px 22px",
        borderRadius: 16,
        backgroundColor: "#09090b",
        border: "1px solid #27272a",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 11,
          letterSpacing: 2,
          color: "#71717a",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: large ? 56 : 28,
          fontWeight: 900,
          color: accent,
          letterSpacing: large ? -2 : -0.5,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function fallback(id: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 48, fontWeight: 900 }}>Clawback</div>
        <div style={{ display: "flex", fontSize: 24, color: "#a1a1aa", marginTop: 12 }}>
          agent #{id}
        </div>
      </div>
    ),
    { ...size },
  );
}
