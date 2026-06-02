import { createPublicClient, http, parseAbi, type PublicClient } from "viem";
import { ADDRESSES, DEPLOY_BLOCK, RPC_URL } from "./addresses";
import { mantleSepolia } from "./chain";
import {
  agentRegistryAbi,
  claimMarketAbi,
  clawbackEscrowAbi,
  reputationLedgerAbi,
} from "./abi";

export type AgentHandle = "CatScout" | "LobsterRogue" | "LlmScout";
const KNOWN_HANDLES: readonly AgentHandle[] = ["CatScout", "LobsterRogue", "LlmScout"];
function isKnownHandle(h: string): h is AgentHandle {
  return (KNOWN_HANDLES as readonly string[]).includes(h);
}

export type LiveStats = {
  totalClaims: number;
  totalUnlocks: number;
  settledRight: number;
  settledWrong: number;
  refundsClaimed: number;
  earningsClaimed: number;
  catAccuracy: number;
  lobsterAccuracy: number;
  llmAccuracy: number;
  catAgentId: number;
  lobsterAgentId: number;
  llmAgentId: number;
  catWins: number;
  catLosses: number;
  lobsterWins: number;
  lobsterLosses: number;
  llmWins: number;
  llmLosses: number;
  totalRefundUsdc: bigint;
  totalEarningsUsdc: bigint;
  latestRefund?: { claimId: number; tx: `0x${string}`; paidBack: bigint; bonus: bigint; user: `0x${string}` };
  latestPayout?: { claimId: number; tx: `0x${string}`; amount: bigint; agent: AgentHandle };
  proofRefund?: {
    claimId: number;
    tx: `0x${string}`;
    paidBack: bigint;
    bonus: bigint;
    user: `0x${string}`;
    agent: AgentHandle;
    provider?: string;
    fellBack?: boolean;
  };
  proofPayout?: {
    claimId: number;
    tx: `0x${string}`;
    amount: bigint;
    agent: AgentHandle;
    provider?: string;
    fellBack?: boolean;
  };
  lastClaimAt: number;
  lastSettleAt: number;
  generatedAt: number;
  latestReceipts: Array<{
    claimId: number;
    agent: AgentHandle;
    outcome: "pending" | "right" | "wrong";
    commitTx: `0x${string}`;
    settleTx?: `0x${string}`;
    payoutTx?: `0x${string}`;
    refundTx?: `0x${string}`;
    provider?: string;
    fellBack?: boolean;
  }>;
  // LlmScout strategic identity: counts of each strategy across recent
  // LlmScout claims, plus the last few labeled claims for the agent page.
  // Sourced from the public cron-runs/*.json provenance files on the
  // repo (fetched via raw.githubusercontent.com).
  llmStrategyDistribution: Record<string, number>;
  llmRecentDecisions: Array<{
    claimId: number;
    strategy: string;
    direction: "above" | "below";
    thresholdPriceUsd: number;
    onChainConfBps: number;
    modelConfBps: number;
    provider: string;
    fellBack: boolean;
  }>;
  // Live MNT/USD price (the asset all bots are betting on). Fetched from
  // Pyth Hermes once per request. null when the fetch fails so the
  // surface can hide the indicator cleanly.
  mntUsd: number | null;
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
    transport: http(process.env.MANTLE_SEPOLIA_RPC_URL ?? RPC_URL, {
      batch: true,
      retryCount: 2,
      retryDelay: 200,
      timeout: 6_000,
    }),
  }) as PublicClient;
}

// Mantle Sepolia caps eth_getLogs at 10000 blocks per call. Public RPC is
// also slow and rate limited, so we cap the lookback to fit Vercel's
// serverless timeout. The cron pushes new claims every hour, so a recent
// window covers all active activity. Older history is read via contract
// state, not logs.
// Vercel serverless functions have a 10s default timeout. Each chunk takes
// ~1s on Mantle Sepolia, so we cap lookback at roughly 4 chunks to keep
// page renders fast. Recent activity (last ~24h) is fully covered; older
// receipts render with an empty event timeline (the receipt page still
// shows accounting, state, and contract addresses from contract reads).
const LOG_CHUNK_CONCURRENCY = 6;
const LOG_LOOKBACK_BLOCKS = 9_000n;

export async function chunkedLogs<T>(
  client: PublicClient,
  fetch: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
): Promise<T[]> {
  const latest = await client.getBlockNumber();
  const startFloor = latest > LOG_LOOKBACK_BLOCKS ? latest - LOG_LOOKBACK_BLOCKS : 0n;
  const start = startFloor > DEPLOY_BLOCK ? startFloor : DEPLOY_BLOCK;
  const chunkSize = 9999n;
  const ranges: Array<[bigint, bigint]> = [];
  for (let from = start; from <= latest; from = from + chunkSize + 1n) {
    const to = from + chunkSize > latest ? latest : from + chunkSize;
    ranges.push([from, to]);
  }
  const results: T[] = [];
  for (let i = 0; i < ranges.length; i += LOG_CHUNK_CONCURRENCY) {
    const batch = ranges.slice(i, i + LOG_CHUNK_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(([f, t]) => fetch(f, t)));
    for (const chunk of batchResults) results.push(...chunk);
  }
  return results;
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
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[0], fromBlock, toBlock })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[1], fromBlock, toBlock })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[2], fromBlock, toBlock })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[0], fromBlock, toBlock })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[1], fromBlock, toBlock })),
  ]);

  const agents = new Map<string, AgentHandle>();
  const scores = new Map<string, number>();
  const winsByHandle = new Map<string, bigint>();
  const lossesByHandle = new Map<string, bigint>();
  const agentIdByHandle = new Map<AgentHandle, number>();
  for (let id = 1n; id < nextAgentId; id++) {
    const [agent, score] = await Promise.all([
      client.readContract({ address: ADDRESSES.agentRegistry, abi: agentRegistryAbi, functionName: "agents", args: [id] }),
      client.readContract({ address: ADDRESSES.reputationLedger, abi: reputationLedgerAbi, functionName: "scores", args: [id] }),
    ]);
    const handle = agent[1];
    if (isKnownHandle(handle)) {
      agents.set(id.toString(), handle);
      scores.set(handle, Number(score[5]) / 10_000);
      winsByHandle.set(handle, score[0] as bigint);
      lossesByHandle.set(handle, score[1] as bigint);
      agentIdByHandle.set(handle, Number(id));
    }
  }

  const commitByClaim = new Map<string, `0x${string}`>();
  const agentByClaim = new Map<string, AgentHandle>();
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

  const totalRefundUsdc = refundLogs.reduce(
    (acc, log) => acc + ((log.args.paidBack ?? 0n) as bigint) + ((log.args.bonus ?? 0n) as bigint),
    0n,
  );
  const totalEarningsUsdc = earningLogs.reduce(
    (acc, log) => acc + ((log.args.amount ?? 0n) as bigint),
    0n,
  );

  const lastRefundLog = refundLogs.at(-1);
  const latestRefund = lastRefundLog
    ? {
        claimId: Number(lastRefundLog.args.claimId ?? 0n),
        tx: lastRefundLog.transactionHash,
        paidBack: (lastRefundLog.args.paidBack ?? 0n) as bigint,
        bonus: (lastRefundLog.args.bonus ?? 0n) as bigint,
        user: (lastRefundLog.args.user ?? "0x0") as `0x${string}`,
      }
    : undefined;
  const lastEarningLog = earningLogs.at(-1);
  const latestPayout = lastEarningLog
    ? {
        claimId: Number(lastEarningLog.args.claimId ?? 0n),
        tx: lastEarningLog.transactionHash,
        amount: (lastEarningLog.args.amount ?? 0n) as bigint,
        agent: agents.get((lastEarningLog.args.agentId ?? 0n).toString()) ?? "CatScout",
      }
    : undefined;

  return {
    totalClaims,
    totalUnlocks: unlockLogs.length,
    // Settled counts come from ReputationLedger state (sum of agent wins/losses), not from
    // settle logs: Mantle Sepolia is 2s/block, so the 9k-block (~5h) getLogs window misses the
    // daily settle cadence and would read 0. Every settlement scores exactly one agent, so
    // sum(wins) = right and sum(losses) = wrong, and these match the per-agent cards below.
    settledRight: Number([...winsByHandle.values()].reduce((a, b) => a + b, 0n)),
    settledWrong: Number([...lossesByHandle.values()].reduce((a, b) => a + b, 0n)),
    refundsClaimed: refundLogs.length,
    earningsClaimed: earningLogs.length,
    catAccuracy: scores.get("CatScout") ?? 0,
    lobsterAccuracy: scores.get("LobsterRogue") ?? 0,
    llmAccuracy: scores.get("LlmScout") ?? 0,
    catAgentId: agentIdByHandle.get("CatScout") ?? 0,
    lobsterAgentId: agentIdByHandle.get("LobsterRogue") ?? 0,
    llmAgentId: agentIdByHandle.get("LlmScout") ?? 0,
    catWins: Number(winsByHandle.get("CatScout") ?? 0n),
    catLosses: Number(lossesByHandle.get("CatScout") ?? 0n),
    lobsterWins: Number(winsByHandle.get("LobsterRogue") ?? 0n),
    lobsterLosses: Number(lossesByHandle.get("LobsterRogue") ?? 0n),
    llmWins: Number(winsByHandle.get("LlmScout") ?? 0n),
    llmLosses: Number(lossesByHandle.get("LlmScout") ?? 0n),
    totalRefundUsdc,
    totalEarningsUsdc,
    latestRefund,
    latestPayout,
    lastClaimAt,
    lastSettleAt,
    generatedAt: Math.floor(Date.now() / 1000),
    latestReceipts,
    ...(await fetchLlmStrategySummary(latestReceipts.filter((r) => r.agent === "LlmScout").map((r) => r.claimId))),
    mntUsd: await fetchPythMntUsd(),
  };
}

// Fetches the current MNT/USD price from Pyth Hermes. Cached for 60s
// via Next's fetch cache so this doesn't fire on every request. Returns
// null on failure so the UI can hide the indicator cleanly.
export async function fetchPythMntUsd(): Promise<number | null> {
  const feedId = "4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585";
  try {
    const r = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`,
      { next: { revalidate: 60 } },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      parsed?: Array<{ price?: { price?: string; expo?: number } }>;
    };
    const p = j.parsed?.[0]?.price;
    if (!p?.price || p?.expo == null) return null;
    return Number(BigInt(p.price)) * Math.pow(10, p.expo);
  } catch {
    return null;
  }
}

// Pulls strategy + threshold + confidence from the public provenance
// committed alongside each cron-cycle run. cron-runs/{date}/claim-{N}.json
// lives in the repo and is fetched via raw.githubusercontent.com so the
// edge function has zero file-system dependency.
export async function fetchLlmStrategySummary(
  llmClaimIds: number[] = [],
): Promise<{ llmStrategyDistribution: Record<string, number>; llmRecentDecisions: LiveStats["llmRecentDecisions"] }> {
  const repo = process.env.CLAWBACK_GITHUB_REPO ?? "dolepee/clawback";
  const branch = process.env.CLAWBACK_GITHUB_BRANCH ?? "main";
  const today = new Date();
  const dateCandidates: string[] = [];
  for (let d = 0; d < 7; d++) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - d);
    dateCandidates.push(dt.toISOString().slice(0, 10));
  }

  // If no claim IDs were provided (e.g. loadAgentReceipts hit its timeout
  // budget and returned empty), discover LlmScout claims by scanning the
  // GitHub Contents API for recent date directories. This makes the panel
  // self sufficient — it does not depend on the chain RPC succeeding.
  let workingClaimIds = llmClaimIds;
  if (workingClaimIds.length === 0) {
    const discovered = new Set<number>();
    for (const date of dateCandidates) {
      if (discovered.size >= 24) break;
      try {
        const r = await fetch(
          `https://api.github.com/repos/${repo}/contents/agent/cron-runs/${date}?ref=${branch}`,
          { next: { revalidate: 300 }, headers: { accept: "application/vnd.github+json" } },
        );
        if (!r.ok) continue;
        const files = (await r.json()) as Array<{ name: string }>;
        for (const f of files) {
          const m = f.name.match(/^claim-(\d+)\.json$/);
          if (m) discovered.add(Number(m[1]));
        }
      } catch {
        // continue
      }
    }
    workingClaimIds = Array.from(discovered).sort((a, b) => b - a).slice(0, 24);
  }

  const fetchOne = async (claimId: number): Promise<LiveStats["llmRecentDecisions"][number] | null> => {
    for (const date of dateCandidates) {
      const url = `https://raw.githubusercontent.com/${repo}/${branch}/agent/cron-runs/${date}/claim-${claimId}.json`;
      try {
        const r = await fetch(url, { next: { revalidate: 300 } });
        if (!r.ok) continue;
        const j = (await r.json()) as {
          persona?: string;
          direction?: "above" | "below";
          thresholdPriceUsd?: string;
          llm?: { provider?: string; strategy?: string; fellBack?: boolean; confidenceBps?: number; modelConfidenceBps?: number };
        };
        if (j.persona !== "LlmScout" || !j.llm) return null;
        return {
          claimId,
          strategy: j.llm.strategy ?? "balanced",
          direction: j.direction ?? "above",
          thresholdPriceUsd: Number(j.thresholdPriceUsd ?? 0),
          onChainConfBps: j.llm.confidenceBps ?? 0,
          modelConfBps: j.llm.modelConfidenceBps ?? 0,
          provider: j.llm.provider ?? "unknown",
          fellBack: j.llm.fellBack ?? false,
        };
      } catch {
        // try next date
      }
    }
    return null;
  };

  const results = (await Promise.all(workingClaimIds.map(fetchOne))).filter(
    (r): r is LiveStats["llmRecentDecisions"][number] => r !== null,
  );
  const llmStrategyDistribution: Record<string, number> = {};
  for (const r of results) {
    llmStrategyDistribution[r.strategy] = (llmStrategyDistribution[r.strategy] ?? 0) + 1;
  }
  return { llmStrategyDistribution, llmRecentDecisions: results };
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

export type ReplayClaim = {
  claimId: number;
  agentId: number;
  agentHandle: AgentHandle;
  marketId: number;
  predictionParams: `0x${string}`;
  bondAmount: bigint;
  unlockPrice: bigint;
  expiry: number;
  commitTx: `0x${string}`;
  commitAt: number;
  settleTx?: `0x${string}`;
  settleAt?: number;
  agentRight?: boolean;
  payoutTx?: `0x${string}`;
  payoutAmount?: bigint;
  refundTx?: `0x${string}`;
  refundPaidBack?: bigint;
  refundBonus?: bigint;
  refundUser?: `0x${string}`;
};

export async function loadReplayClaims(
  client: PublicClient = makeClient(),
): Promise<{ wrong?: ReplayClaim; right?: ReplayClaim }> {
  const [commitLogs, settleLogs, refundLogs, earningLogs, nextAgentId] = await Promise.all([
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[0], fromBlock, toBlock })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.claimMarket, event: claimEventsAbi[1], fromBlock, toBlock })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[0], fromBlock, toBlock })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({ address: ADDRESSES.clawbackEscrow, event: escrowEventsAbi[1], fromBlock, toBlock })),
    client.readContract({ address: ADDRESSES.agentRegistry, abi: agentRegistryAbi, functionName: "nextAgentId" }),
  ]);

  const handleByAgent = new Map<string, AgentHandle>();
  for (let id = 1n; id < nextAgentId; id++) {
    const agent = await client.readContract({
      address: ADDRESSES.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "agents",
      args: [id],
    });
    const handle = agent[1];
    if (isKnownHandle(handle)) {
      handleByAgent.set(id.toString(), handle);
    }
  }

  const commitByClaim = new Map<string, { tx: `0x${string}`; block: bigint; agentId: string }>();
  for (const log of commitLogs) {
    const claimId = log.args.claimId?.toString();
    const agentId = log.args.agentId?.toString();
    if (!claimId || !agentId) continue;
    commitByClaim.set(claimId, { tx: log.transactionHash, block: log.blockNumber, agentId });
  }

  const settleByClaim = new Map<string, { tx: `0x${string}`; agentRight: boolean; block: bigint }>();
  const orderedSettles: Array<{ claimId: string; block: bigint; agentRight: boolean }> = [];
  for (const log of settleLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId) continue;
    const entry = { tx: log.transactionHash, agentRight: Boolean(log.args.agentRight), block: log.blockNumber };
    settleByClaim.set(claimId, entry);
    orderedSettles.push({ claimId, block: log.blockNumber, agentRight: entry.agentRight });
  }
  orderedSettles.sort((a, b) => Number(b.block - a.block));

  const refundByClaim = new Map<string, { tx: `0x${string}`; paidBack: bigint; bonus: bigint; user: `0x${string}` }>();
  for (const log of refundLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId) continue;
    refundByClaim.set(claimId, {
      tx: log.transactionHash,
      paidBack: (log.args.paidBack ?? 0n) as bigint,
      bonus: (log.args.bonus ?? 0n) as bigint,
      user: (log.args.user ?? "0x0") as `0x${string}`,
    });
  }

  const payoutByClaim = new Map<string, { tx: `0x${string}`; amount: bigint }>();
  for (const log of earningLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId) continue;
    payoutByClaim.set(claimId, { tx: log.transactionHash, amount: (log.args.amount ?? 0n) as bigint });
  }

  const findClaim = async (agentRight: boolean, withReceipt: boolean): Promise<ReplayClaim | undefined> => {
    for (const s of orderedSettles) {
      if (s.agentRight !== agentRight) continue;
      const hasReceipt = withReceipt
        ? agentRight
          ? payoutByClaim.has(s.claimId)
          : refundByClaim.has(s.claimId)
        : true;
      if (!hasReceipt) continue;
      const commit = commitByClaim.get(s.claimId);
      if (!commit) continue;
      const agentHandle = handleByAgent.get(commit.agentId);
      if (!agentHandle) continue;
      const id = BigInt(s.claimId);
      const claim = (await client.readContract({
        address: ADDRESSES.claimMarket,
        abi: claimMarketAbi,
        functionName: "getClaim",
        args: [id],
      })) as {
        bondAmount: bigint;
        unlockPrice: bigint;
        expiry: bigint;
        marketId: number;
        state: number;
        predictionParams: `0x${string}`;
      };
      const [commitBlockTs, settleBlockTs] = await Promise.all([
        client.getBlock({ blockNumber: commit.block }),
        client.getBlock({ blockNumber: s.block }),
      ]);
      const settle = settleByClaim.get(s.claimId)!;
      const refund = refundByClaim.get(s.claimId);
      const payout = payoutByClaim.get(s.claimId);
      return {
        claimId: Number(s.claimId),
        agentId: Number(commit.agentId),
        agentHandle,
        marketId: claim.marketId,
        predictionParams: claim.predictionParams,
        bondAmount: claim.bondAmount,
        unlockPrice: claim.unlockPrice,
        expiry: Number(claim.expiry),
        commitTx: commit.tx,
        commitAt: Number(commitBlockTs.timestamp),
        settleTx: settle.tx,
        settleAt: Number(settleBlockTs.timestamp),
        agentRight: settle.agentRight,
        payoutTx: payout?.tx,
        payoutAmount: payout?.amount,
        refundTx: refund?.tx,
        refundPaidBack: refund?.paidBack,
        refundBonus: refund?.bonus,
        refundUser: refund?.user,
      };
    }
    return undefined;
  };

  const wrong = (await findClaim(false, true)) ?? (await findClaim(false, false));
  const right = (await findClaim(true, true)) ?? (await findClaim(true, false));
  return { wrong, right };
}

export type AgentReceipt = {
  claimId: number;
  marketId: number;
  bondAmount: bigint;
  unlockPrice: bigint;
  expiry: number;
  state: number;
  commitTx: `0x${string}`;
  commitAt: number;
  settleTx?: `0x${string}`;
  settleAt?: number;
  agentRight?: boolean;
  refundTx?: `0x${string}`;
  refundAmount?: bigint;
  refundBonus?: bigint;
  payoutTx?: `0x${string}`;
  payoutAmount?: bigint;
};

export type AccuracyPoint = {
  claimId: number;
  cumulativeRight: number;
  cumulativeWrong: number;
  accuracy: number;
};

export type AgentCharacter = {
  receipts: AgentReceipt[];
  curve: AccuracyPoint[];
  totalRefundCaused: bigint;
  refundCount: number;
  payoutCount: number;
};

export async function loadAgentReceipts(
  agentId: bigint,
  client: PublicClient = makeClient(),
): Promise<AgentCharacter> {
  const [commitLogs, settleLogs, refundLogs, earningLogs] = await Promise.all([
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({
      address: ADDRESSES.claimMarket,
      event: claimEventsAbi[0],
      args: { agentId },
      fromBlock,
      toBlock,
    })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({
      address: ADDRESSES.claimMarket,
      event: claimEventsAbi[1],
      fromBlock,
      toBlock,
    })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({
      address: ADDRESSES.clawbackEscrow,
      event: escrowEventsAbi[0],
      fromBlock,
      toBlock,
    })),
    chunkedLogs(client, (fromBlock, toBlock) => client.getLogs({
      address: ADDRESSES.clawbackEscrow,
      event: escrowEventsAbi[1],
      args: { agentId },
      fromBlock,
      toBlock,
    })),
  ]);

  const claimIds = new Set<string>();
  const commitByClaim = new Map<string, { tx: `0x${string}`; block: bigint }>();
  for (const log of commitLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId) continue;
    claimIds.add(claimId);
    commitByClaim.set(claimId, { tx: log.transactionHash, block: log.blockNumber });
  }

  const settleByClaim = new Map<string, { tx: `0x${string}`; agentRight: boolean; block: bigint }>();
  for (const log of settleLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId || !claimIds.has(claimId)) continue;
    settleByClaim.set(claimId, {
      tx: log.transactionHash,
      agentRight: Boolean(log.args.agentRight),
      block: log.blockNumber,
    });
  }

  const refundByClaim = new Map<string, { tx: `0x${string}`; paidBack: bigint; bonus: bigint }>();
  for (const log of refundLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId || !claimIds.has(claimId)) continue;
    const existing = refundByClaim.get(claimId);
    const paidBack = (log.args.paidBack ?? 0n) as bigint;
    const bonus = (log.args.bonus ?? 0n) as bigint;
    if (existing) {
      existing.paidBack += paidBack;
      existing.bonus += bonus;
    } else {
      refundByClaim.set(claimId, { tx: log.transactionHash, paidBack, bonus });
    }
  }

  const payoutByClaim = new Map<string, { tx: `0x${string}`; amount: bigint }>();
  for (const log of earningLogs) {
    const claimId = log.args.claimId?.toString();
    if (!claimId) continue;
    payoutByClaim.set(claimId, { tx: log.transactionHash, amount: (log.args.amount ?? 0n) as bigint });
  }

  const claimData = await Promise.all(
    Array.from(claimIds).map(async (idStr) => {
      const id = BigInt(idStr);
      const claim = (await client.readContract({
        address: ADDRESSES.claimMarket,
        abi: claimMarketAbi,
        functionName: "getClaim",
        args: [id],
      })) as {
        bondAmount: bigint;
        unlockPrice: bigint;
        expiry: bigint;
        marketId: number;
        state: number;
      };
      return { idStr, claim };
    }),
  );

  const blockNumbers = new Set<bigint>();
  for (const c of commitByClaim.values()) blockNumbers.add(c.block);
  for (const s of settleByClaim.values()) blockNumbers.add(s.block);
  const blockTimestamps = new Map<string, number>();
  await Promise.all(
    Array.from(blockNumbers).map(async (bn) => {
      const block = await client.getBlock({ blockNumber: bn });
      blockTimestamps.set(bn.toString(), Number(block.timestamp));
    }),
  );

  const receipts: AgentReceipt[] = claimData.map(({ idStr, claim }) => {
    const commit = commitByClaim.get(idStr)!;
    const settle = settleByClaim.get(idStr);
    const refund = refundByClaim.get(idStr);
    const payout = payoutByClaim.get(idStr);
    return {
      claimId: Number(idStr),
      marketId: claim.marketId,
      bondAmount: claim.bondAmount,
      unlockPrice: claim.unlockPrice,
      expiry: Number(claim.expiry),
      state: claim.state,
      commitTx: commit.tx,
      commitAt: blockTimestamps.get(commit.block.toString()) ?? 0,
      settleTx: settle?.tx,
      settleAt: settle ? blockTimestamps.get(settle.block.toString()) : undefined,
      agentRight: settle?.agentRight,
      refundTx: refund?.tx,
      refundAmount: refund?.paidBack,
      refundBonus: refund?.bonus,
      payoutTx: payout?.tx,
      payoutAmount: payout?.amount,
    };
  });

  receipts.sort((a, b) => b.claimId - a.claimId);

  const settledChronological = [...receipts]
    .filter((r) => r.settleTx && r.settleAt !== undefined)
    .sort((a, b) => (a.settleAt! - b.settleAt!) || (a.claimId - b.claimId));

  let right = 0;
  let wrong = 0;
  const curve: AccuracyPoint[] = settledChronological.map((r) => {
    if (r.agentRight) right++;
    else wrong++;
    const total = right + wrong;
    return {
      claimId: r.claimId,
      cumulativeRight: right,
      cumulativeWrong: wrong,
      accuracy: total === 0 ? 0 : right / total,
    };
  });

  const totalRefundCaused = Array.from(refundByClaim.values()).reduce(
    (acc, r) => acc + r.paidBack + r.bonus,
    0n,
  );

  return {
    receipts,
    curve,
    totalRefundCaused,
    refundCount: refundByClaim.size,
    payoutCount: payoutByClaim.size,
  };
}
