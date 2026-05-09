/**
 * S2: Skills hello world.
 *
 * Original plan was to use the Byreal Skills CLI for Mantle price quotes.
 * Reality (verified 2026-05-10): Byreal is a Solana CLMM DEX, not Mantle.
 * `byreal-cli` cannot read Mantle pools. Falling back to direct Mantle RPC
 * reads of Merchant Moe Liquidity Book pools per SPIKES.md S2 fallback.
 *
 * This script reads two Liquidity Book pools on Mantle mainnet, derives an
 * MNT/mETH ratio, hashes the observation, and prints a SkillsOutput JSON
 * compatible with agent/src/skills.ts.
 *
 * Run: pnpm --filter clawback-agent tsx src/spikes/s2-skills.ts
 */

import { createPublicClient, http, parseAbi, defineChain } from "viem";
import { hashSkillsOutput, type SkillsOutput } from "../skills.js";

const MANTLE_MAINNET_RPC = process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz";

const mantle = defineChain({
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [MANTLE_MAINNET_RPC] } },
});

const client = createPublicClient({ chain: mantle, transport: http(MANTLE_MAINNET_RPC) });

const LB_POOL_ABI = parseAbi([
  "function getActiveId() view returns (uint24)",
  "function getBinStep() view returns (uint16)",
  "function getTokenX() view returns (address)",
  "function getTokenY() view returns (address)",
]);

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

const POOLS = {
  WMNT_USDT: "0x365722f12ceb2063286a268b03c654df81b7c00f" as const,
  METH_USDT: "0x3f0047606dcad6177c13742f1854fc8c999cd2b6" as const,
};

function lbPriceTokenYPerTokenX(activeId: number, binStep: number): number {
  const base = 1 + binStep / 10_000;
  const exponent = activeId - 8_388_608;
  return Math.pow(base, exponent);
}

async function readPoolPrice(pool: `0x${string}`) {
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

  const rawPrice = lbPriceTokenYPerTokenX(Number(activeId), Number(binStep));
  const decimalAdjusted = rawPrice * Math.pow(10, Number(xDec) - Number(yDec));

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

async function main() {
  console.log("S2: reading Merchant Moe Liquidity Book pools on Mantle mainnet...");

  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  const observedTimestamp = Number(block.timestamp);

  const [wmntUsdt, methUsdt] = await Promise.all([
    readPoolPrice(POOLS.WMNT_USDT),
    readPoolPrice(POOLS.METH_USDT),
  ]);

  const mntPriceUsdt = wmntUsdt.symbolX.toUpperCase().includes("MNT") ? wmntUsdt.priceYPerX : 1 / wmntUsdt.priceYPerX;
  const methPriceUsdt = methUsdt.symbolX.toUpperCase().includes("METH") ? methUsdt.priceYPerX : 1 / methUsdt.priceYPerX;
  const mntPerMeth = methPriceUsdt / mntPriceUsdt;

  const observation: SkillsOutput = {
    skillId: "merchant_moe_lb_mantle_v1",
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

  const hash = hashSkillsOutput(observation);

  console.log(JSON.stringify({ observation, hash }, null, 2));
  console.log(`\nS2 PASS: skillsOutputHash = ${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
