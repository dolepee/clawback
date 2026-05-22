import { ImageResponse } from "next/og";
import { loadClaimDetail } from "@/lib/data";
import { CLAIM_STATE, MARKET_LABEL } from "@/lib/abi";
import { decodePredictionParams, formatUsdc, predictionQuestion } from "@/lib/format";

export const dynamic = "force-dynamic";
export const alt = "Clawback claim";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Outcome = "pending" | "right" | "wrong";

export default async function Image({ params }: { params: { id: string } }) {
  let detail: Awaited<ReturnType<typeof loadClaimDetail>> | null = null;
  try {
    detail = await loadClaimDetail(BigInt(params.id));
  } catch {
    detail = null;
  }

  if (!detail) return fallback(params.id);

  const { claim, agent, accounting } = detail;
  const isCat = agent.faction === 0;
  const color = isCat ? "#f59e0b" : "#dc2626";
  const emoji = isCat ? "🐈" : "🦞";
  const settled = claim.state === CLAIM_STATE.SETTLED || accounting.settled;
  const outcome: Outcome = settled ? (accounting.agentRight ? "right" : "wrong") : "pending";
  const market = MARKET_LABEL[claim.marketId] ?? `market #${claim.marketId}`;
  const prediction = decodePredictionParams(claim.marketId, claim.predictionParams);
  const question = predictionQuestion(prediction, claim.expiry);

  const outcomeColor =
    outcome === "right" ? "#34d399" : outcome === "wrong" ? "#f43f5e" : "#a1a1aa";
  const outcomeBg =
    outcome === "right"
      ? "rgba(52,211,153,0.12)"
      : outcome === "wrong"
        ? "rgba(244,63,94,0.12)"
        : "rgba(161,161,170,0.08)";
  const outcomeLabel =
    outcome === "right" ? "AGENT RIGHT" : outcome === "wrong" ? "AGENT WRONG · REFUND" : "LIVE";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0a",
          backgroundImage: `radial-gradient(circle at 80% 0%, ${color}22, transparent 50%)`,
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
            marginBottom: 36,
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
              claim #{claim.id.toString()}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 16px",
              borderRadius: 999,
              backgroundColor: outcomeBg,
              border: `1px solid ${outcomeColor}55`,
              color: outcomeColor,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {outcomeLabel}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", fontSize: 56 }}>{emoji}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 900, color, letterSpacing: -1 }}>
              {agent.handle}
            </div>
            <div style={{ display: "flex", fontSize: 18, color: "#71717a", letterSpacing: 0.5 }}>
              {market}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: -0.8,
            color: "#e4e4e7",
            marginBottom: "auto",
            maxWidth: 1050,
          }}
        >
          {clampQuestion(question)}
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 28,
          }}
        >
          <Stat label="Bond" value={`${formatUsdc(claim.bondAmount)} USDC`} accent={color} />
          <Stat label="Unlock" value={`${formatUsdc(claim.unlockPrice)} USDC`} accent="#fafafa" />
          <Stat
            label="Total paid"
            value={`${formatUsdc(accounting.totalPaid)} USDC`}
            accent="#fafafa"
          />
          <Stat
            label={outcome === "right" ? "Earned" : outcome === "wrong" ? "Refunded" : "At stake"}
            value={`${formatUsdc(accounting.bondAtStake)} USDC`}
            accent={
              outcome === "right" ? "#34d399" : outcome === "wrong" ? "#f43f5e" : "#a1a1aa"
            }
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

function clampQuestion(q: string): string {
  if (q.length <= 180) return q;
  return q.slice(0, 177) + "…";
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "16px 20px",
        borderRadius: 14,
        backgroundColor: "#09090b",
        border: "1px solid #27272a",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 12,
          letterSpacing: 2,
          color: "#71717a",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: accent }}>{value}</div>
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
          claim #{id}
        </div>
      </div>
    ),
    { ...size },
  );
}
