import { loadFeed } from "@/lib/data";
import { publicClient } from "@/lib/chain";
import { ADDRESSES } from "@/lib/addresses";
import { clawbackEscrowAbi } from "@/lib/abi";
import SettleClaimList, { type SettleClaim } from "@/components/SettleClaimList";

export const revalidate = 15;

export default async function SettlePage() {
  const { claims, agents } = await loadFeed();

  const accountings = await Promise.all(
    claims.map((c) =>
      publicClient.readContract({
        address: ADDRESSES.clawbackEscrow as `0x${string}`,
        abi: clawbackEscrowAbi,
        functionName: "accounting",
        args: [c.id],
      }) as Promise<readonly [bigint, bigint, bigint, bigint, boolean, boolean, `0x${string}`]>,
    ),
  );

  const rows: SettleClaim[] = claims.map((c, i) => {
    const agent = agents.get(c.agentId.toString());
    const acct = accountings[i];
    return {
      id: c.id.toString(),
      agentId: c.agentId.toString(),
      agentHandle: agent?.handle ?? `agent ${c.agentId.toString()}`,
      marketId: c.marketId,
      state: c.state,
      expiry: c.expiry.toString(),
      bondAmount: c.bondAmount.toString(),
      unlockPrice: c.unlockPrice.toString(),
      settled: acct[4],
      agentRight: acct[5],
    };
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Settlement console</h1>
      <p className="text-neutral-400 mb-2 text-sm">
        Anyone can trigger settlement after a claim expires. The Pyth pull oracle fetches a fresh price update, the adapter
        decodes the commit time snapshot from <span className="font-mono text-neutral-300">predictionParams</span>, and the
        market records RIGHT or WRONG trustlessly.
      </p>
      <p className="text-neutral-500 text-xs mb-6">
        Caller pays a tiny Pyth update fee (a few wei MNT). Claims expire 6h after commit by default.
      </p>
      <SettleClaimList claims={rows} />
    </div>
  );
}
