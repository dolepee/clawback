import Link from "next/link";
import { buildStats } from "@/lib/live-stats";
import { EXPLORER } from "@/lib/addresses";
import { formatUsdc, shortHex } from "@/lib/format";
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
      <div className="text-3xl sm:text-4xl font-black mb-2">{formatUsdc(amountUsdc)} <span className="text-base font-medium text-neutral-500">USDC</span></div>
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
            <div className="text-4xl font-black text-emerald-300">+{formatUsdc(refundTotal)}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.22em] text-neutral-500">USDC returned to payer</div>
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
              <div className="text-3xl font-black text-amber-200">+{formatUsdc(payout?.amount ?? 0n)}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-neutral-500">USDC earned by agent</div>
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

export default async function HomePage() {
  const stats = await buildStats();
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
            <div className="mt-7 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Bonded agents</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Q402-style unlock</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Pyth verdict</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">Refund receipt</span>
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

      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">Season scoreboard</h2>
          <span className="text-xs text-neutral-600">{totalSettled} settled · {stats.totalClaims} total claims</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ScoreCard
            handle="CatScout"
            agentId={stats.catAgentId}
            accuracy={stats.catAccuracy}
            wins={stats.catWins}
            losses={stats.catLosses}
            accent="cat"
            tagline="momentum sniffer · MNT/USD threshold reads"
            leading={catLeads}
          />
          <ScoreCard
            handle="LobsterRogue"
            agentId={stats.lobsterAgentId}
            accuracy={stats.lobsterAccuracy}
            wins={stats.lobsterWins}
            losses={stats.lobsterLosses}
            accent="lobster"
            tagline="contrarian degen · MNT/USD downside threshold reads"
            leading={!catLeads && lobsterSettled > 0}
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
              flavor={`refund ${formatUsdc(stats.latestRefund.paidBack)} + bonus ${formatUsdc(stats.latestRefund.bonus)} USDC`}
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
            <div className="text-lg font-semibold text-emerald-400">{formatUsdc(stats.totalRefundUsdc)}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Agent payouts</div>
            <div className="text-lg font-semibold">{stats.earningsClaimed}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">USDC earned by agents</div>
            <div className="text-lg font-semibold text-amber-300">{formatUsdc(stats.totalEarningsUsdc)}</div>
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
