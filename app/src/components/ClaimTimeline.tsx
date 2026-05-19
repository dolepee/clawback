import { EXPLORER } from "@/lib/addresses";
import type { TimelineEvent } from "@/lib/claim-timeline";
import { formatUsdc, shortHex } from "@/lib/format";

type Style = {
  dot: string;
  ring: string;
  title: string;
};

const STYLES: Record<TimelineEvent["kind"], Style> = {
  commit: { dot: "bg-emerald-400", ring: "ring-emerald-400/30", title: "text-emerald-200" },
  unlock: { dot: "bg-neutral-300", ring: "ring-neutral-300/30", title: "text-neutral-100" },
  settle: { dot: "bg-violet-400", ring: "ring-violet-400/30", title: "text-violet-200" },
  refund: { dot: "bg-emerald-400", ring: "ring-emerald-400/30", title: "text-emerald-200" },
  payout: { dot: "bg-amber-400", ring: "ring-amber-400/30", title: "text-amber-200" },
  reveal: { dot: "bg-sky-400", ring: "ring-sky-400/30", title: "text-sky-200" },
};

function fmtClock(at: number): string {
  if (!at) return "";
  return new Date(at * 1000).toISOString().replace("T", " ").slice(5, 16) + " UTC";
}

function fmtDelta(prev: number, curr: number): string | null {
  if (!prev || !curr || curr < prev) return null;
  const d = curr - prev;
  if (d < 60) return `+${d}s`;
  if (d < 3600) return `+${Math.round(d / 60)}m`;
  if (d < 86400) return `+${(d / 3600).toFixed(1)}h`;
  return `+${(d / 86400).toFixed(1)}d`;
}

function rowFor(ev: TimelineEvent): { title: string; body: string | null } {
  switch (ev.kind) {
    case "commit":
      return {
        title: "Committed",
        body: `bond ${formatUsdc(ev.bondAmount)} USDC · unlock ${formatUsdc(ev.unlockPrice)} USDC`,
      };
    case "unlock":
      return {
        title: "Unlock paid",
        body: `${shortHex(ev.payer)} paid ${formatUsdc(ev.amount)} USDC`,
      };
    case "settle":
      return {
        title: ev.agentRight ? "Pyth settled · RIGHT" : "Pyth settled · WRONG",
        body: ev.agentRight ? "agent kept the bond" : "agent bond slashed",
      };
    case "refund":
      return {
        title: "Refund claimed",
        body: `${shortHex(ev.user)} got ${formatUsdc(ev.paidBack)} + bonus ${formatUsdc(ev.bonus)} USDC`,
      };
    case "payout":
      return {
        title: "Agent earnings",
        body: `agent pocketed ${formatUsdc(ev.amount)} USDC`,
      };
    case "reveal":
      return { title: "Claim text revealed", body: "publicly readable on chain" };
  }
}

export default function ClaimTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <section className="border border-neutral-800 rounded-lg p-5 mb-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">Timeline</h2>
        <div className="text-sm text-neutral-500">No on-chain events indexed yet.</div>
      </section>
    );
  }

  const startAt = events[0].at;

  return (
    <section className="border border-neutral-800 rounded-lg p-5 md:p-6 mb-4">
      <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-5">Timeline</h2>
      <ol className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-neutral-800" aria-hidden />
        {events.map((ev, i) => {
          const s = STYLES[ev.kind];
          const r = rowFor(ev);
          const delta = i > 0 ? fmtDelta(events[i - 1].at, ev.at) : null;
          const fromStart = i > 0 ? fmtDelta(startAt, ev.at) : null;
          return (
            <li
              key={`${ev.kind}-${ev.tx}-${i}`}
              className="relative pl-7 pb-5 last:pb-0"
            >
              <span
                className={`absolute left-0 top-1.5 size-[15px] rounded-full ${s.dot} ring-4 ${s.ring}`}
                aria-hidden
              />
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className={`text-sm md:text-base font-semibold ${s.title}`}>{r.title}</div>
                <div className="text-[10px] md:text-xs text-neutral-500 font-mono tabular-nums">
                  {fmtClock(ev.at)}
                  {fromStart && <span className="ml-2 text-neutral-600">{fromStart}</span>}
                  {delta && delta !== fromStart && <span className="ml-2 text-neutral-700">({delta})</span>}
                </div>
              </div>
              {r.body && (
                <div className="text-xs md:text-sm text-neutral-400 mt-0.5">{r.body}</div>
              )}
              <a
                href={`${EXPLORER}/tx/${ev.tx}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-[11px] md:text-xs font-mono text-neutral-500 hover:text-neutral-200"
              >
                <span className="opacity-60">tx</span>
                {shortHex(ev.tx)}
                <span className="opacity-60">↗</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
