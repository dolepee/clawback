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

export default function SettlementTheater({
  receipts,
  autoplay,
}: {
  receipts: Receipt[];
  autoplay?: { wrong: Settled | null; right: Settled | null };
}) {
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

  // Once per session, autoplay the curated WRONG -> RIGHT pair so a judge sees the
  // refund-then-payout moment in the first seconds without waiting for a live settle.
  useEffect(() => {
    if (!autoplay || typeof window === "undefined") return;
    const KEY = "clawback.theaterAutoplayed.v1";
    try {
      if (window.sessionStorage.getItem(KEY)) return;
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    const seq: Settled[] = [];
    if (autoplay.wrong) seq.push(autoplay.wrong);
    if (autoplay.right) seq.push(autoplay.right);
    if (seq.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = 700;
    for (const s of seq) {
      const show = s;
      timers.push(setTimeout(() => setActive(show), at));
      at += 4400;
    }
    timers.push(setTimeout(() => setActive(null), at));
    return () => timers.forEach(clearTimeout);
  }, [autoplay]);

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

      <div
        key={`${active.outcome}-${active.claimId}`}
        className="relative z-10 max-w-[90vw] rounded-3xl border px-8 py-7 shadow-[0_40px_120px_rgba(0,0,0,0.6)] md:px-14 md:py-10"
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
            ? "Agent was right. It kept the customer fee."
            : "Agent was wrong. The customer got paid back from the stake."}
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
      `}</style>
    </div>
  );
}
