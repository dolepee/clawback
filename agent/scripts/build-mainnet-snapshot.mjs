// Builds the Mantle MAINNET season snapshot consumed by the app's
// "Mainnet season" panel. One full-history scan of the mainnet contracts
// (the season is young and small, so this is cheap), written to
// app/src/data/snapshot-mainnet.json and committed, mirroring the Sepolia
// snapshot architecture: the page can never zero out on a flaky RPC.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, fallback, http, parseAbi } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../app/src/data/snapshot-mainnet.json");

const RPC = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
const FALLBACK_RPCS = ["https://mantle-rpc.publicnode.com", "https://mantle.drpc.org"];
const EXPLORER = "https://mantlescan.xyz";
const DEPLOY_BLOCK = 96464300n;
const CHUNK = 9999n;

const ADDR = {
  agentRegistry: "0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd",
  claimMarket: "0x734c3037AEb58E5B60338C74318224bb5Dd70DB8",
  clawbackEscrow: "0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd",
  reputationLedger: "0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e",
  pythSettlementAdapter: "0x9fE7585cd038Bf35d05dc153ae2E2612D8d4DfeD",
  q402Adapter: "0xAbA92B00871C8fE5975d297419109780D010444E",
  agentIdentity: "0x45a2802dcbf8fda3715f4cba7e59531da6161301",
  usdc: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
};

const HANDLES = { 1: "LlmScout", 2: "LobsterRogue" };

const registryEvents = parseAbi([
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string handle, uint8 faction)",
]);
const marketEvents = parseAbi([
  "event ClaimCommitted(uint256 indexed claimId, uint256 indexed agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes predictionParams)",
  "event ClaimSettled(uint256 indexed claimId, bool agentRight)",
  "event PaidUnlockRecorded(uint256 indexed claimId, address indexed payer)",
]);
const escrowEvents = parseAbi([
  "event RefundClaimed(uint256 indexed claimId, address indexed user, uint256 paidBack, uint256 bonus)",
  "event EarningsClaimed(uint256 indexed agentId, uint256 indexed claimId, uint256 amount)",
]);

const client = createPublicClient({
  transport: fallback(
    [RPC, ...FALLBACK_RPCS.filter((u) => u !== RPC)].map((u) =>
      http(u, { retryCount: 6, retryDelay: 600, timeout: 20_000 }),
    ),
    { rank: false },
  ),
});

async function scan(address, events) {
  const latest = await client.getBlockNumber();
  const logs = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from = from + CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    logs.push(...(await client.getLogs({ address, events, fromBlock: from, toBlock: to })));
  }
  return { logs, latest };
}

const usd = (v) => v.toString();

async function main() {
  const [registry, market, escrow] = await Promise.all([
    scan(ADDR.agentRegistry, registryEvents),
    scan(ADDR.claimMarket, marketEvents),
    scan(ADDR.clawbackEscrow, escrowEvents),
  ]);

  const handles = { ...HANDLES };
  for (const log of registry.logs) {
    if (log.eventName === "AgentRegistered") {
      handles[Number(log.args.agentId)] = log.args.handle ?? handles[Number(log.args.agentId)];
    }
  }

  const claims = new Map();
  for (const log of market.logs) {
    if (log.eventName !== "ClaimCommitted") continue;
    const id = Number(log.args.claimId);
    claims.set(id, {
      id,
      agentId: Number(log.args.agentId),
      handle: handles[Number(log.args.agentId)] ?? `Agent ${log.args.agentId}`,
      bondUsdc: usd(log.args.bondAmount),
      unlockUsdc: usd(log.args.unlockPrice),
      expiry: Number(log.args.expiry),
      commitTx: log.transactionHash,
      unlocked: false,
      unlockTx: null,
      settled: false,
      agentRight: null,
      settleTx: null,
      refundTx: null,
      refundUsdc: null,
      payoutTx: null,
      payoutUsdc: null,
    });
  }
  for (const log of market.logs) {
    const c = claims.get(Number(log.args?.claimId ?? -1));
    if (!c) continue;
    if (log.eventName === "PaidUnlockRecorded") {
      c.unlocked = true;
      c.unlockTx = log.transactionHash;
    }
    if (log.eventName === "ClaimSettled") {
      c.settled = true;
      c.agentRight = Boolean(log.args.agentRight);
      c.settleTx = log.transactionHash;
    }
  }
  let refunded = 0n;
  let earned = 0n;
  for (const log of escrow.logs) {
    const c = claims.get(Number(log.args?.claimId ?? -1));
    if (log.eventName === "RefundClaimed") {
      const total = (log.args.paidBack ?? 0n) + (log.args.bonus ?? 0n);
      refunded += total;
      if (c) {
        c.refundTx = log.transactionHash;
        c.refundUsdc = usd(total);
      }
    }
    if (log.eventName === "EarningsClaimed") {
      earned += log.args.amount ?? 0n;
      if (c) {
        c.payoutTx = log.transactionHash;
        c.payoutUsdc = usd(log.args.amount ?? 0n);
      }
    }
  }

  const list = [...claims.values()].sort((a, b) => b.id - a.id);
  const settledRight = list.filter((c) => c.settled && c.agentRight).length;
  const settledWrong = list.filter((c) => c.settled && !c.agentRight).length;
  const atStake = list
    .filter((c) => !c.settled)
    .reduce((sum, c) => sum + BigInt(c.bondUsdc), 0n);

  const agents = Object.entries(handles).map(([agentId, handle]) => ({
    agentId: Number(agentId),
    handle,
    wins: list.filter((c) => c.agentId === Number(agentId) && c.settled && c.agentRight).length,
    losses: list.filter((c) => c.agentId === Number(agentId) && c.settled && !c.agentRight).length,
  }));

  const snapshot = {
    generatedAt: new Date().toISOString(),
    network: "mantle-mainnet",
    chainId: 5000,
    explorer: EXPLORER,
    scannedToBlock: market.latest.toString(),
    contracts: ADDR,
    totals: {
      claims: list.length,
      unlocks: list.filter((c) => c.unlocked).length,
      settledRight,
      settledWrong,
      atStakeUsdc: usd(atStake),
      refundedUsdc: usd(refunded),
      earnedUsdc: usd(earned),
    },
    agents,
    claims: list,
  };

  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `mainnet snapshot: ${list.length} claims, ${settledRight}R/${settledWrong}W, at stake $${Number(atStake) / 1e6}, refunded $${Number(refunded) / 1e6}, earned $${Number(earned) / 1e6} -> ${OUT}`,
  );
}

await main();
