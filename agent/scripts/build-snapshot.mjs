// Clawback season snapshot builder.
//
// Why this exists: the homepage used to compute "season proof" from a live 9,000-block
// (~5h on 2s Mantle Sepolia) getLogs window on every request, which throws under the public
// RPC rate limit and falls back to all-zeros. This script does ONE full-history scan (from the
// deploy block, no window) here in CI/cron context, assembles real totals + curated WRONG/RIGHT
// receipts with tx hashes, and writes a committed JSON the app imports. The app then renders
// real numbers with zero request-time RPC dependency.
//
// Run: node agent/scripts/build-snapshot.mjs   (viem resolves from agent/node_modules)
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../app/src/data/snapshot.json");
const CRON_RUNS = resolve(__dirname, "../cron-runs");

const RPC = process.env.MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const EXPLORER = "https://sepolia.mantlescan.xyz";
const ADDR = {
  agentRegistry: "0x0b7B93C0E6591bD415BEDE8B8DCD57171f4A7851",
  claimMarket: "0x8C076c7452E526526De877F86BBb4BA37E027af9",
  clawbackEscrow: "0xEa02e04E9550eA556235B46d10b554b876C16d2a",
};
const DEPLOY_BLOCK = 38493730n;
const CHUNK = 9999n;
const CONCURRENCY = 4;
// House-agent ids are fixed at deploy time. Challenger ids are discovered from
// AgentRegistered logs below so the arena can score arbitrary entrants.
const HANDLES = { 1: "CatScout", 2: "LobsterRogue", 3: "LlmScout" };

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
  transport: http(RPC, { batch: true, retryCount: 6, retryDelay: 600, timeout: 20_000 }),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label, tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await sleep(500 * (i + 1));
    }
  }
  throw new Error(`${label} failed after ${tries}: ${lastErr?.shortMessage ?? lastErr?.message ?? lastErr}`);
}

async function scan(address, events) {
  const latest = await withRetry(() => client.getBlockNumber(), "getBlockNumber");
  const ranges = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from = from + CHUNK + 1n) {
    const to = from + CHUNK > latest ? latest : from + CHUNK;
    ranges.push([from, to]);
  }
  const logs = [];
  let failed = 0;
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ([fromBlock, toBlock]) => {
        try {
          return await withRetry(
            () => client.getLogs({ address, events, fromBlock, toBlock }),
            `getLogs ${fromBlock}-${toBlock}`,
          );
        } catch (e) {
          failed++;
          console.warn(`  ! chunk ${fromBlock}-${toBlock} dropped: ${e.message}`);
          return [];
        }
      }),
    );
    for (const r of results) logs.push(...r);
    process.stdout.write(`\r  ${address.slice(0, 8)} scanned ${Math.min(i + CONCURRENCY, ranges.length)}/${ranges.length} chunks`);
  }
  process.stdout.write("\n");
  return { logs, latest, failed };
}

async function blockTs(blockNumber) {
  if (blockNumber == null) return 0;
  const b = await withRetry(() => client.getBlock({ blockNumber }), `getBlock ${blockNumber}`);
  return Number(b.timestamp);
}

const usdc = (v) => v.toString(); // store raw 6dp integer as string

function readClaimProvenance() {
  const byClaim = new Map();
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/^claim-\d+\.json$/.test(entry.name)) continue;
      try {
        const json = JSON.parse(readFileSync(path, "utf8"));
        const claimId = json.claimId?.toString();
        if (!claimId) continue;
        byClaim.set(claimId, {
          persona: json.persona ?? null,
          provider: json.llm?.provider ?? null,
          strategy: json.llm?.strategy ?? null,
          fellBack: typeof json.llm?.fellBack === "boolean" ? json.llm.fellBack : null,
          direction: json.direction ?? null,
          thresholdPriceUsd: json.thresholdPriceUsd ?? null,
          elfaSource: json.elfa?.source ?? null,
          elfaSignalCount: typeof json.elfa?.signalCount === "number" ? json.elfa.signalCount : null,
          elfaFetchedAt: typeof json.elfa?.fetchedAt === "number" ? json.elfa.fetchedAt : null,
          elfaSignals: Array.isArray(json.elfa?.signals) ? json.elfa.signals.slice(0, 6) : [],
        });
      } catch {
        // Provenance is presentation metadata only; never let a malformed file break
        // the onchain snapshot.
      }
    }
  };
  walk(CRON_RUNS);
  return byClaim;
}

async function main() {
  console.log(`Scanning Mantle Sepolia from block ${DEPLOY_BLOCK} ...`);
  const registry = await scan(ADDR.agentRegistry, registryEvents);
  const market = await scan(ADDR.claimMarket, marketEvents);
  const escrow = await scan(ADDR.clawbackEscrow, escrowEvents);
  const latest = market.latest;
  const provenanceByClaim = readClaimProvenance();

  const handleByAgent = new Map(Object.entries(HANDLES).map(([id, handle]) => [id, handle]));
  for (const l of registry.logs.filter((log) => log.eventName === "AgentRegistered")) {
    const agentId = l.args.agentId?.toString();
    const handle = l.args.handle;
    if (agentId && handle) handleByAgent.set(agentId, handle);
  }

  const commits = market.logs.filter((l) => l.eventName === "ClaimCommitted");
  const settles = market.logs.filter((l) => l.eventName === "ClaimSettled");
  const unlocks = market.logs.filter((l) => l.eventName === "PaidUnlockRecorded");
  const refunds = escrow.logs.filter((l) => l.eventName === "RefundClaimed");
  const payouts = escrow.logs.filter((l) => l.eventName === "EarningsClaimed");

  const agentByClaim = new Map();
  const commitByClaim = new Map();
  for (const l of commits) {
    const id = l.args.claimId?.toString();
    if (!id) continue;
    const agentId = l.args.agentId?.toString();
    agentByClaim.set(id, handleByAgent.get(agentId) ?? `Agent #${agentId ?? "unknown"}`);
    commitByClaim.set(id, {
      tx: l.transactionHash,
      block: l.blockNumber,
      bondAmount: l.args.bondAmount ?? 0n,
    });
  }
  const settleByClaim = new Map();
  for (const l of settles) {
    const id = l.args.claimId?.toString();
    if (!id) continue;
    settleByClaim.set(id, { tx: l.transactionHash, right: Boolean(l.args.agentRight), block: l.blockNumber });
  }
  const refundByClaim = new Map();
  for (const l of refunds) {
    const id = l.args.claimId?.toString();
    if (!id) continue;
    refundByClaim.set(id, {
      tx: l.transactionHash,
      paidBack: l.args.paidBack ?? 0n,
      bonus: l.args.bonus ?? 0n,
      user: l.args.user,
    });
  }
  const payoutByClaim = new Map();
  for (const l of payouts) {
    const id = l.args.claimId?.toString();
    if (!id) continue;
    payoutByClaim.set(id, { tx: l.transactionHash, amount: l.args.amount ?? 0n });
  }

  // totals
  const totalClaims = commitByClaim.size;
  let settledRight = 0, settledWrong = 0;
  const perAgent = {};
  for (const h of handleByAgent.values()) perAgent[h] = { wins: 0, losses: 0 };
  for (const [id, s] of settleByClaim) {
    const h = agentByClaim.get(id) ?? "CatScout";
    perAgent[h] ??= { wins: 0, losses: 0 };
    if (s.right) { settledRight++; perAgent[h].wins++; } else { settledWrong++; perAgent[h].losses++; }
  }
  let totalRefund = 0n;
  for (const r of refundByClaim.values()) totalRefund += r.paidBack + r.bonus;
  let totalEarned = 0n;
  for (const p of payoutByClaim.values()) totalEarned += p.amount;

  // latest refund / payout (highest claimId)
  const maxKey = (m) => [...m.keys()].map(Number).sort((a, b) => b - a)[0];
  const latestRefundId = refundByClaim.size ? maxKey(refundByClaim) : null;
  const latestPayoutId = payoutByClaim.size ? maxKey(payoutByClaim) : null;

  const isBankrLlmClaim = (id) => {
    const p = provenanceByClaim.get(String(id));
    return p?.persona === "LlmScout" && p?.provider?.startsWith("bankr:") && p.fellBack === false;
  };

  // Curated proof pair: prefer real, non-fallback Bankr LlmScout receipts. If none
  // exist, fall back to the most recent settled WRONG/RIGHT receipts with money
  // movement so the page never goes empty.
  const wrongIds = [...settleByClaim.entries()].filter(([id, s]) => !s.right && refundByClaim.has(id)).map(([id]) => Number(id)).sort((a, b) => b - a);
  const rightIds = [...settleByClaim.entries()].filter(([id, s]) => s.right && payoutByClaim.has(id)).map(([id]) => Number(id)).sort((a, b) => b - a);
  const curatedWrongId = wrongIds.find(isBankrLlmClaim) ?? wrongIds[0] ?? null;
  const curatedRightId = rightIds.find(isBankrLlmClaim) ?? rightIds[0] ?? null;

  const lastClaimAt = await blockTs(commits.at(-1)?.blockNumber);
  const lastSettleAt = await blockTs(settles.at(-1)?.blockNumber);

  const receipt = async (id) => {
    if (id == null) return null;
    const key = String(id);
    const c = commitByClaim.get(key), s = settleByClaim.get(key);
    const rf = refundByClaim.get(key), po = payoutByClaim.get(key);
    const prov = provenanceByClaim.get(key);
    return {
      claimId: id,
      agent: agentByClaim.get(key) ?? "CatScout",
      outcome: s ? (s.right ? "right" : "wrong") : "pending",
      commitTx: c?.tx ?? null,
      settleTx: s?.tx ?? null,
      bondAmount: c ? usdc(c.bondAmount) : null,
      refundTx: rf?.tx ?? null,
      payoutTx: po?.tx ?? null,
      paidBack: rf ? usdc(rf.paidBack) : null,
      bonus: rf ? usdc(rf.bonus) : null,
      user: rf?.user ?? null,
      amount: po ? usdc(po.amount) : null,
      provider: prov?.provider ?? null,
      strategy: prov?.strategy ?? null,
      fellBack: prov?.fellBack ?? null,
      direction: prov?.direction ?? null,
      thresholdPriceUsd: prov?.thresholdPriceUsd ?? null,
      elfaSource: prov?.elfaSource ?? null,
      elfaSignalCount: prov?.elfaSignalCount ?? null,
      elfaFetchedAt: prov?.elfaFetchedAt ?? null,
      elfaSignals: prov?.elfaSignals ?? [],
      commitAt: c ? await blockTs(c.block) : 0,
      settleAt: s ? await blockTs(s.block) : 0,
    };
  };

  // latest 8 receipts by claimId desc
  const ids = [...commitByClaim.keys()].map(Number).sort((a, b) => b - a).slice(0, 8);
  const latestReceipts = [];
  for (const id of ids) {
    const key = String(id);
    const s = settleByClaim.get(key);
    const prov = provenanceByClaim.get(key);
    latestReceipts.push({
      claimId: id,
      agent: agentByClaim.get(key) ?? "CatScout",
      outcome: s ? (s.right ? "right" : "wrong") : "pending",
      commitTx: commitByClaim.get(key)?.tx ?? null,
      settleTx: s?.tx ?? null,
      bondAmount: commitByClaim.get(key) ? usdc(commitByClaim.get(key).bondAmount) : null,
      payoutTx: payoutByClaim.get(key)?.tx ?? null,
      refundTx: refundByClaim.get(key)?.tx ?? null,
      provider: prov?.provider ?? null,
      strategy: prov?.strategy ?? null,
      fellBack: prov?.fellBack ?? null,
      direction: prov?.direction ?? null,
      thresholdPriceUsd: prov?.thresholdPriceUsd ?? null,
      elfaSource: prov?.elfaSource ?? null,
      elfaSignalCount: prov?.elfaSignalCount ?? null,
      elfaFetchedAt: prov?.elfaFetchedAt ?? null,
      elfaSignals: prov?.elfaSignals ?? [],
    });
  }

  const lr = latestRefundId != null ? refundByClaim.get(String(latestRefundId)) : null;
  const lp = latestPayoutId != null ? payoutByClaim.get(String(latestPayoutId)) : null;

  const snapshot = {
    generatedAt: Math.floor(Date.now() / 1000),
    fromBlock: DEPLOY_BLOCK.toString(),
    toBlock: latest.toString(),
    chunksDropped: market.failed + escrow.failed,
    explorer: EXPLORER,
    totalClaims,
    totalUnlocks: unlocks.length,
    settledRight,
    settledWrong,
    refundsClaimed: refundByClaim.size,
    earningsClaimed: payoutByClaim.size,
    totalRefundUsdc: usdc(totalRefund),
    totalEarningsUsdc: usdc(totalEarned),
    agents: HANDLES,
    perAgent,
    lastClaimAt,
    lastSettleAt,
    latestRefund: lr ? { claimId: latestRefundId, tx: lr.tx, paidBack: usdc(lr.paidBack), bonus: usdc(lr.bonus), user: lr.user } : null,
    latestPayout: lp ? { claimId: latestPayoutId, tx: lp.tx, amount: usdc(lp.amount), agent: agentByClaim.get(String(latestPayoutId)) ?? "CatScout" } : null,
    curatedWrong: await receipt(curatedWrongId),
    curatedRight: await receipt(curatedRightId),
    latestReceipts,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");

  console.log("\n=== SNAPSHOT ===");
  console.log(`claims=${totalClaims} unlocks=${unlocks.length} right=${settledRight} wrong=${settledWrong}`);
  console.log(`refunds=${refundByClaim.size} ($${formatUnits(totalRefund, 6)})  payouts=${payoutByClaim.size} ($${formatUnits(totalEarned, 6)})`);
  console.log(`curatedWrong=#${curatedWrongId}  curatedRight=#${curatedRightId}  chunksDropped=${snapshot.chunksDropped}`);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
