"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  settled: boolean;
  expirySec: number;
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatRemaining(sec: number): string {
  if (sec <= 0) return "00:00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function ClaimLiveStatus({ settled, expirySec }: Props) {
  const router = useRouter();
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (settled) return;
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, [settled]);

  useEffect(() => {
    if (settled) return;
    const refresh = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(refresh);
  }, [settled, router]);

  if (settled) return null;

  const remaining = expirySec - now;
  const expired = remaining <= 0;

  if (expired) {
    return (
      <div className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-4 md:p-5 mb-5 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-amber-300 text-xs md:text-sm font-semibold uppercase tracking-widest mb-1">
            Ready to settle
          </div>
          <div className="text-amber-100 text-sm md:text-base">
            Expiry passed. Anyone can resolve via Pyth for a few wei of MNT.
          </div>
        </div>
        <Link
          href="/settle"
          className="text-xs md:text-sm px-4 py-2 rounded bg-amber-500 text-black font-semibold hover:bg-amber-400 whitespace-nowrap"
        >
          Open settlement console →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 md:p-5 mb-5 md:mb-6 flex items-center justify-between gap-3">
      <div>
        <div className="text-neutral-500 text-[10px] md:text-xs uppercase tracking-widest mb-1 flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live · settles in
        </div>
        <div className="text-2xl md:text-3xl font-mono font-bold text-neutral-100 tabular-nums">
          {formatRemaining(remaining)}
        </div>
      </div>
      <div className="text-right text-[10px] md:text-xs text-neutral-500 leading-relaxed max-w-[40%]">
        Page auto-refreshes.<br />
        Pyth resolves at expiry.
      </div>
    </div>
  );
}
