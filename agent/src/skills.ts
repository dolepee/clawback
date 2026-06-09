import { createPublicClient, defineChain, fallback, http, parseAbi, keccak256, toHex } from "viem";

export interface SkillsOutput {
  skillId: string;
  pair: string;
  observedPrice: string;
  observedTimestamp: number;
  source: string;
  raw: unknown;
}

const MERCHANT_MOE_POOLS = {
  WMNT_USDT: "0x365722f12ceb2063286a268b03c654df81b7c00f",
  METH_USDT: "0x3f0047606dcad6177c13742f1854fc8c999cd2b6",
} as const;

const LB_POOL_ABI = parseAbi([
  "function getActiveId() view returns (uint24)",
  "function getBinStep() view returns (uint16)",
  "function getTokenX() view returns (address)",
  "function getTokenY() view returns (address)",
]);

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const mantle = defineChain({
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mantle.xyz"] } },
});

// A single public-RPC hiccup here kills the whole daily cycle (it did twice on
// 2026-06-09), so observation reads go through a sticky-order fallback across
// independent public Mantle endpoints with per-request retries.
const MANTLE_FALLBACK_RPCS = ["https://mantle-rpc.publicnode.com", "https://mantle.drpc.org"] as const;
const SKILL_TRANSPORT_OPTS = { retryCount: 6, retryDelay: 500, timeout: 15_000 } as const;

function mantleTransport(rpcUrl: string) {
  const urls = [rpcUrl, ...MANTLE_FALLBACK_RPCS.filter((u) => u !== rpcUrl)];
  return fallback(urls.map((u) => http(u, SKILL_TRANSPORT_OPTS)), { rank: false });
}

function lbPriceTokenYPerTokenX(activeId: number, binStep: number): number {
  return Math.pow(1 + binStep / 10_000, activeId - 8_388_608);
}

async function readMantlePoolPrice(rpcUrl: string, pool: `0x${string}`) {
  const client = createPublicClient({ chain: mantle, transport: mantleTransport(rpcUrl) });
  const [activeId, binStep, tokenX, tokenY] = await Promise.all([
    client.readContract({ address: pool, abi: LB_POOL_ABI, functionName: "getActiveId" }),
    client.readContract({ address: pool, abi: LB_POOL_ABI, functionName: "getBinStep" }),
    client.readContract({ address: pool, abi: LB_POOL_ABI, functionName: "getTokenX" }),
    client.readContract({ address: pool, abi: LB_POOL_ABI, functionName: "getTokenY" }),
  ]);
  const [xSym, xDec, ySym, yDec] = await Promise.all([
    client.readContract({ address: tokenX, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: tokenX, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: tokenY, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: tokenY, abi: ERC20_ABI, functionName: "decimals" }),
  ]);
  const decimalAdjusted = lbPriceTokenYPerTokenX(Number(activeId), Number(binStep))
    * Math.pow(10, Number(xDec) - Number(yDec));
  return {
    pool,
    tokenX,
    tokenY,
    symbolX: xSym,
    symbolY: ySym,
    decimalsX: Number(xDec),
    decimalsY: Number(yDec),
    activeId: Number(activeId),
    binStep: Number(binStep),
    priceYPerX: decimalAdjusted,
  };
}

export async function runSkill(skillId: string, params: Record<string, unknown> = {}): Promise<SkillsOutput> {
  const rpcUrl = (params.rpcUrl as string) ?? process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";
  if (skillId !== "merchant_moe_lb_mantle_v1") {
    throw new Error(`unknown skillId: ${skillId}`);
  }
  const client = createPublicClient({ chain: mantle, transport: mantleTransport(rpcUrl) });
  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  const observedTimestamp = Number(block.timestamp);

  const [wmntUsdt, methUsdt] = await Promise.all([
    readMantlePoolPrice(rpcUrl, MERCHANT_MOE_POOLS.WMNT_USDT),
    readMantlePoolPrice(rpcUrl, MERCHANT_MOE_POOLS.METH_USDT),
  ]);
  const mntPriceUsdt = wmntUsdt.symbolX.toUpperCase().includes("MNT") ? wmntUsdt.priceYPerX : 1 / wmntUsdt.priceYPerX;
  const methPriceUsdt = methUsdt.symbolX.toUpperCase().includes("METH") ? methUsdt.priceYPerX : 1 / methUsdt.priceYPerX;
  const mntPerMeth = methPriceUsdt / mntPriceUsdt;

  return {
    skillId,
    pair: "MNT/mETH",
    observedPrice: mntPerMeth.toFixed(8),
    observedTimestamp,
    source: "merchant_moe_liquidity_book",
    raw: {
      block: blockNumber.toString(),
      mntPriceUsdt: mntPriceUsdt.toFixed(8),
      methPriceUsdt: methPriceUsdt.toFixed(8),
      mntPerMeth: mntPerMeth.toFixed(8),
      pools: { wmntUsdt, methUsdt },
    },
  };
}

export function hashSkillsOutput(output: SkillsOutput): `0x${string}` {
  const canonical = JSON.stringify(output, Object.keys(output).sort());
  return keccak256(toHex(canonical));
}
