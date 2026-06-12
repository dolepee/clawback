import { decodeAbiParameters, decodeEventLog, formatUnits, parseAbi, type Address, type Hex, type Log, type PublicClient } from "viem";
import { IS_MAINNET, activeChain, addresses, claimIds, mantleSepolia, publicClient, readAccounting, readClaim, type AccountingView, type ClaimView } from "../cron/lib.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export { addresses, claimIds, publicClient, readAccounting, readClaim, mantleSepolia };
export type { AccountingView, ClaimView };

export const STATE_LABELS: Record<number, string> = {
  0: "Committed",
  1: "Settled",
  2: "PubliclyRevealed",
};

export const MARKET_LABELS: Record<number, string> = {
  0: "MNT_OUTPERFORMS_METH",
  1: "MNT_USDT_THRESHOLD",
};

export const FACTION_LABELS = ["Cat", "Lobster"];

export const REGISTRY_ABI = parseAbi([
  "function agents(uint256) view returns (address owner, string handle, uint8 faction, bytes32 metadataHash, uint256 bondedTotal, uint256 slashableBonded, bool registered)",
  "function bondedBalance(uint256) view returns (uint256)",
  "function slashableBondedBalance(uint256) view returns (uint256)",
]);

export const REPUTATION_ABI = parseAbi([
  "function agentScore(uint256) view returns ((uint64 wins, uint64 losses, uint256 totalBonded, uint256 totalSlashed, uint256 totalEarned, uint16 accuracyBps))",
]);

export const ESCROW_ABI = parseAbi([
  "function paidAmount(address, uint256) view returns (uint256)",
  "function refundClaimed(uint256, address) view returns (bool)",
  "function earningsClaimed(uint256) view returns (bool)",
  "function claimableRefund(address, uint256) view returns (uint256 paidBack, uint256 bonus)",
]);

export const CLAIM_MARKET_ABI = parseAbi([
  "event ClaimCommitted(uint256 indexed claimId, uint256 indexed agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes predictionParams)",
  "event ClaimPubliclyRevealed(uint256 indexed claimId, string claimText)",
  "function paidUnlock(uint256, address) view returns (bool)",
]);

export const PYTH_ADAPTER_ABI = parseAbi([
  "event PythSettlement(uint256 indexed claimId, bool agentRight, int64 mntPrice, int64 ethPrice, uint256 publishTime)",
]);

export const Q402_ABI = parseAbi([
  "event PaymentSettled(uint256 indexed claimId, address indexed payer, uint256 amount, bytes32 paymentId)",
  "function nonceUsed(address, uint256) view returns (bool)",
]);

export type AgentRecord = {
  owner: Address;
  handle: string;
  faction: number;
  registered: boolean;
};

export async function readAgent(agentId: bigint, client: PublicClient = publicClient()): Promise<AgentRecord> {
  const addrs = addresses();
  const tuple = await client.readContract({
    address: addrs.agentRegistry,
    abi: REGISTRY_ABI,
    functionName: "agents",
    args: [agentId],
  });
  const [owner, handle, faction, , , , registered] = tuple as unknown as [Address, string, number, Hex, bigint, bigint, boolean];
  return { owner, handle, faction, registered };
}

export type AgentScore = {
  wins: bigint;
  losses: bigint;
  totalBonded: bigint;
  totalSlashed: bigint;
  totalEarned: bigint;
  accuracyBps: number;
};

export async function readAgentScore(agentId: bigint, client: PublicClient = publicClient()): Promise<AgentScore> {
  const addrs = addresses();
  const s = await client.readContract({
    address: addrs.reputationLedger,
    abi: REPUTATION_ABI,
    functionName: "agentScore",
    args: [agentId],
  });
  return {
    wins: s.wins,
    losses: s.losses,
    totalBonded: s.totalBonded,
    totalSlashed: s.totalSlashed,
    totalEarned: s.totalEarned,
    accuracyBps: Number(s.accuracyBps),
  };
}

export function formatUsdc(amount: bigint): string {
  return `${formatUnits(amount, 6)} ${IS_MAINNET ? "USDC" : "mUSDC"}`;
}

export function formatTimestamp(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

export function decodePrediction(params: Hex, marketId: number): string {
  if (params === "0x") return "(empty)";
  try {
    if (marketId === 1) {
      const [threshold, direction] = decodeAbiParameters([{ type: "uint128" }, { type: "uint8" }], params);
      const usd = Number(threshold) / 1e8;
      const dir = direction === 1 ? "below" : "above";
      return `MNT/USD ${dir} $${usd.toFixed(4)} (thresholdE8=${threshold}, direction=${direction})`;
    }
    if (marketId === 0) {
      const [bps, mntCommit, ethCommit] = decodeAbiParameters([{ type: "int64" }, { type: "uint64" }, { type: "uint64" }], params);
      return `MNT outperforms mETH by >= ${bps} bps (commit MNT=${mntCommit}E8, ETH=${ethCommit}E8)`;
    }
  } catch (err) {
    return `(decode failed: ${(err as Error).message})`;
  }
  return `marketId ${marketId} not modelled`;
}

export function decodePythProof(proof: Hex): { mntPrice: bigint; ethPrice: bigint; publishTime: bigint; marketId: number } | null {
  if (!proof || proof === "0x") return null;
  try {
    const [mntPrice, ethPrice, publishTime, marketId] = decodeAbiParameters(
      [{ type: "int64" }, { type: "int64" }, { type: "uint256" }, { type: "uint8" }],
      proof,
    );
    return { mntPrice, ethPrice, publishTime, marketId };
  } catch {
    return null;
  }
}

// Mantle Sepolia caps eth_getLogs ranges at 10_000 blocks. Default must stay under that.
const SCAN_CHUNK = BigInt(Number(process.env.VERIFY_LOG_CHUNK ?? 9_999));
const SCAN_LOOKBACK = BigInt(Number(process.env.VERIFY_LOG_LOOKBACK ?? 1_500_000));

async function scanLogs<T>(
  client: PublicClient,
  args: { address: Address; event: any; args: Record<string, unknown>; stopOnFirst?: boolean },
): Promise<any[]> {
  const head = await client.getBlockNumber();
  const lowest = head > SCAN_LOOKBACK ? head - SCAN_LOOKBACK : 0n;
  const found: any[] = [];
  let toBlock = head;
  while (toBlock >= lowest) {
    const fromBlock = toBlock > SCAN_CHUNK ? toBlock - SCAN_CHUNK + 1n : 0n;
    let batch: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        batch = await client.getLogs({
          address: args.address,
          event: args.event,
          args: args.args,
          fromBlock,
          toBlock,
        });
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    if (batch.length > 0) {
      found.push(...batch);
      if (args.stopOnFirst) return found;
    }
    if (fromBlock === 0n) break;
    toBlock = fromBlock - 1n;
  }
  return found;
}

export async function findCommitEventLog(claimId: bigint, client: PublicClient = publicClient()) {
  const addrs = addresses();
  const logs = await scanLogs(client, {
    address: addrs.claimMarket,
    event: CLAIM_MARKET_ABI[0],
    args: { claimId },
    stopOnFirst: true,
  });
  return logs[0];
}

export async function findRevealEventLog(claimId: bigint, client: PublicClient = publicClient()) {
  const addrs = addresses();
  const logs = await scanLogs(client, {
    address: addrs.claimMarket,
    event: CLAIM_MARKET_ABI[1],
    args: { claimId },
    stopOnFirst: true,
  });
  return logs[0];
}

export async function findPythSettlementLog(claimId: bigint, client: PublicClient = publicClient()) {
  const addrs = addresses();
  const logs = await scanLogs(client, {
    address: addrs.pythSettlementAdapter,
    event: PYTH_ADAPTER_ABI[0],
    args: { claimId },
    stopOnFirst: true,
  });
  return logs[0];
}

export async function findPaymentSettledLogs(claimId: bigint, client: PublicClient = publicClient()) {
  const addrs = addresses();
  return scanLogs(client, {
    address: addrs.q402Adapter,
    event: Q402_ABI[0],
    args: { claimId },
  });
}

export type PrivateClaimRecord = {
  claimText?: string;
  salt?: string;
};

export async function loadPrivateClaimRecord(claimId: bigint, cwd = process.cwd()): Promise<PrivateClaimRecord | null> {
  const root = join(cwd, "cron-private");
  let days: string[];
  try {
    days = await readdir(root);
  } catch {
    return null;
  }
  for (const day of days) {
    const path = join(root, day, `claim-${claimId}.json`);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as PrivateClaimRecord;
    } catch {
      // try next day
    }
  }
  return null;
}

export function parseClaimIdArg(argv: string[] = process.argv): bigint {
  const raw = argv[2];
  if (!raw) throw new Error("usage: <script> <claimId>");
  const value = BigInt(raw);
  if (value <= 0n) throw new Error(`claimId must be > 0, got ${raw}`);
  return value;
}

export function parseOptionalAddressArg(argv: string[] = process.argv, index = 3): Address | null {
  const raw = argv[index];
  if (!raw) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) throw new Error(`invalid address ${raw}`);
  return raw as Address;
}

export function pad(label: string, width = 26): string {
  return label.padEnd(width, " ");
}

export function fail(verdictTag: string, reason: string): never {
  console.log(`${pad("verdict:")}${verdictTag}_INVALID (${reason})`);
  process.exit(1);
}

export function pass(verdictTag: string): void {
  console.log(`${pad("verdict:")}${verdictTag}_VALID`);
}

export function blockExplorerTx(hash: string): string {
  return `${activeChain.blockExplorers.default.url}/tx/${hash}`;
}

export function decodeCommitArgs(log: Log) {
  return decodeEventLog({
    abi: CLAIM_MARKET_ABI,
    data: log.data,
    topics: log.topics,
    eventName: "ClaimCommitted",
  }).args;
}
