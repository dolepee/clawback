"use client";

import { useState } from "react";
import { fireDemoSettlement } from "./SettlementTheater";

type Receipt = { claimId: number; agent: string };

// DemoTheaterButton — a small affordance so a visitor can trigger the
// SettlementTheater animation on demand instead of waiting for a real
// on-chain settlement to fire it. Picks a real claim id from the live
// feed and rotates between RIGHT and WRONG outcomes on alternating
// clicks so the visitor sees both animations in one session.
export default function DemoTheaterButton({ samples }: { samples: Receipt[] }) {
  const [nextRight, setNextRight] = useState(true);
  if (samples.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        const pick = samples[Math.floor(Math.random() * samples.length)];
        fireDemoSettlement({
          claimId: pick.claimId,
          agent: pick.agent,
          outcome: nextRight ? "right" : "wrong",
        });
        setNextRight((v) => !v);
      }}
      className="rounded-full border border-amber-300/40 bg-amber-300/[0.08] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-amber-200 hover:bg-amber-300/[0.16] transition-colors"
    >
      preview a settlement →
    </button>
  );
}
