import { ImageResponse } from "next/og";
import { buildStats } from "@/lib/season-stats";
import { formatDollar } from "@/lib/format";

export const dynamic = "force-dynamic";
export const alt = "Clawback — Bankr and Elfa AI proof plus wrong-call refund proof on Mantle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  let stats;
  try {
    stats = await buildStats();
  } catch {
    stats = null;
  }

  const refundTotal = stats?.totalRefundUsdc ?? 0n;
  const totalSettled = (stats?.settledRight ?? 0) + (stats?.settledWrong ?? 0);
  const aiReceipt = stats?.latestReceipts.find((receipt) => receipt.claimId === 111);
  const challengerReceipt = stats?.latestReceipts.find((receipt) => receipt.claimId === 112);
  const aiSignals = aiReceipt?.elfa?.signalCount ?? 5;
  const refundTx = stats?.proofRefund?.claimId === 112 ? stats.proofRefund.tx : challengerReceipt?.refundTx;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#050807",
          backgroundImage:
            "radial-gradient(circle at 16% 16%, rgba(110,231,183,0.18), transparent 34%), radial-gradient(circle at 76% 22%, rgba(167,139,250,0.15), transparent 36%), linear-gradient(135deg, rgba(10,10,10,0.96), rgba(10,18,15,0.98))",
          padding: "54px 62px",
          fontFamily: "system-ui, sans-serif",
          color: "#f8f6ee",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                background: "linear-gradient(135deg, #8af5b1, #b7ff66)",
                color: "#06110b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              ↩
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 900, letterSpacing: -0.8 }}>Clawback</div>
              <div style={{ display: "flex", fontSize: 13, color: "#a7f3d0", letterSpacing: 3, textTransform: "uppercase" }}>
                AI accountability on Mantle
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              border: "1px solid rgba(110,231,183,0.26)",
              borderRadius: 999,
              padding: "10px 16px",
              color: "#a7f3d0",
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: "#6ee7b7" }} />
            LIVE · MANTLE SEPOLIA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          <div style={{ display: "flex", fontSize: 67, fontWeight: 950, lineHeight: 0.98, letterSpacing: -2.5 }}>
            AI alpha gets scored.
          </div>
          <div style={{ display: "flex", fontSize: 67, fontWeight: 950, lineHeight: 0.98, letterSpacing: -2.5, color: "#8af5b1" }}>
            Wrong calls pay back.
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginTop: 36 }}>
          <ProofCard
            kicker="AI proof · #115"
            title="Bankr + Elfa call paid out"
            body={`LlmScout consumed ${aiSignals} Elfa signals, bonded 5.00 mUSDC, Pyth settled it RIGHT, and automation collected payout.`}
            value="5.25"
            accent="#a78bfa"
          />
          <ProofCard
            kicker="Refund proof · #112"
            title="Challenger wrong, payer refunded"
            body={refundTx ? "The wrong bonded call clawed back value from the slashed bond on Mantle." : "Wrong-call refund path verified on Mantle."}
            value="REFUNDED"
            accent="#6ee7b7"
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: 20,
            color: "#a3a3a3",
            fontSize: 19,
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#6ee7b7", fontWeight: 900 }}>{formatDollar(refundTotal)}</span>
            <span>refunded to users</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#f8f6ee", fontWeight: 900 }}>{totalSettled}</span>
            <span>settled receipts</span>
          </div>
          <div style={{ display: "flex", color: "#d9f99d", fontWeight: 900 }}>clawback-bay.vercel.app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function ProofCard({
  kicker,
  title,
  body,
  value,
  accent,
}: {
  kicker: string;
  title: string;
  body: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 172,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        border: `1px solid ${accent}55`,
        borderRadius: 24,
        backgroundColor: "rgba(7,10,11,0.72)",
        boxShadow: `0 0 58px -28px ${accent}`,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", color: accent, fontSize: 13, fontWeight: 900, letterSpacing: 2.6, textTransform: "uppercase" }}>
          {kicker}
        </div>
        <div style={{ display: "flex", marginTop: 10, color: "#f8f6ee", fontSize: 28, fontWeight: 950, lineHeight: 1.03, letterSpacing: -0.8 }}>
          {title}
        </div>
        <div style={{ display: "flex", marginTop: 12, color: "#c8c8c8", fontSize: 17, lineHeight: 1.35 }}>
          {body}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 18, color: accent, fontSize: 22, fontWeight: 950, letterSpacing: 1 }}>
        {value}
      </div>
    </div>
  );
}
