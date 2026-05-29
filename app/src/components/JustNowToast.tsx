"use client";

import { useEffect, useState } from "react";

type Receipt = { claimId: number; agent: string; outcome: "pending" | "right" | "wrong" };

const STORAGE_KEY = "clawback.seenCommits.v1";

function readSeen(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as number[]);
  } catch {
    return new Set();
  }
}
function writeSeen(s: Set<number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s)));
  } catch {
    // ignore
  }
}

// JustNowToast — corner pill that flashes when a fresh commit lands in
// the latestReceipts feed. Less dramatic than SettlementTheater; designed
// to fire on every cron cycle (every ~10 min during commit windows) so
// the page reads as continuously alive even when no claims are settling.
export default function JustNowToast({ receipts }: { receipts: Receipt[] }) {
  const [active, setActive] = useState<{ claimId: number; agent: string } | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (bootstrapped) return;
    const seen = readSeen();
    for (const r of receipts) seen.add(r.claimId);
    writeSeen(seen);
    setBootstrapped(true);
  }, [bootstrapped, receipts]);

  useEffect(() => {
    if (!bootstrapped) return;
    const seen = readSeen();
    const fresh = receipts.find((r) => !seen.has(r.claimId));
    if (!fresh) return;
    seen.add(fresh.claimId);
    writeSeen(seen);
    setActive({ claimId: fresh.claimId, agent: fresh.agent });
    const t = setTimeout(() => setActive(null), 3800);
    return () => clearTimeout(t);
  }, [receipts, bootstrapped]);

  if (!active) return null;

  return (
    <div
      className="fixed z-[55] left-1/2 top-3 md:top-5 -translate-x-1/2 pointer-events-none"
      aria-live="polite"
    >
      <div
        className="flex items-center gap-3 rounded-full border border-emerald-400/50 bg-emerald-950/85 backdrop-blur px-4 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        style={{ animation: "toast-fly 3.8s cubic-bezier(0.22,0.61,0.36,1) forwards" }}
      >
        <span className="size-2 rounded-full bg-emerald-300 animate-pulse" />
        <span className="text-[10px] uppercase tracking-[0.28em] text-emerald-300">just now</span>
        <span className="text-sm font-semibold text-neutral-100">
          {active.agent} placed bet #{active.claimId}
        </span>
      </div>
      <style>{`
        @keyframes toast-fly {
          0% { opacity: 0; transform: translate(-50%, -16px) scale(0.92); }
          10% { opacity: 1; transform: translate(-50%, 0) scale(1.02); }
          22% { transform: translate(-50%, 0) scale(1); }
          85% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -10px) scale(0.96); }
        }
      `}</style>
    </div>
  );
}
