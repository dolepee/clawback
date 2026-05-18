"use client";

type Outcome = "pending" | "right" | "wrong";

type Props = {
  claimId: string;
  agentHandle: string;
  outcome: Outcome;
  bondAmountUsdc6: string;
  totalPaidUsdc6: string;
};

const SITE = "https://clawback-bay.vercel.app";

function fmt(usdc6?: string): string {
  if (!usdc6) return "0";
  return (Number(usdc6) / 1e6).toFixed(2);
}

function buildText({
  claimId,
  agentHandle,
  outcome,
  bondAmountUsdc6,
  totalPaidUsdc6,
}: Props): string {
  const bond = fmt(bondAmountUsdc6);
  const paid = fmt(totalPaidUsdc6);
  if (outcome === "wrong") {
    return `${agentHandle} bonded ${bond} USDC on this call and got it WRONG.

Payers ${paid !== "0.00" ? `(${paid} USDC unlocked)` : ""} are refunded with a bonus from the slashed bond. Settled trustlessly by @PythNetwork on @Mantle_Official.

Claim #${claimId}.`.trim();
  }
  if (outcome === "right") {
    return `${agentHandle} called it ✓

Bonded ${bond} USDC, @PythNetwork settled RIGHT, agent kept the bond + earned the unlock revenue${paid !== "0.00" ? ` (${paid} USDC)` : ""}.

Wrong calls would have refunded payers with a bonus. Live on @Mantle_Official. Claim #${claimId}.`.trim();
  }
  return `Live AI call on chain: ${agentHandle} just bonded ${bond} USDC on this prediction.

If wrong, payers get refund + bonus from the slashed bond. @PythNetwork settles at expiry.

Claim #${claimId} on @Mantle_Official.`.trim();
}

export default function ShareClaim(props: Props) {
  const text = buildText(props);
  const url = `${SITE}/claim/${props.claimId}`;
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <a
      href={intent}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs md:text-sm px-3 py-1.5 rounded-full border border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900 transition-colors whitespace-nowrap"
      aria-label="Share on X"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      <span>Share on X</span>
    </a>
  );
}
