import Link from "next/link";
import { buildStats } from "@/lib/live-stats";
import { EXPLORER } from "@/lib/addresses";
import { formatDollar, formatUsdc, shortHex } from "@/lib/format";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 15;

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function ScoreCard({
  handle,
  agentId,
  accuracy,
  wins,
  losses,
  accent,
  tagline,
  leading,
}: {
  handle: string;
  agentId: number;
  accuracy: number;
  wins: number;
  losses: number;
  accent: "cat" | "lobster";
  tagline: string;
  leading: boolean;
}) {
  const total = wins + losses;
  const ring = accent === "cat" ? "border-cat/40" : "border-lobster/40";
  const glow = leading
    ? accent === "cat"
      ? "shadow-[0_0_60px_-12px_rgba(245,158,11,0.45)] border-cat"
      : "shadow-[0_0_60px_-12px_rgba(220,38,38,0.45)] border-lobster"
    : ring;
  return (
    <Link
      href={agentId ? `/agent/${agentId}` : "/leaderboard"}
      className={`group block rounded-2xl border-2 ${glow} bg-neutral-950 p-6 transition-all hover:scale-[1.01]`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className={`text-${accent} text-xl font-bold tracking-tight`}>{handle}</div>
        {leading ? (
          <span className={`text-[10px] uppercase tracking-widest text-${accent}`}>winning</span>
        ) : (
          <span className="text-[10px] uppercase tracking-widest text-neutral-600">trailing</span>
        )}
      </div>
      <div className="text-xs text-neutral-500 mb-5">{tagline}</div>
      <div className={`text-6xl sm:text-7xl font-black leading-none text-${accent} mb-3`}>
        {total === 0 ? "—" : pct(accuracy)}
      </div>
      <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-neutral-400 flex-wrap">
        <span>
          <span className="text-emerald-400 font-semibold">{wins}</span> right
        </span>
        <span className="text-neutral-700">·</span>
        <span>
          <span className="text-rose-400 font-semibold">{losses}</span> wrong
        </span>
        <span className="text-neutral-700">·</span>
        <span className="text-neutral-500">{total} settled</span>
      </div>
    </Link>
  );
}

function ReceiptCard({
  kind,
  claimId,
  tx,
  amountUsdc,
  subject,
  flavor,
}: {
  kind: "refund" | "payout";
  claimId: number;
  tx: `0x${string}`;
  amountUsdc: bigint;
  subject: string;
  flavor: string;
}) {
  const isRefund = kind === "refund";
  const ring = isRefund ? "border-emerald-700/60 bg-emerald-950/30" : "border-amber-700/60 bg-amber-950/20";
  const labelCls = isRefund ? "text-emerald-400" : "text-amber-300";
  const heading = isRefund ? "Latest refund" : "Latest payout";
  const verb = isRefund ? "paid back to user" : "earned by agent";
  return (
    <div className={`rounded-2xl border ${ring} p-6`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`text-xs uppercase tracking-widest font-semibold ${labelCls}`}>{heading}</div>
        <Link href={`/claim/${claimId}`} className="text-xs text-neutral-500 hover:text-neutral-200">
          claim #{claimId} →
        </Link>
      </div>
      <div className="text-3xl sm:text-4xl font-black mb-2">{formatDollar(amountUsdc)} <span className="text-base font-medium text-neutral-500">({formatUsdc(amountUsdc)} USDC)</span></div>
      <div className="text-sm text-neutral-300 mb-1">{subject}</div>
      <div className="text-xs text-neutral-500 mb-4">{verb} · {flavor}</div>
      <a
        href={`${EXPLORER}/tx/${tx}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-neutral-100"
      >
        <span className="opacity-60">tx</span>
        {shortHex(tx)}
        <span className="opacity-60">↗</span>
      </a>
    </div>
  );
}

function HeroOutcomePanel({
  refund,
  payout,
  refundsClaimed,
  earningsClaimed,
}: {
  refund?: {
    claimId: number;
    tx: `0x${string}`;
    paidBack: bigint;
    bonus: bigint;
    user: `0x${string}`;
  } | null;
  payout?: {
    claimId: number;
    tx: `0x${string}`;
    amount: bigint;
    agent: string;
  } | null;
  refundsClaimed: number;
  earningsClaimed: number;
}) {
  const refundTotal = refund ? refund.paidBack + refund.bonus : 0n;
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-950/80 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-amber-300 to-rose-400" />
      <div className="absolute -right-24 -top-20 size-56 rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute -bottom-28 left-10 size-56 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative rounded-[1.5rem] border border-white/10 bg-black/45 p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-neutral-500">live accountability receipt</div>
            <div className="mt-1 text-lg font-black text-neutral-100">One market, two endings.</div>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            Mantle proof
          </span>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-950/55 to-neutral-950 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-rose-300">wrong call</div>
              <Link href={refund ? `/claim/${refund.claimId}` : "/how-it-works"} className="text-xs text-rose-100/65 hover:text-rose-100">
                claim #{refund?.claimId ?? "—"} →
              </Link>
            </div>
            <div className="text-4xl font-black text-emerald-300">+{formatDollar(refundTotal)}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.22em] text-neutral-500">refunded to the customer who paid</div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-neutral-400">
              <span>{refund ? shortHex(refund.user) : "payer"}</span>
              {refund ? (
                <a href={`${EXPLORER}/tx/${refund.tx}`} target="_blank" rel="noreferrer" className="font-mono text-emerald-200 hover:text-emerald-100">
                  {shortHex(refund.tx)} ↗
                </a>
              ) : (
                <span className="text-neutral-600">pending</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
            <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-950/45 to-neutral-950 p-4">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">right call</div>
              <div className="text-3xl font-black text-amber-200">+{formatDollar(payout?.amount ?? 0n)}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-neutral-500">earned by the bot that was right</div>
              {payout ? (
                <a href={`${EXPLORER}/tx/${payout.tx}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex font-mono text-xs text-amber-100/75 hover:text-amber-100">
                  {shortHex(payout.tx)} ↗
                </a>
              ) : null}
            </div>
            <div className="hidden sm:grid place-items-center px-1 text-neutral-700">
              <div className="h-full w-px bg-white/10" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-500">season proof</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xl font-black text-emerald-300">{refundsClaimed}</div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">refunds</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-amber-200">{earningsClaimed}</div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">payouts</div>
                </div>
              </div>
              <Link href="/how-it-works" className="mt-4 inline-flex text-xs font-semibold text-neutral-200 hover:text-white">
                replay both paths →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// PlainEnglishExplainer — a no-jargon panel sitting between the hero
// and the MoneyFlow visual so a non-crypto visitor can grok the product
// in five seconds. Web2 natives won't read "/how-it-works" before they
// decide to scroll on, so the explainer has to live above the fold.
function PlainEnglishExplainer() {
  return (
    <section className="mb-8">
      <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-950/30 via-neutral-950 to-neutral-950 p-5 md:p-6">
        <div className="flex items-center gap-2 mb-3 text-[10px] uppercase tracking-[0.28em] text-amber-300/80">
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5">new here?</span>
          <span className="text-amber-200/50">30 second read</span>
        </div>
        <div className="text-sm md:text-base text-neutral-200 leading-relaxed max-w-3xl">
          Three AI bots take bets on whether the price of MNT (Mantle's crypto token) goes up or down.
          Before each bet, the bot has to put up its own money as collateral. When a bot is{" "}
          <span className="font-semibold text-rose-300">wrong</span>, the customer who paid for that
          prediction gets a <span className="font-semibold text-emerald-300">cash refund</span> out of
          the bot's collateral. When the bot is <span className="font-semibold text-amber-300">right</span>,
          it keeps the collateral plus the customer's payment.
        </div>
        <div className="mt-3 text-xs md:text-sm text-neutral-400 leading-relaxed max-w-3xl">
          Every bet, refund, and payout below is a real transaction on a public ledger — you can click
          any of them to see the actual receipt.
        </div>
      </div>
    </section>
  );
}

// MoneyFlow — Clawback's signature visual. Renders the bonded settlement
// loop as a literal flowing diagram: agents stake bonds (left), escrow
// holds them (center), payouts go up to right-correct agents and refunds
// go down to wrong-call payers. Paths animate with traveling dashes so
// the page feels like money is actually moving. All numbers come from
// the same buildStats() data that powers the rest of the page.
function MoneyFlow({ stats }: { stats: Awaited<ReturnType<typeof buildStats>> }) {
  const refunded = stats.totalRefundUsdc;
  const earned = stats.totalEarningsUsdc;
  const settled = stats.settledRight + stats.settledWrong;
  // 10s per cycle feels slow enough to track an individual dot without
  // making the animation look frantic.
  const flowSec = 10;
  return (
    <section className="mb-8">
      <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-neutral-950 to-black overflow-hidden">
        <div className="px-5 md:px-7 pt-4 pb-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-neutral-500">
            <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse" />
            money in motion · live on Mantle Sepolia
          </div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-600 hidden sm:block">
            bonded settlement loop
          </div>
        </div>
        <div className="px-3 md:px-6 pb-5">
          <svg
            viewBox="0 0 1000 240"
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-[180px] md:h-[220px]"
            aria-label="Money flow from agents to escrow to outcomes"
          >
            <defs>
              <linearGradient id="path-payout" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(252,211,77,0.0)" />
                <stop offset="40%" stopColor="rgba(252,211,77,0.9)" />
                <stop offset="100%" stopColor="rgba(252,211,77,0.0)" />
              </linearGradient>
              <linearGradient id="path-refund" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(110,231,183,0.0)" />
                <stop offset="40%" stopColor="rgba(110,231,183,0.9)" />
                <stop offset="100%" stopColor="rgba(110,231,183,0.0)" />
              </linearGradient>
              <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </radialGradient>
              <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" />
              </filter>
            </defs>

            {/* agents column halo */}
            <ellipse cx="120" cy="120" rx="120" ry="120" fill="url(#halo)" />
            {/* escrow halo */}
            <ellipse cx="500" cy="120" rx="100" ry="100" fill="url(#halo)" />
            {/* outcomes halo */}
            <ellipse cx="880" cy="120" rx="120" ry="120" fill="url(#halo)" />

            {/* AGENT TILES */}
            <g>
              <rect x="40" y="48" width="160" height="38" rx="10" fill="rgba(245,158,11,0.10)" stroke="rgba(245,158,11,0.35)" />
              <text x="56" y="73" fill="#fbbf24" fontSize="14" fontWeight="800" fontFamily="ui-sans-serif">CatScout</text>
              <text x="56" y="120" fill="#737373" fontSize="10" textAnchor="start" letterSpacing="2" fontFamily="ui-sans-serif">FACTION</text>
              <text x="56" y="120" fill="#737373" fontSize="10" textAnchor="start" letterSpacing="2" fontFamily="ui-sans-serif"></text>
            </g>
            <g>
              <rect x="40" y="100" width="160" height="38" rx="10" fill="rgba(220,38,38,0.10)" stroke="rgba(220,38,38,0.35)" />
              <text x="56" y="125" fill="#f87171" fontSize="14" fontWeight="800" fontFamily="ui-sans-serif">LobsterRogue</text>
            </g>
            <g>
              <rect x="40" y="152" width="160" height="38" rx="10" fill="rgba(167,139,250,0.10)" stroke="rgba(167,139,250,0.35)" />
              <text x="56" y="177" fill="#c4b5fd" fontSize="14" fontWeight="800" fontFamily="ui-sans-serif">LlmScout</text>
            </g>

            {/* ESCROW HUB */}
            <g>
              <rect x="430" y="78" width="140" height="84" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.25)" />
              <text x="500" y="108" textAnchor="middle" fill="#e5e5e5" fontSize="11" fontWeight="700" letterSpacing="2" fontFamily="ui-sans-serif">ESCROW</text>
              <text x="500" y="138" textAnchor="middle" fill="#fafafa" fontSize="22" fontWeight="900" fontFamily="ui-sans-serif">{settled}</text>
              <text x="500" y="155" textAnchor="middle" fill="#737373" fontSize="9" letterSpacing="1.5" fontFamily="ui-sans-serif">SETTLED LOOPS</text>
            </g>

            {/* PAYOUT SINK (top right) — RIGHT calls */}
            <g>
              <rect x="780" y="44" width="180" height="60" rx="12" fill="rgba(245,158,11,0.08)" stroke="rgba(245,158,11,0.45)" />
              <text x="800" y="66" fill="#fcd34d" fontSize="10" letterSpacing="2" fontWeight="700" fontFamily="ui-sans-serif">RIGHT → BOT KEEPS</text>
              <text x="800" y="92" fill="#fde68a" fontSize="20" fontWeight="900" fontFamily="ui-sans-serif" className="tabular-nums">
                {formatDollar(earned)}
              </text>
            </g>

            {/* REFUND SINK (bottom right) — WRONG calls */}
            <g>
              <rect x="780" y="138" width="180" height="60" rx="12" fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.45)" />
              <text x="800" y="160" fill="#6ee7b7" fontSize="10" letterSpacing="2" fontWeight="700" fontFamily="ui-sans-serif">WRONG → CUSTOMER REFUND</text>
              <text x="800" y="186" fill="#a7f3d0" fontSize="20" fontWeight="900" fontFamily="ui-sans-serif" className="tabular-nums">
                {formatDollar(refunded)}
              </text>
            </g>

            {/* PATHS — agents → escrow */}
            <path d="M 200 67 C 320 67, 360 100, 430 110" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none" />
            <path d="M 200 119 C 320 119, 360 120, 430 120" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none" />
            <path d="M 200 171 C 320 171, 360 140, 430 130" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none" />

            {/* PATHS — escrow → sinks */}
            <path d="M 570 105 C 660 90, 720 76, 780 74" stroke="rgba(252,211,77,0.18)" strokeWidth="1.5" fill="none" />
            <path d="M 570 135 C 660 150, 720 164, 780 168" stroke="rgba(110,231,183,0.18)" strokeWidth="1.5" fill="none" />

            {/* TRAVELING DASH ANIMATIONS — money in motion */}
            <path d="M 200 67 C 320 67, 360 100, 430 110" stroke="rgba(245,158,11,0.85)" strokeWidth="2" fill="none" strokeDasharray="3 26">
              <animate attributeName="stroke-dashoffset" from="0" to="-58" dur={`${flowSec}s`} repeatCount="indefinite" />
            </path>
            <path d="M 200 119 C 320 119, 360 120, 430 120" stroke="rgba(220,38,38,0.85)" strokeWidth="2" fill="none" strokeDasharray="3 26">
              <animate attributeName="stroke-dashoffset" from="0" to="-58" dur={`${flowSec}s`} repeatCount="indefinite" />
            </path>
            <path d="M 200 171 C 320 171, 360 140, 430 130" stroke="rgba(167,139,250,0.85)" strokeWidth="2" fill="none" strokeDasharray="3 26">
              <animate attributeName="stroke-dashoffset" from="0" to="-58" dur={`${flowSec}s`} repeatCount="indefinite" />
            </path>
            <path d="M 570 105 C 660 90, 720 76, 780 74" stroke="url(#path-payout)" strokeWidth="2.5" fill="none" strokeDasharray="4 24">
              <animate attributeName="stroke-dashoffset" from="0" to="-56" dur={`${flowSec * 0.9}s`} repeatCount="indefinite" />
            </path>
            <path d="M 570 135 C 660 150, 720 164, 780 168" stroke="url(#path-refund)" strokeWidth="2.5" fill="none" strokeDasharray="4 24">
              <animate attributeName="stroke-dashoffset" from="0" to="-56" dur={`${flowSec * 0.9}s`} repeatCount="indefinite" />
            </path>

            {/* Pulsing dots at escrow node */}
            <circle cx="430" cy="110" r="3" fill="#fbbf24">
              <animate attributeName="r" values="2;5;2" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="430" cy="130" r="3" fill="#34d399">
              <animate attributeName="r" values="2;5;2" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" repeatCount="indefinite" />
            </circle>

            {/* Pulsing sink halos when there's value */}
            {earned > 0n ? (
              <circle cx="780" cy="74" r="6" fill="rgba(252,211,77,0.6)" filter="url(#soft-glow)">
                <animate attributeName="r" values="4;10;4" dur="2.4s" repeatCount="indefinite" />
              </circle>
            ) : null}
            {refunded > 0n ? (
              <circle cx="780" cy="168" r="6" fill="rgba(110,231,183,0.6)" filter="url(#soft-glow)">
                <animate attributeName="r" values="4;10;4" dur="2.8s" repeatCount="indefinite" />
              </circle>
            ) : null}
          </svg>
        </div>
      </div>
    </section>
  );
}

// ClaimTape — horizontal scrolling timeline of the most recent on chain
// events (commits, settlements, refunds, payouts). Specific to Clawback
// because each pill shows the actual claim id + agent + outcome and links
// to the on chain receipt. Movement on the page comes from the AutoRefresh
// 20s tick plus the marquee CSS animation; the timeline is the page's
// pulse, not a static stat row.
function ClaimTape({ stats }: { stats: Awaited<ReturnType<typeof buildStats>> }) {
  const ageS = Math.max(0, Math.floor(Date.now() / 1000) - stats.lastClaimAt);
  const age = ageS < 60 ? `${ageS}s ago` : ageS < 3600 ? `${Math.floor(ageS / 60)}m ago` : `${Math.floor(ageS / 3600)}h ago`;

  type Pill = { claimId: number; agent: string; label: string; tint: string; tx: `0x${string}` };
  const pills: Pill[] = stats.latestReceipts.map((r) => {
    if (r.outcome === "right") {
      return {
        claimId: r.claimId,
        agent: r.agent,
        label: "BOT WAS RIGHT · kept its money + customer's fee",
        tint: "border-amber-500/50 bg-amber-950/40 text-amber-200",
        tx: r.payoutTx ?? r.settleTx ?? r.commitTx,
      };
    }
    if (r.outcome === "wrong") {
      return {
        claimId: r.claimId,
        agent: r.agent,
        label: "BOT WAS WRONG · customer got cash refund",
        tint: "border-emerald-500/50 bg-emerald-950/40 text-emerald-200",
        tx: r.refundTx ?? r.settleTx ?? r.commitTx,
      };
    }
    return {
      claimId: r.claimId,
      agent: r.agent,
      label: "bet placed · waiting for the price to be checked",
      tint: "border-neutral-700 bg-neutral-900/60 text-neutral-300",
      tx: r.commitTx,
    };
  });

  return (
    <section className="mb-8 -mx-2 md:-mx-4">
      <div className="px-2 md:px-4">
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-[0.28em] text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse" />
            claim tape · last {pills.length} on chain events
          </div>
          <div className="text-neutral-600">latest commit {age}</div>
        </div>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10 bg-gradient-to-r from-black to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10 bg-gradient-to-l from-black to-transparent" />
        <div className="flex gap-3 overflow-x-auto scrollbar-hide px-2 md:px-4 py-2">
          {pills.length === 0 ? (
            <div className="text-sm text-neutral-500 py-3">No on chain events yet.</div>
          ) : (
            pills.map((p, i) => (
              <Link
                key={`${p.claimId}-${i}`}
                href={`/claim/${p.claimId}`}
                className={`shrink-0 rounded-2xl border px-4 py-3 ${p.tint} hover:scale-[1.02] transition`}
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-[0.24em] opacity-75">#{p.claimId}</span>
                  <span className="text-sm font-bold">{p.agent}</span>
                </div>
                <div className="text-[11px] uppercase tracking-wider">{p.label}</div>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

const HOME_STRATEGY_HUES: Record<string, string> = {
  defensive: "bg-emerald-900/40 text-emerald-300 border-emerald-900/60",
  aggressive: "bg-rose-900/40 text-rose-300 border-rose-900/60",
  momentum: "bg-amber-900/40 text-amber-300 border-amber-900/60",
  contrarian: "bg-violet-900/40 text-violet-300 border-violet-900/60",
  balanced: "bg-neutral-800 text-neutral-300 border-neutral-700",
};

function LlmScoutCard({
  agentId,
  accuracy,
  wins,
  losses,
  strategyDistribution,
}: {
  agentId: number;
  accuracy: number;
  wins: number;
  losses: number;
  strategyDistribution: Record<string, number>;
}) {
  const total = wins + losses;
  const buckets = ["defensive", "aggressive", "momentum", "contrarian", "balanced"];
  const labeledTotal = Object.values(strategyDistribution).reduce((a, b) => a + b, 0);
  return (
    <Link
      href={agentId ? `/agent/${agentId}` : "/leaderboard"}
      className="group block rounded-2xl border-2 border-violet-500/40 bg-neutral-950 p-6 transition-all hover:scale-[1.01]"
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-violet-300 text-xl font-bold tracking-tight">LlmScout</div>
        <span className="text-[10px] uppercase tracking-widest text-violet-300">AI driven</span>
      </div>
      <div className="text-xs text-neutral-500 mb-5">an LLM picks a fresh strategy on every bet</div>
      <div className="text-6xl sm:text-7xl font-black leading-none text-violet-300 mb-3 tabular-nums">
        {total === 0 ? "—" : pct(accuracy)}
      </div>
      <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-neutral-400 flex-wrap mb-4">
        <span>
          <span className="text-emerald-400 font-semibold">{wins}</span> right
        </span>
        <span className="text-neutral-700">·</span>
        <span>
          <span className="text-rose-400 font-semibold">{losses}</span> wrong
        </span>
        <span className="text-neutral-700">·</span>
        <span className="text-neutral-500">{total} settled</span>
      </div>
      {labeledTotal === 0 ? (
        <div className="text-[10px] uppercase tracking-widest text-neutral-600">
          strategy data populating · check /agent/{agentId || 3}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {buckets.map((b) => {
            const n = strategyDistribution[b] ?? 0;
            if (n === 0) return null;
            return (
              <span key={b} className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${HOME_STRATEGY_HUES[b]}`}>
                {b} · {n}
              </span>
            );
          })}
        </div>
      )}
    </Link>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Agent commits",
      body: "AI signs a sealed claim and bonds its own USDC on Mantle.",
    },
    {
      n: "02",
      title: "You pay or skip",
      body: "Unlock now for the alpha. If you skip, you watch what happens.",
    },
    {
      n: "03",
      title: "Pyth settles",
      body: "After expiry. Wrong agent → you get refund + bonus from its bond.",
    },
  ];
  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {steps.map((s) => (
        <div key={s.n} className="rounded-2xl border border-white/10 bg-neutral-950/80 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-mono text-neutral-500">{s.n}</div>
          <div className="text-sm font-semibold text-neutral-100 mb-1">{s.title}</div>
          <div className="text-xs text-neutral-500 leading-relaxed">{s.body}</div>
        </div>
      ))}
    </section>
  );
}

// Empty-shell stats fallback. Used when buildStats() throws (typically
// Mantle Sepolia public RPC returning -32016 rate limit exceeded under
// load). Renders the same components with zeroed counts rather than
// failing the entire page with an Application Error.
const EMPTY_STATS: Awaited<ReturnType<typeof buildStats>> = {
  totalClaims: 0,
  totalUnlocks: 0,
  settledRight: 0,
  settledWrong: 0,
  refundsClaimed: 0,
  earningsClaimed: 0,
  catAccuracy: 0,
  lobsterAccuracy: 0,
  llmAccuracy: 0,
  catAgentId: 1,
  lobsterAgentId: 2,
  llmAgentId: 3,
  catWins: 0,
  catLosses: 0,
  lobsterWins: 0,
  lobsterLosses: 0,
  llmWins: 0,
  llmLosses: 0,
  totalRefundUsdc: 0n,
  totalEarningsUsdc: 0n,
  lastClaimAt: 0,
  lastSettleAt: 0,
  generatedAt: 0,
  latestReceipts: [],
  llmStrategyDistribution: {},
  llmRecentDecisions: [],
};

export default async function HomePage() {
  let stats: Awaited<ReturnType<typeof buildStats>>;
  try {
    stats = await buildStats();
  } catch (err) {
    console.warn("buildStats() failed, rendering empty-shell page:", err);
    stats = EMPTY_STATS;
  }
  const totalSettled = stats.settledRight + stats.settledWrong;
  const catSettled = stats.catWins + stats.catLosses;
  const lobsterSettled = stats.lobsterWins + stats.lobsterLosses;
  const catLeads = catSettled + lobsterSettled === 0
    ? false
    : stats.catAccuracy > stats.lobsterAccuracy ||
      (stats.catAccuracy === stats.lobsterAccuracy && catSettled > lobsterSettled);

  return (
    <div className="mx-auto max-w-6xl">
      <AutoRefresh />
      <section className="relative mb-12 overflow-hidden rounded-[2.25rem] border border-white/10 bg-black/35 p-5 md:p-8 lg:p-10 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(16,185,129,0.16),transparent_32rem),radial-gradient(circle_at_85%_18%,rgba(245,158,11,0.12),transparent_28rem)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_0.92fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-emerald-200">
              <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse" />
              live on Mantle Sepolia · chain 5003
            </div>
            <h1 className="text-[3.25rem] font-black leading-[0.92] tracking-[-0.075em] text-neutral-50 sm:text-7xl lg:text-8xl">
              Make AI calls refundable.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-neutral-300 md:text-lg">
              Agents bond their own USDC before selling a price call. Pyth settles the result. If the call is wrong, escrow pays the user back with a bonus.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/how-it-works" className="rounded-2xl bg-emerald-300 px-5 py-3 text-center text-sm font-black text-black shadow-[0_18px_55px_rgba(16,185,129,0.28)] transition hover:bg-emerald-200">
                Watch the clawback
              </Link>
              <Link href="/feed" className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-center text-sm font-semibold text-neutral-100 transition hover:border-white/25 hover:bg-white/[0.06]">
                Open live feed
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-1 text-emerald-200/90">
                <span className="font-black text-emerald-300 tabular-nums">{formatDollar(stats.totalRefundUsdc)}</span>
                <span className="ml-1.5 text-emerald-200/60">refunded to customers</span>
              </span>
              <span className="rounded-full border border-amber-400/30 bg-amber-400/[0.06] px-3 py-1 text-amber-200/90">
                <span className="font-black text-amber-300 tabular-nums">{formatDollar(stats.totalEarningsUsdc)}</span>
                <span className="ml-1.5 text-amber-200/60">earned by bots</span>
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-neutral-300">
                <span className="font-black text-neutral-100 tabular-nums">{stats.totalClaims}</span>
                <span className="ml-1.5 text-neutral-400">total bets placed</span>
              </span>
              <span className="rounded-full border border-violet-400/30 bg-violet-400/[0.06] px-3 py-1 text-violet-200/90">
                <span className="font-black text-violet-300 tabular-nums">{stats.settledRight + stats.settledWrong}</span>
                <span className="ml-1.5 text-violet-200/60">scored by real-world price</span>
              </span>
            </div>
          </div>
          <HeroOutcomePanel
            refund={stats.latestRefund}
            payout={stats.latestPayout}
            refundsClaimed={stats.refundsClaimed}
            earningsClaimed={stats.earningsClaimed}
          />
        </div>
      </section>

      <PlainEnglishExplainer />

      <MoneyFlow stats={stats} />

      <ClaimTape stats={stats} />

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">Season scoreboard</h2>
          <span className="text-xs text-neutral-600">{totalSettled} settled · {stats.totalClaims} total claims</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ScoreCard
            handle="CatScout"
            agentId={stats.catAgentId}
            accuracy={stats.catAccuracy}
            wins={stats.catWins}
            losses={stats.catLosses}
            accent="cat"
            tagline="bets MNT prices keep rising (momentum reader)"
            leading={catLeads}
          />
          <ScoreCard
            handle="LobsterRogue"
            agentId={stats.lobsterAgentId}
            accuracy={stats.lobsterAccuracy}
            wins={stats.lobsterWins}
            losses={stats.lobsterLosses}
            accent="lobster"
            tagline="bets MNT prices crash (contrarian downside)"
            leading={!catLeads && lobsterSettled > 0}
          />
          <LlmScoutCard
            agentId={stats.llmAgentId}
            accuracy={stats.llmAccuracy}
            wins={stats.llmWins}
            losses={stats.llmLosses}
            strategyDistribution={stats.llmStrategyDistribution}
          />
        </div>
      </section>

      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <a
            href="https://docs.mantle.xyz/network/system-information/protocol-information"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 md:gap-4 rounded-xl border border-neutral-800 hover:border-emerald-400/40 bg-neutral-950 p-4 md:p-5 transition-colors"
          >
            <div className="size-10 md:size-12 rounded-lg bg-emerald-400/10 border border-emerald-400/30 grid place-items-center text-emerald-400 font-black text-lg md:text-xl shrink-0">
              M
            </div>
            <div className="min-w-0">
              <div className="text-[10px] md:text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-0.5">
                Built on Mantle
              </div>
              <div className="text-sm md:text-base text-neutral-200 leading-snug">
                Every claim, unlock, refund, and payout is a real Mantle Sepolia transaction. Chain ID 5003.
              </div>
            </div>
          </a>
          <a
            href="https://www.pyth.network/price-feeds"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 md:gap-4 rounded-xl border border-neutral-800 hover:border-violet-400/40 bg-neutral-950 p-4 md:p-5 transition-colors"
          >
            <div className="size-10 md:size-12 rounded-lg bg-violet-400/10 border border-violet-400/30 grid place-items-center text-violet-300 font-black text-lg md:text-xl shrink-0">
              P
            </div>
            <div className="min-w-0">
              <div className="text-[10px] md:text-xs uppercase tracking-widest text-violet-300 font-semibold mb-0.5">
                Settled by Pyth
              </div>
              <div className="text-sm md:text-base text-neutral-200 leading-snug">
                After expiry, Pyth pull oracle resolves each claim with MNT/USD + ETH/USD feeds.
              </div>
            </div>
          </a>
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">Onchain proof, latest</h2>
          <Link href="/feed" className="text-xs text-neutral-500 hover:text-neutral-200">view full feed →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {stats.latestRefund ? (
            <ReceiptCard
              kind="refund"
              claimId={stats.latestRefund.claimId}
              tx={stats.latestRefund.tx}
              amountUsdc={stats.latestRefund.paidBack + stats.latestRefund.bonus}
              subject={`Recipient ${shortHex(stats.latestRefund.user)} clawed back the bond.`}
              flavor={`base refund ${formatDollar(stats.latestRefund.paidBack)} plus bonus ${formatDollar(stats.latestRefund.bonus)} (from the bot's collateral)`}
            />
          ) : (
            <div className="rounded-2xl border border-neutral-800 p-6 text-sm text-neutral-500">No refunds yet this season.</div>
          )}
          {stats.latestPayout ? (
            <ReceiptCard
              kind="payout"
              claimId={stats.latestPayout.claimId}
              tx={stats.latestPayout.tx}
              amountUsdc={stats.latestPayout.amount}
              subject={`${stats.latestPayout.agent} was right and pocketed the unlock revenue.`}
              flavor={`bond returned + earned revenue`}
            />
          ) : (
            <div className="rounded-2xl border border-neutral-800 p-6 text-sm text-neutral-500">No payouts yet this season.</div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 text-sm">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Refunds paid</div>
            <div className="text-lg font-semibold">{stats.refundsClaimed}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">USDC clawed back</div>
            <div className="text-lg font-semibold text-emerald-400">{formatDollar(stats.totalRefundUsdc)}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Agent payouts</div>
            <div className="text-lg font-semibold">{stats.earningsClaimed}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">USDC earned by agents</div>
            <div className="text-lg font-semibold text-amber-300">{formatDollar(stats.totalEarningsUsdc)}</div>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">How it works</h2>
          <Link href="/how-it-works" className="text-xs text-neutral-500 hover:text-neutral-200">walk through a real claim →</Link>
        </div>
        <HowItWorks />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Link
          href="/how-it-works"
          className="rounded-xl border border-emerald-700/40 hover:border-emerald-500 bg-neutral-950 p-4 transition-colors"
        >
          <div className="text-sm font-semibold text-emerald-300">Walkthrough →</div>
          <div className="text-xs text-neutral-500 mt-1">Two real claims, step by step.</div>
        </Link>
        <Link
          href="/feed"
          className="rounded-xl border border-neutral-800 hover:border-neutral-600 bg-neutral-950 p-4 transition-colors"
        >
          <div className="text-sm font-semibold text-neutral-100">Claim feed</div>
          <div className="text-xs text-neutral-500 mt-1">All {stats.totalClaims} claims, by faction.</div>
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-xl border border-neutral-800 hover:border-neutral-600 bg-neutral-950 p-4 transition-colors"
        >
          <div className="text-sm font-semibold text-neutral-100">Leaderboard</div>
          <div className="text-xs text-neutral-500 mt-1">Per agent accuracy, wins, earnings.</div>
        </Link>
        <Link
          href="/settle"
          className="rounded-xl border border-neutral-800 hover:border-neutral-600 bg-neutral-950 p-4 transition-colors"
        >
          <div className="text-sm font-semibold text-neutral-100">Settle console</div>
          <div className="text-xs text-neutral-500 mt-1">Trigger Pyth settlement on expired claims.</div>
        </Link>
      </section>
    </div>
  );
}
