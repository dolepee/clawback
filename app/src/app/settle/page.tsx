import type { Metadata } from "next";
import { loadFeed } from "@/lib/data";
import { publicClient } from "@/lib/chain";
import { ADDRESSES } from "@/lib/addresses";
import { clawbackEscrowAbi } from "@/lib/abi";
import SettleClaimList, { type SettleClaim } from "@/components/SettleClaimList";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export const metadata: Metadata = {
  title: "Settle",
  description: "Trigger Pyth settlement on any expired claim. Anyone can call resolve and pay a few wei of MNT for the oracle update fee.",
};

export default async function SettlePage() {
  // Soft-fail wrapping: Mantle Sepolia public RPC frequently 5xxs under
  // load and `accounting()` fans out N reads. One flaky read should not
  // 500 the whole page. Use Promise.allSettled so individual failures
  // skip their row, and wrap the whole load in try/catch so loadFeed
  // failures render an empty shell instead of crashing the page.
  let rows: SettleClaim[] = [];
  try {
    const { claims, agents } = await loadFeed();
    const accountings = await Promise.allSettled(
      claims.map((c) =>
        publicClient.readContract({
          address: ADDRESSES.clawbackEscrow as `0x${string}`,
          abi: clawbackEscrowAbi,
          functionName: "accounting",
          args: [c.id],
        }) as Promise<readonly [bigint, bigint, bigint, bigint, boolean, boolean, `0x${string}`]>,
      ),
    );
    rows = claims
      .map((c, i) => {
        const a = accountings[i];
        if (a.status !== "fulfilled") return null;
        const agent = agents.get(c.agentId.toString());
        return {
          id: c.id.toString(),
          agentId: c.agentId.toString(),
          agentHandle: agent?.handle ?? `agent ${c.agentId.toString()}`,
          marketId: c.marketId,
          state: c.state,
          expiry: c.expiry.toString(),
          bondAmount: c.bondAmount.toString(),
          unlockPrice: c.unlockPrice.toString(),
          settled: a.value[4],
          agentRight: a.value[5],
        } satisfies SettleClaim;
      })
      .filter((r): r is SettleClaim => r !== null);
  } catch (err) {
    console.warn("settle page load failed, rendering empty shell:", err);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl md:text-2xl font-bold mb-2">Settlement console</h1>
      <p className="text-neutral-400 mb-2 text-xs md:text-sm leading-relaxed">
        Anyone can trigger settlement after a claim expires. The Pyth pull oracle fetches a fresh price update, the adapter
        decodes the commit time snapshot from <span className="font-mono text-neutral-300">predictionParams</span>, and the
        market records RIGHT or WRONG trustlessly.
      </p>
      <p className="text-neutral-500 text-[11px] md:text-xs mb-5 md:mb-6">
        Caller pays a tiny Pyth update fee (a few wei MNT). Claims expire 6h after commit by default.
      </p>
      <SettleClaimList claims={rows} />
    </div>
  );
}
