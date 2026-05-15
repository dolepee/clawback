import { publicClient } from "./chain";
import { ADDRESSES } from "./addresses";
import {
  agentIdentityAbi,
  agentRegistryAbi,
  claimMarketAbi,
  clawbackEscrowAbi,
  reputationLedgerAbi,
} from "./abi";

export type Claim = {
  id: bigint;
  agentId: bigint;
  claimHash: `0x${string}`;
  skillsOutputHash: `0x${string}`;
  bondAmount: bigint;
  unlockPrice: bigint;
  expiry: bigint;
  publicReleaseAt: bigint;
  marketId: number;
  state: number;
  revealedClaimText: string;
  predictionParams: `0x${string}`;
};

export type Agent = {
  id: bigint;
  owner: `0x${string}`;
  handle: string;
  faction: number;
  metadataHash: `0x${string}`;
  bondedTotal: bigint;
  slashableBonded: bigint;
  registered: boolean;
};

export type Score = {
  wins: bigint;
  losses: bigint;
  totalBonded: bigint;
  totalSlashed: bigint;
  totalEarned: bigint;
  accuracyBps: number;
};

export type Accounting = {
  totalPaid: bigint;
  bondAtStake: bigint;
  slashedBondPool: bigint;
  agentId: bigint;
  settled: boolean;
  agentRight: boolean;
  settlementProof: `0x${string}`;
};

async function readClaim(id: bigint): Promise<Claim> {
  const result = (await publicClient.readContract({
    address: ADDRESSES.claimMarket,
    abi: claimMarketAbi,
    functionName: "getClaim",
    args: [id],
  })) as {
    agentId: bigint;
    claimHash: `0x${string}`;
    skillsOutputHash: `0x${string}`;
    bondAmount: bigint;
    unlockPrice: bigint;
    expiry: bigint;
    publicReleaseAt: bigint;
    marketId: number;
    state: number;
    revealedClaimText: string;
    predictionParams: `0x${string}`;
  };
  return { id, ...result };
}

async function readAgent(id: bigint): Promise<Agent> {
  const result = (await publicClient.readContract({
    address: ADDRESSES.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "agents",
    args: [id],
  })) as unknown as [
    `0x${string}`,
    string,
    number,
    `0x${string}`,
    bigint,
    bigint,
    boolean,
  ];
  return {
    id,
    owner: result[0],
    handle: result[1],
    faction: result[2],
    metadataHash: result[3],
    bondedTotal: result[4],
    slashableBonded: result[5],
    registered: result[6],
  };
}

async function readScore(agentId: bigint): Promise<Score> {
  const result = (await publicClient.readContract({
    address: ADDRESSES.reputationLedger,
    abi: reputationLedgerAbi,
    functionName: "scores",
    args: [agentId],
  })) as unknown as [bigint, bigint, bigint, bigint, bigint, number];
  return {
    wins: result[0],
    losses: result[1],
    totalBonded: result[2],
    totalSlashed: result[3],
    totalEarned: result[4],
    accuracyBps: result[5],
  };
}

async function readAccounting(claimId: bigint): Promise<Accounting> {
  const result = (await publicClient.readContract({
    address: ADDRESSES.clawbackEscrow,
    abi: clawbackEscrowAbi,
    functionName: "accounting",
    args: [claimId],
  })) as unknown as [
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    `0x${string}`,
  ];
  return {
    totalPaid: result[0],
    bondAtStake: result[1],
    slashedBondPool: result[2],
    agentId: result[3],
    settled: result[4],
    agentRight: result[5],
    settlementProof: result[6],
  };
}

export async function listClaims(): Promise<Claim[]> {
  const next = (await publicClient.readContract({
    address: ADDRESSES.claimMarket,
    abi: claimMarketAbi,
    functionName: "nextClaimId",
  })) as bigint;
  if (next <= 1n) return [];
  const ids: bigint[] = [];
  for (let i = 1n; i < next; i++) ids.push(i);
  const claims = await Promise.all(ids.map(readClaim));
  return claims.reverse();
}

export async function listAgents(): Promise<Agent[]> {
  const next = (await publicClient.readContract({
    address: ADDRESSES.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "nextAgentId",
  })) as bigint;
  if (next <= 1n) return [];
  const ids: bigint[] = [];
  for (let i = 1n; i < next; i++) ids.push(i);
  return Promise.all(ids.map(readAgent));
}

export async function loadFeed(): Promise<{ claims: Claim[]; agents: Map<string, Agent> }> {
  const claims = await listClaims();
  const uniqueAgentIds = Array.from(new Set(claims.map((c) => c.agentId.toString())));
  const agentList = await Promise.all(
    uniqueAgentIds.map((idStr) => readAgent(BigInt(idStr))),
  );
  const agents = new Map(agentList.map((a) => [a.id.toString(), a]));
  return { claims, agents };
}

export type FeedStats = {
  totalClaims: number;
  settledRight: number;
  settledWrong: number;
  publiclyRevealed: number;
  totalUsdcPaidIn: bigint;
};

export async function loadFeedStats(): Promise<FeedStats> {
  const claims = await listClaims();
  const accountings = await Promise.all(claims.map((c) => readAccounting(c.id)));
  let settledRight = 0;
  let settledWrong = 0;
  let totalUsdcPaidIn = 0n;
  for (const a of accountings) {
    if (a.settled) {
      if (a.agentRight) settledRight++;
      else settledWrong++;
    }
    totalUsdcPaidIn += a.totalPaid;
  }
  const publiclyRevealed = claims.filter((c) => c.state === 2).length;
  return {
    totalClaims: claims.length,
    settledRight,
    settledWrong,
    publiclyRevealed,
    totalUsdcPaidIn,
  };
}

export async function loadClaimDetail(claimId: bigint) {
  const [claim, accounting] = await Promise.all([
    readClaim(claimId),
    readAccounting(claimId),
  ]);
  if (claim.agentId === 0n) return null;
  const agent = await readAgent(claim.agentId);
  return { claim, agent, accounting };
}

export type AgentIdentityRecord = {
  handle: string;
  faction: string;
  statsURI: string;
  metadataHash: `0x${string}`;
  mintedAt: bigint;
};

async function readAgentIdentity(agentId: bigint): Promise<AgentIdentityRecord | null> {
  try {
    const result = (await publicClient.readContract({
      address: ADDRESSES.agentIdentity as `0x${string}`,
      abi: agentIdentityAbi,
      functionName: "identity",
      args: [agentId],
    })) as AgentIdentityRecord;
    return {
      handle: result.handle,
      faction: result.faction,
      statsURI: result.statsURI,
      metadataHash: result.metadataHash,
      mintedAt: result.mintedAt,
    };
  } catch {
    return null;
  }
}

export async function loadAgentDetail(agentId: bigint) {
  const agent = await readAgent(agentId);
  if (!agent.registered) return null;
  const [score, identity] = await Promise.all([readScore(agentId), readAgentIdentity(agentId)]);
  return { agent, score, identity };
}

export async function loadLeaderboard() {
  const agents = await listAgents();
  const registered = agents.filter((a) => a.registered);
  const scores = await Promise.all(registered.map((a) => readScore(a.id)));
  const rows = registered.map((a, i) => ({ agent: a, score: scores[i] }));
  rows.sort((a, b) => {
    if (b.score.accuracyBps !== a.score.accuracyBps) {
      return b.score.accuracyBps - a.score.accuracyBps;
    }
    return Number(b.score.wins - a.score.wins);
  });
  return rows;
}
