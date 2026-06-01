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
}: {
  receipts: Receipt[];
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

  if (!active) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] pointer-events-none max-w-[calc(100vw-2rem)] md:bottom-6 md:right-6"
      aria-live="polite"
    >
      <div
        key={`${active.outcome}-${active.claimId}`}
        className="relative z-10 max-w-sm rounded-3xl border px-5 py-5 shadow-[0_30px_90px_rgba(0,0,0,0.5)] md:max-w-md md:px-7"
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
          className="mb-2 text-[10px] uppercase tracking-[0.28em]"
          style={{ color: active.outcome === "right" ? "#fcd34d" : "#6ee7b7" }}
        >
          {active.outcome === "right" ? "BOT WAS RIGHT" : "BOT WAS WRONG"}
        </div>
        <div className="text-2xl font-black tracking-tight text-neutral-50 md:text-3xl">
          {active.agent} <span className="text-neutral-500 font-bold">·</span> claim #{active.claimId}
        </div>
        <div className="mt-2 text-sm text-neutral-300">
          {active.outcome === "right"
            ? "Agent was right. It kept the customer fee."
            : "Agent was wrong. The customer got paid back from the stake."}
        </div>
      </div>

      <style>{`
        @keyframes theater-card {
          0% { opacity: 0; transform: translateY(14px); }
          14% { opacity: 1; transform: translateY(0); }
          84% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(10px); }
        }
      `}</style>
    </div>
  );
}
