"use client";

import { useEffect, useState } from "react";

type Receipt = {
  claimId: number;
  agent: string;
  outcome: "pending" | "right" | "wrong";
};

type Settled = { claimId: number; agent: string; outcome: "right" | "wrong" };

const STORAGE_KEY = "clawback.seenSettled.v1";
const DEMO_EVENT = "clawback.theater.demo";

// External hook to fire a sample event so a judge can see the
// animation on demand. Anything that imports SettlementTheater can
// also import this and call it from a button.
export function fireDemoSettlement(payload: Settled) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail: payload }));
}

function readSeen(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function writeSeen(s: Set<number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s)));
  } catch {
    // ignore quota errors
  }
}

export default function SettlementTheater({ receipts }: { receipts: Receipt[] }) {
  const [active, setActive] = useState<Settled | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // First mount: seed the seen-set with every currently settled claim so
  // we do NOT fire the animation for events that already existed when
  // the visitor opened the page. Only NEW settlements during this session
  // trigger the theater.
  useEffect(() => {
    if (bootstrapped) return;
    const seen = readSeen();
    for (const r of receipts) {
      if (r.outcome === "right" || r.outcome === "wrong") seen.add(r.claimId);
    }
    writeSeen(seen);
    setBootstrapped(true);
  }, [bootstrapped, receipts]);

  // On every receipts change, check for a new settled claim that we
  // haven't seen yet. Fire the theater for the most recent unseen one,
  // mark it seen, auto-dismiss after the animation completes.
  useEffect(() => {
    if (!bootstrapped) return;
    const seen = readSeen();
    const fresh = receipts.find(
      (r) => (r.outcome === "right" || r.outcome === "wrong") && !seen.has(r.claimId),
    );
    if (!fresh) return;
    seen.add(fresh.claimId);
    writeSeen(seen);
    setActive({ claimId: fresh.claimId, agent: fresh.agent, outcome: fresh.outcome as "right" | "wrong" });
    const t = setTimeout(() => setActive(null), 4200);
    return () => clearTimeout(t);
  }, [receipts, bootstrapped]);

  // Listen for the manual-fire event so the Demo button (or any other
  // caller) can trigger the animation without needing a real on-chain
  // settlement to land. The demo event bypasses the seen-set so the
  // judge can fire it as many times as they want.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Settled | undefined;
      if (!detail) return;
      setActive(detail);
      const t = setTimeout(() => setActive(null), 4200);
      return () => clearTimeout(t);
    };
    window.addEventListener(DEMO_EVENT, handler);
    return () => window.removeEventListener(DEMO_EVENT, handler);
  }, []);

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center"
      aria-live="polite"
    >
      {/* Backdrop fade */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        style={{ animation: "theater-backdrop 4.2s ease-out forwards" }}
      />

      {/* Particles layer */}
      {active.outcome === "right" ? <ConfettiBurst /> : <RefundBurst />}

      {/* Headline card */}
      <div
        className="relative z-10 rounded-3xl border px-8 py-7 md:px-14 md:py-10 shadow-[0_40px_120px_rgba(0,0,0,0.6)] max-w-[90vw]"
        style={{
          background:
            active.outcome === "right"
              ? "linear-gradient(160deg,rgba(120,53,15,0.65),rgba(10,10,10,0.85))"
              : "linear-gradient(160deg,rgba(6,78,59,0.55),rgba(10,10,10,0.85))",
          borderColor: active.outcome === "right" ? "rgba(252,211,77,0.55)" : "rgba(110,231,183,0.55)",
          animation: "theater-card 4.2s cubic-bezier(0.22,0.61,0.36,1) forwards",
        }}
      >
        <div
          className="text-[10px] md:text-xs uppercase tracking-[0.32em] text-center mb-3"
          style={{ color: active.outcome === "right" ? "#fcd34d" : "#6ee7b7" }}
        >
          {active.outcome === "right" ? "BOT WAS RIGHT" : "BOT WAS WRONG"}
        </div>
        <div className="text-3xl md:text-5xl font-black tracking-tight text-neutral-50 text-center">
          {active.agent} <span className="text-neutral-500 font-bold">·</span> claim #{active.claimId}
        </div>
        <div className="mt-3 text-sm md:text-base text-center text-neutral-300">
          {active.outcome === "right"
            ? "kept its collateral and earned the customer's fee"
            : "customer is being refunded with a bonus from the bot's collateral"}
        </div>
      </div>

      <style>{`
        @keyframes theater-backdrop {
          0% { opacity: 0; }
          12% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes theater-card {
          0% { opacity: 0; transform: scale(0.85) translateY(20px); }
          15% { opacity: 1; transform: scale(1.02) translateY(0); }
          25% { transform: scale(1) translateY(0); }
          80% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.96) translateY(-12px); }
        }
        @keyframes confetti-fall {
          0% { transform: translate3d(0, -20vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--dx), 110vh, 0) rotate(var(--rot)); opacity: 0; }
        }
        @keyframes refund-rise {
          0% { transform: translate3d(0, 30vh, 0) scale(0.6); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translate3d(var(--dx), -120vh, 0) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ConfettiBurst() {
  const COLORS = ["#fcd34d", "#fbbf24", "#f59e0b", "#fde68a", "#fef3c7"];
  const N = 64;
  const pieces = Array.from({ length: N }, (_, i) => {
    const left = (i / N) * 100 + (Math.random() - 0.5) * 4;
    const dx = (Math.random() - 0.5) * 240;
    const rot = (Math.random() * 720 - 360) | 0;
    const delay = Math.random() * 0.6;
    const dur = 2.4 + Math.random() * 1.4;
    const color = COLORS[i % COLORS.length];
    const w = 5 + Math.random() * 5;
    const h = 8 + Math.random() * 10;
    return { left, dx, rot, delay, dur, color, w, h, key: i };
  });
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p) => (
        <span
          key={p.key}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: p.w,
            height: p.h,
            background: p.color,
            borderRadius: 2,
            // CSS custom properties consumed by the keyframes
            ["--dx" as string]: `${p.dx}px`,
            ["--rot" as string]: `${p.rot}deg`,
            animation: `confetti-fall ${p.dur}s cubic-bezier(0.2,0.7,0.3,1) ${p.delay}s forwards`,
            boxShadow: `0 0 8px ${p.color}55`,
          }}
        />
      ))}
    </div>
  );
}

function RefundBurst() {
  const COLORS = ["#6ee7b7", "#34d399", "#10b981", "#a7f3d0"];
  const N = 28;
  const pieces = Array.from({ length: N }, (_, i) => {
    const left = (i / N) * 100 + (Math.random() - 0.5) * 6;
    const dx = (Math.random() - 0.5) * 160;
    const delay = Math.random() * 0.7;
    const dur = 2.8 + Math.random() * 1.2;
    const color = COLORS[i % COLORS.length];
    return { left, dx, delay, dur, color, key: i };
  });
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((p) => (
        <span
          key={p.key}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            bottom: 0,
            width: 14,
            height: 14,
            color: p.color,
            font: "900 13px ui-sans-serif, system-ui",
            display: "grid",
            placeItems: "center",
            ["--dx" as string]: `${p.dx}px`,
            animation: `refund-rise ${p.dur}s ease-in ${p.delay}s forwards`,
            textShadow: `0 0 12px ${p.color}88`,
          }}
        >
          $
        </span>
      ))}
    </div>
  );
}
