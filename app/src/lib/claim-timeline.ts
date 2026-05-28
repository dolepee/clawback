import { parseAbi, type PublicClient } from "viem";
import { publicClient } from "./chain";
import { ADDRESSES } from "./addresses";
import { chunkedLogs } from "./live-stats";

const marketEventsAbi = parseAbi([
  "event ClaimCommitted(uint256 indexed claimId, uint256 indexed agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes predictionParams)",
  "event ClaimSettled(uint256 indexed claimId, bool agentRight)",
  "event ClaimPubliclyRevealed(uint256 indexed claimId, string claimText)",
]);

const escrowEventsAbi = parseAbi([
  "event PaymentAccepted(uint256 indexed claimId, address indexed payer, uint256 amount)",
  "event RefundClaimed(uint256 indexed claimId, address indexed user, uint256 paidBack, uint256 bonus)",
  "event EarningsClaimed(uint256 indexed agentId, uint256 indexed claimId, uint256 amount)",
]);

export type TimelineEvent =
  | { kind: "commit"; at: number; tx: `0x${string}`; bondAmount: bigint; unlockPrice: bigint }
  | { kind: "unlock"; at: number; tx: `0x${string}`; payer: `0x${string}`; amount: bigint }
  | { kind: "settle"; at: number; tx: `0x${string}`; agentRight: boolean }
  | { kind: "refund"; at: number; tx: `0x${string}`; user: `0x${string}`; paidBack: bigint; bonus: bigint }
  | { kind: "payout"; at: number; tx: `0x${string}`; amount: bigint }
  | { kind: "reveal"; at: number; tx: `0x${string}` };

export async function loadClaimTimeline(
  claimId: bigint,
  client: PublicClient = publicClient as unknown as PublicClient,
): Promise<TimelineEvent[]> {
  const [commitLogs, settleLogs, revealLogs, paymentLogs, refundLogs, earningLogs] = await Promise.all([
    chunkedLogs(client, (fromBlock, toBlock) =>
      client.getLogs({ address: ADDRESSES.claimMarket, event: marketEventsAbi[0], args: { claimId }, fromBlock, toBlock }),
    ),
    chunkedLogs(client, (fromBlock, toBlock) =>
      client.getLogs({ address: ADDRESSES.claimMarket, event: marketEventsAbi[1], args: { claimId }, fromBlock, toBlock }),
    ),
    chunkedLogs(client, (fromBlock, toBlock) =>
      client.getLogs({ address: ADDRESSES.claimMarket, event: marketEventsAbi[2], args: { claimId }, fromBlock, toBlock }),
    ),
    chunkedLogs(client, (fromBlock, toBlock) =>
      client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[0], args: { claimId }, fromBlock, toBlock }),
    ),
    chunkedLogs(client, (fromBlock, toBlock) =>
      client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[1], args: { claimId }, fromBlock, toBlock }),
    ),
    chunkedLogs(client, (fromBlock, toBlock) =>
      client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[2], args: { claimId }, fromBlock, toBlock }),
    ),
  ]);

  const blockNumbers = new Set<bigint>();
  for (const log of [...commitLogs, ...settleLogs, ...revealLogs, ...paymentLogs, ...refundLogs, ...earningLogs]) {
    blockNumbers.add(log.blockNumber);
  }
  const timestampByBlock = new Map<string, number>();
  await Promise.all(
    Array.from(blockNumbers).map(async (bn) => {
      const block = await client.getBlock({ blockNumber: bn });
      timestampByBlock.set(bn.toString(), Number(block.timestamp));
    }),
  );
  const ts = (bn: bigint) => timestampByBlock.get(bn.toString()) ?? 0;

  const events: TimelineEvent[] = [];

  for (const log of commitLogs) {
    events.push({
      kind: "commit",
      at: ts(log.blockNumber),
      tx: log.transactionHash,
      bondAmount: (log.args.bondAmount ?? 0n) as bigint,
      unlockPrice: (log.args.unlockPrice ?? 0n) as bigint,
    });
  }
  for (const log of paymentLogs) {
    events.push({
      kind: "unlock",
      at: ts(log.blockNumber),
      tx: log.transactionHash,
      payer: (log.args.payer ?? "0x0") as `0x${string}`,
      amount: (log.args.amount ?? 0n) as bigint,
    });
  }
  for (const log of settleLogs) {
    events.push({
      kind: "settle",
      at: ts(log.blockNumber),
      tx: log.transactionHash,
      agentRight: Boolean(log.args.agentRight),
    });
  }
  for (const log of refundLogs) {
    events.push({
      kind: "refund",
      at: ts(log.blockNumber),
      tx: log.transactionHash,
      user: (log.args.user ?? "0x0") as `0x${string}`,
      paidBack: (log.args.paidBack ?? 0n) as bigint,
      bonus: (log.args.bonus ?? 0n) as bigint,
    });
  }
  for (const log of earningLogs) {
    events.push({
      kind: "payout",
      at: ts(log.blockNumber),
      tx: log.transactionHash,
      amount: (log.args.amount ?? 0n) as bigint,
    });
  }
  for (const log of revealLogs) {
    events.push({
      kind: "reveal",
      at: ts(log.blockNumber),
      tx: log.transactionHash,
    });
  }

  const order: TimelineEvent["kind"][] = ["commit", "unlock", "settle", "refund", "payout", "reveal"];
  events.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    return order.indexOf(a.kind) - order.indexOf(b.kind);
  });

  return events;
}
