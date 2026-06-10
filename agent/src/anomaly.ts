// On-chain anomaly scan over Merchant Moe Liquidity Book pools on Mantle
// mainnet. This is the Alpha & Data signal layer: before an LLM persona
// commits a bonded claim, it sees a structured scan of real swap flow,
// bin (price) migration, and the pool's native volatility accumulator,
// compared against the immediately preceding window.
//
// Design rules:
// - Real reads only. Every number comes from Swap logs or pool state.
// - Failure-tolerant. fetchPoolAnomalies never throws; a null snapshot
//   means "scan unavailable" and the cycle continues without it.
// - Honest thresholds. Flags use simple static heuristics, documented
//   inline, and the raw numbers always travel with the flags so the
//   provenance record lets anyone re-derive the verdict.

import { createPublicClient, defineChain, fallback, http, parseAbiItem, type PublicClient } from "viem";

const MANTLE_FALLBACK_RPCS = ["https://mantle-rpc.publicnode.com", "https://mantle.drpc.org"] as const;
const TRANSPORT_OPTS = { retryCount: 4, retryDelay: 400, timeout: 15_000 } as const;

const mantle = defineChain({
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mantle.xyz"] } },
});

function mainnetClient(rpcUrl?: string): PublicClient {
  const primary = rpcUrl ?? process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
  const urls = [primary, ...MANTLE_FALLBACK_RPCS.filter((u) => u !== primary)];
  return createPublicClient({
    chain: mantle,
    transport: fallback(urls.map((u) => http(u, TRANSPORT_OPTS)), { rank: false }),
  }) as PublicClient;
}

// Merchant Moe LB v2.2 pair event, verified against live mainnet logs.
const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed to, uint24 id, bytes32 amountsIn, bytes32 amountsOut, uint24 volatilityAccumulator, bytes32 totalFees, bytes32 protocolFees)",
);

const POOLS = [
  { label: "WMNT/USDT", address: "0x365722f12ceb2063286a268b03c654df81b7c00f" as `0x${string}`, binStep: 10, quoteDecimals: 6 },
  { label: "mETH/USDT", address: "0x3f0047606dcad6177c13742f1854fc8c999cd2b6" as `0x${string}`, binStep: 10, quoteDecimals: 6 },
] as const;

// Mantle averages ~2s blocks; 12h of window keeps sparse pools meaningful
// without hammering public RPCs. Logs are fetched in bounded chunks.
const BLOCK_TIME_SECONDS = 2;
const WINDOW_HOURS = 12;
const CHUNK_BLOCKS = 3_000n;

export interface PoolAnomalyReport {
  pool: string;
  windowHours: number;
  swapCount: number;
  baselineSwapCount: number;
  // swapCount vs the preceding window of equal length. 1.0 = unchanged.
  activityRatio: number | null;
  uniqueTraders: number;
  // Net active-bin movement across the window, in basis points
  // (each bin = binStep bps). Sign follows bin id direction.
  binDriftBps: number;
  maxVolatilityAccumulator: number;
  // Largest single swap in the window, quote-token units (USDT).
  largestSwapQuote: number;
  totalQuoteVolume: number;
  flags: string[];
}

export interface AnomalySnapshot {
  source: "merchant_moe_lb_mantle_mainnet";
  fetchedAt: string;
  fromBlock: string;
  toBlock: string;
  windowHours: number;
  pools: PoolAnomalyReport[];
  flags: string[];
}

interface SwapRow {
  blockNumber: bigint;
  sender: string;
  binId: number;
  volatilityAccumulator: number;
  quoteIn: number;
  quoteOut: number;
}

// PackedUint128Math: low 128 bits = tokenX amount, high 128 bits = tokenY.
// Both pools quote in USDT as tokenY, so the quote leg is the high half.
function unpackQuote(amounts: `0x${string}`, quoteDecimals: number): number {
  const value = BigInt(amounts);
  const y = value >> 128n;
  return Number(y) / 10 ** quoteDecimals;
}

async function fetchSwaps(
  client: PublicClient,
  pool: (typeof POOLS)[number],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<SwapRow[]> {
  const rows: SwapRow[] = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_BLOCKS + 1n) {
    const end = start + CHUNK_BLOCKS > toBlock ? toBlock : start + CHUNK_BLOCKS;
    const logs = await client.getLogs({ address: pool.address, event: SWAP_EVENT, fromBlock: start, toBlock: end });
    for (const log of logs) {
      const a = log.args;
      if (a.id == null || a.amountsIn == null || a.amountsOut == null) continue;
      rows.push({
        blockNumber: log.blockNumber ?? 0n,
        sender: (a.sender ?? "0x").toLowerCase(),
        binId: Number(a.id),
        volatilityAccumulator: Number(a.volatilityAccumulator ?? 0),
        quoteIn: unpackQuote(a.amountsIn, pool.quoteDecimals),
        quoteOut: unpackQuote(a.amountsOut, pool.quoteDecimals),
      });
    }
  }
  return rows;
}

function analysePool(
  pool: (typeof POOLS)[number],
  windowRows: SwapRow[],
  baselineRows: SwapRow[],
): PoolAnomalyReport {
  const sorted = [...windowRows].sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1));
  const quoteLegs = sorted.map((r) => Math.max(r.quoteIn, r.quoteOut));
  const totalQuoteVolume = quoteLegs.reduce((s, v) => s + v, 0);
  const largestSwapQuote = quoteLegs.reduce((m, v) => Math.max(m, v), 0);
  const binDriftBps =
    sorted.length >= 2 ? (sorted[sorted.length - 1].binId - sorted[0].binId) * pool.binStep : 0;
  const maxVolatilityAccumulator = sorted.reduce((m, r) => Math.max(m, r.volatilityAccumulator), 0);
  const activityRatio = baselineRows.length > 0 ? sorted.length / baselineRows.length : null;

  // Static, documented heuristics. Raw values ship alongside the flags.
  const flags: string[] = [];
  if (activityRatio !== null && activityRatio >= 2 && sorted.length >= 6) flags.push("ACTIVITY_SPIKE");
  if (Math.abs(binDriftBps) >= 50) flags.push(binDriftBps > 0 ? "BIN_DRIFT_UP" : "BIN_DRIFT_DOWN");
  if (largestSwapQuote >= 25_000) flags.push("WHALE_SWAP");
  if (maxVolatilityAccumulator >= 100_000) flags.push("VOLATILITY_SPIKE");

  return {
    pool: pool.label,
    windowHours: WINDOW_HOURS,
    swapCount: sorted.length,
    baselineSwapCount: baselineRows.length,
    activityRatio: activityRatio === null ? null : Number(activityRatio.toFixed(2)),
    uniqueTraders: new Set(sorted.map((r) => r.sender)).size,
    binDriftBps,
    maxVolatilityAccumulator,
    largestSwapQuote: Number(largestSwapQuote.toFixed(2)),
    totalQuoteVolume: Number(totalQuoteVolume.toFixed(2)),
    flags,
  };
}

export async function fetchPoolAnomalies(rpcUrl?: string): Promise<AnomalySnapshot | null> {
  try {
    const client = mainnetClient(rpcUrl);
    const latest = await client.getBlockNumber();
    const windowBlocks = BigInt(Math.floor((WINDOW_HOURS * 3600) / BLOCK_TIME_SECONDS));
    const windowFrom = latest - windowBlocks;
    const baselineFrom = windowFrom - windowBlocks;

    const pools: PoolAnomalyReport[] = [];
    for (const pool of POOLS) {
      const [windowRows, baselineRows] = await Promise.all([
        fetchSwaps(client, pool, windowFrom, latest),
        fetchSwaps(client, pool, baselineFrom, windowFrom - 1n),
      ]);
      pools.push(analysePool(pool, windowRows, baselineRows));
    }

    return {
      source: "merchant_moe_lb_mantle_mainnet",
      fetchedAt: new Date().toISOString(),
      fromBlock: windowFrom.toString(),
      toBlock: latest.toString(),
      windowHours: WINDOW_HOURS,
      pools,
      flags: [...new Set(pools.flatMap((p) => p.flags))],
    };
  } catch (error) {
    console.warn("anomaly scan unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

export function renderForPrompt(snapshot: AnomalySnapshot | null): string {
  if (!snapshot) return "";
  const lines = [
    `ON-CHAIN ANOMALY SCAN (Merchant Moe LB, Mantle mainnet, last ${snapshot.windowHours}h vs prior ${snapshot.windowHours}h):`,
  ];
  for (const p of snapshot.pools) {
    lines.push(
      `- ${p.pool}: ${p.swapCount} swaps (baseline ${p.baselineSwapCount}, ratio ${p.activityRatio ?? "n/a"}), ` +
        `${p.uniqueTraders} traders, bin drift ${p.binDriftBps} bps, ` +
        `largest swap $${p.largestSwapQuote}, volume $${p.totalQuoteVolume}, maxVA ${p.maxVolatilityAccumulator}` +
        (p.flags.length > 0 ? `, flags: ${p.flags.join("+")}` : ", no flags"),
    );
  }
  lines.push(
    snapshot.flags.length > 0
      ? `Anomaly flags raised: ${snapshot.flags.join(", ")}. Weigh these against the price data before picking direction and threshold.`
      : `No anomaly flags this window. Treat flow as routine; calibrate from price data.`,
  );
  return lines.join("\n");
}
