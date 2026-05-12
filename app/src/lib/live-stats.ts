import { createPublicClient, http, parseAbi, type PublicClient } from "viem";
import { ADDRESSES, DEPLOY_BLOCK, RPC_URL } from "./addresses";
import { mantleSepolia } from "./chain";
import {
  agentRegistryAbi,
  claimMarketAbi,
  clawbackEscrowAbi,
  reputationLedgerAbi,
} from "./abi";

export type LiveStats = {
  totalClaims: number;
  totalUnlocks: number;
  settledRight: number;
  settledWrong: number;
  refundsClaimed: number;
  earningsClaimed: number;
  catAccuracy: number;
  lobsterAccuracy: number;
  lastClaimAt: number;
  lastSettleAt: number;
  generatedAt: number;
  latestReceipts: Array<{
    claimId: number;
    agent: "CatScout" | "LobsterRogue";
    outcome: "pending" | "right" | "wrong";
    commitTx: `0x${string}`;
    settleTx?: `0x${string}`;
    payoutTx?: `0x${string}`;
    refundTx?: `0x${string}`;
  }>;
};

export type HealthStatus = {
  status: "ok" | "stale";
  lastClaimAgeSeconds: number;
  lastSettleAgeSeconds: number;
  staleThresholdSeconds: number;
  generatedAt: number;
};

const claimEventsAbi = parseAbi([
  "event ClaimCommitted(uint256 indexed claimId, uint256 indexed agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes predictionParams)",
  "event ClaimSettled(uint256 indexed claimId, bool agentRight)",
  "event PaidUnlockRecorded(uint256 indexed claimId, address indexed payer)",
]);

const escrowEventsAbi = parseAbi([
  "event RefundClaimed(uint256 indexed claimId, address indexed user, uint256 paidBack, uint256 bonus)",
  "event EarningsClaimed(uint256 indexed agentId, uint256 indexed claimId, uint256 amount)",
]);

function makeClient(): PublicClient {
  return createPublicClient({
    chain: mantleSepolia,
    transport: http(process.env.MANTLE_SEPOLIA_RPC_URL ?? RPC_URL),
  }) as PublicClient;
}

export async function buildStats(client: PublicClient = makeClient()): Promise<LiveStats> {
  const [
    nextClaimId,
    nextAgentId,
    commitLogs,
    settleLogs,
    unlockLogs,
    refundLogs,
    earningLogs,
  ] = await Promise.all([
    client.readContract({ address: ADDRESSES.claimMarket, abi: claimMarketAbi, functionName: "nextClaimId" }),
    client.readContract({ address: ADDRESSES.agentRegistry, abi: agentRegistryAbi, functionName: "nextAgentId" }),
    client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[0], fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
    client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[1], fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
    client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[2], fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
    client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[0], fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
    client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[1], fromBlock: DEPLOY_BLOCK, toBlock: "latest" }),
  ]);

  const agents = new Map<string, "CatScout" | "LobsterRogue">();
  const scores = new Map<string, number>();
  for (let id = 1n; id < nextAgentId; id++) {
    const [agent, score] = await Promise.all([
      client.readContract({ address: ADDRESSES.agentRegistry, abi: agentRegistryAbi, functionName: "agents", args: [id] }),
      client.readContract({ address: ADDRESSES.reputationLedger, abi: reputationLedgerAbi, functionName: "scores", args: [id] }),
    ]);
    const handle = agent[1];
    if (handle === "CatScout" || handle === "LobsterRogue") {
      agents.set(id.toString(), handle);
      scores.set(handle, Number(score[5]) / 10_000);
    }
  }

  const commitByClaim = new Map<string, `0x${string}`>();
  const agentByClaim = new Map<string, "CatScout" | "LobsterRogue">();
  for (const log of commitLogs) {
    const claimId = log.args.claimId?.toString();
    const agentId = log.args.agentId?.toString();
    if (!claimId || !agentId) continue;
    commitByClaim.set(claimId, log.transactionHash);
    agentByClaim.set(claimId, agents.get(agentId) ?? "CatScout");
  }

  const settleByClaim = new Map<string, { tx: `0x${string}`; outcome: "right" | "wrong" }>();
  for (const log of settleLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId) continue;
    settleByClaim.set(claimId, {
      tx: log.transactionHash,
      outcome: log.args.agentRight ? "right" : "wrong",
    });
  }

  const refundByClaim = new Map<string, `0x${string}`>();
  for (const log of refundLogs) {
    const claimId = log.args.claimId?.toString();
    if (claimId) refundByClaim.set(claimId, log.transactionHash);
  }

  const payoutByClaim = new Map<string, `0x${string}`>();
  for (const log of earningLogs) {
    const claimId = log.args.claimId?.toString();
    if (claimId) payoutByClaim.set(claimId, log.transactionHash);
  }

  const totalClaims = Number(nextClaimId > 1n ? nextClaimId - 1n : 0n);
  const latestReceipts: LiveStats["latestReceipts"] = [];
  for (let id = totalClaims; id >= 1 && latestReceipts.length < 8; id--) {
    const key = String(id);
    const commitTx = commitByClaim.get(key);
    if (!commitTx) continue;
    const settled = settleByClaim.get(key);
    latestReceipts.push({
      claimId: id,
      agent: agentByClaim.get(key) ?? "CatScout",
      outcome: settled?.outcome ?? "pending",
      commitTx,
      settleTx: settled?.tx,
      payoutTx: payoutByClaim.get(key),
      refundTx: refundByClaim.get(key),
    });
  }

  const [lastClaimAt, lastSettleAt] = await Promise.all([
    blockTimestamp(client, commitLogs.at(-1)?.blockNumber),
    blockTimestamp(client, settleLogs.at(-1)?.blockNumber),
  ]);

  return {
    totalClaims,
    totalUnlocks: unlockLogs.length,
    settledRight: settleLogs.filter((log) => log.args.agentRight).length,
    settledWrong: settleLogs.filter((log) => !log.args.agentRight).length,
    refundsClaimed: refundLogs.length,
    earningsClaimed: earningLogs.length,
    catAccuracy: scores.get("CatScout") ?? 0,
    lobsterAccuracy: scores.get("LobsterRogue") ?? 0,
    lastClaimAt,
    lastSettleAt,
    generatedAt: Math.floor(Date.now() / 1000),
    latestReceipts,
  };
}

export async function buildHealth(client: PublicClient = makeClient()): Promise<HealthStatus> {
  const stats = await buildStats(client);
  const staleThresholdSeconds = 30 * 3600;
  const now = Math.floor(Date.now() / 1000);
  const lastClaimAgeSeconds = stats.lastClaimAt === 0 ? staleThresholdSeconds + 1 : now - stats.lastClaimAt;
  const lastSettleAgeSeconds = stats.lastSettleAt === 0 ? staleThresholdSeconds + 1 : now - stats.lastSettleAt;
  return {
    status: lastClaimAgeSeconds < staleThresholdSeconds ? "ok" : "stale",
    lastClaimAgeSeconds,
    lastSettleAgeSeconds,
    staleThresholdSeconds,
    generatedAt: now,
  };
}

async function blockTimestamp(client: PublicClient, blockNumber?: bigint): Promise<number> {
  if (!blockNumber) return 0;
  const block = await client.getBlock({ blockNumber });
  return Number(block.timestamp);
}
