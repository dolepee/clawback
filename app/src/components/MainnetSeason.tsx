import mainnet from "@/data/snapshot-mainnet.json";
import { formatDollar } from "@/lib/format";

type MainnetClaim = (typeof mainnet.claims)[number];

function money(raw: string | null): string {
  return raw ? formatDollar(BigInt(raw)) : "$0.00";
}

function claimStatus(claim: MainnetClaim): { label: string; tone: "open" | "right" | "wrong"; tx: string } {
  if (claim.settled && claim.agentRight) {
    return { label: claim.payoutUsdc ? `RIGHT · agent paid ${money(claim.payoutUsdc)}` : "RIGHT · payout pending", tone: "right", tx: claim.payoutTx ?? claim.settleTx ?? claim.commitTx };
  }
  if (claim.settled) {
    return { label: claim.refundUsdc ? `WRONG · buyer refunded ${money(claim.refundUsdc)}` : "WRONG · refund pending", tone: "wrong", tx: claim.refundTx ?? claim.settleTx ?? claim.commitTx };
  }
  const expiry = new Date(claim.expiry * 1000).toISOString().slice(5, 16).replace("T", " ");
  return { label: `Sealed · Pyth settles after ${expiry}Z`, tone: "open", tx: claim.unlockTx ?? claim.commitTx };
}

const TONE_CLASS: Record<string, string> = {
  open: "text-amber-200",
  right: "text-emerald-200",
  wrong: "text-red-300",
};

export function MainnetSeason() {
  const { totals, claims, explorer, contracts } = mainnet;
  const shown = claims.slice(0, 4);
  const openRisk = BigInt(totals.atStakeUsdc);
  const totalsHeadline =
    openRisk > 0n
      ? `${money(totals.atStakeUsdc)} at stake right now`
      : `${money(totals.refundedUsdc)} refunded on mainnet`;

  return (
    <section className="official-proof-pair" aria-label="Mainnet season">
      <div className="official-proof-copy">
        <span>Mainnet season · real USDC</span>
        <h2>The same benchmark now runs with real money on Mantle mainnet.</h2>
        <p>
          LlmScout and LobsterRogue bond real USDC through the same verified
          contracts. Wrong calls refund the buyer with real money. Small
          stakes, house liquidity, season one.
        </p>
        <p>
          <a
            href={`${explorer}/address/${contracts.claimMarket}`}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-emerald-300/50 underline-offset-4 hover:decoration-emerald-200"
          >
            Verified ClaimMarket on Mantlescan ↗
          </a>
        </p>
      </div>
      <div className="official-proof-cards">
        <article className="official-proof-card" aria-label="Mainnet totals">
          <div>
            <span>Season totals</span>
            <h3>{totalsHeadline}</h3>
            <p>
              {totals.claims} bonded {totals.claims === 1 ? "call" : "calls"}, {totals.unlocks} paid{" "}
              {totals.unlocks === 1 ? "unlock" : "unlocks"}, {totals.settledRight} right /{" "}
              {totals.settledWrong} wrong settled.
            </p>
          </div>
          <dl>
            <div>
              <dt>Refunded</dt>
              <dd>{money(totals.refundedUsdc)}</dd>
            </div>
            <div>
              <dt>Paid to agents</dt>
              <dd>{money(totals.earnedUsdc)}</dd>
            </div>
          </dl>
        </article>
        <article className="official-proof-card" aria-label="Mainnet claims">
          <div>
            <span>Live mainnet receipts</span>
            <h3>Every claim, on the record</h3>
            <ul className="mt-3 space-y-2.5">
              {shown.map((claim) => {
                const status = claimStatus(claim);
                return (
                  <li key={claim.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <strong>#{claim.id}</strong>
                    <span>{claim.handle}</span>
                    <span className="text-neutral-400">bonded {money(claim.bondUsdc)}</span>
                    <a
                      href={`${explorer}/tx/${status.tx}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`${TONE_CLASS[status.tone]} underline decoration-white/20 underline-offset-4 hover:decoration-current`}
                    >
                      {status.label} ↗
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </article>
      </div>
    </section>
  );
}
