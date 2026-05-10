import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { runSkill, hashSkillsOutput } from "./skills.js";
import { buildClaim, hashClaimText } from "./claim.js";

export interface Persona {
  name: string;
  faction: "cat" | "lobster";
  factionEnum: 0 | 1;
  bondAmount: bigint;
  unlockPrice: bigint;
  expirySeconds: number;
  publicReleaseExtraSeconds: number;
  claimTemplate: (observation: string, expirySec: number) => string;
}

export const PERSONAS: Record<string, Persona> = {
  "cat-scout": {
    name: "CatScout",
    faction: "cat",
    factionEnum: 0,
    bondAmount: 5_000_000n,
    unlockPrice: 250_000n,
    expirySeconds: 6 * 60 * 60,
    publicReleaseExtraSeconds: 18 * 60 * 60,
    claimTemplate: (obs, sec) =>
      `[CatScout] MNT outperforms mETH over the next ${sec / 3600}h. Observation: ${obs} MNT per mETH.`,
  },
  "lobster-rogue": {
    name: "LobsterRogue",
    faction: "lobster",
    factionEnum: 1,
    bondAmount: 10_000_000n,
    unlockPrice: 500_000n,
    expirySeconds: 6 * 60 * 60,
    publicReleaseExtraSeconds: 18 * 60 * 60,
    claimTemplate: (obs, sec) =>
      `[LobsterRogue] mETH dumps vs MNT over the next ${sec / 3600}h. Observation: ${obs} MNT per mETH.`,
  },
};

const REGISTRY_ABI = parseAbi([
  "function registerAgent(string handle, uint8 faction, bytes32 metadataHash) returns (uint256)",
  "function agentIdByOwner(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function bondedBalance(uint256) view returns (uint256)",
]);

const MARKET_ABI = parseAbi([
  "function commitClaim(uint256 agentId, bytes32 claimHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes32 skillsOutputHash) returns (uint256)",
  "function nextClaimId() view returns (uint256)",
  "event ClaimCommitted(uint256 indexed claimId, uint256 indexed agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const MANTLE_SEPOLIA_RPC = process.env.MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [MANTLE_SEPOLIA_RPC] } },
  blockExplorers: { default: { name: "Mantle Sepolia Explorer", url: "https://sepolia.mantlescan.xyz" } },
});

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env: ${key}`);
  return v;
}

export async function runPersona(personaKey: string, action: string): Promise<void> {
  const persona = PERSONAS[personaKey];
  if (!persona) throw new Error(`unknown persona: ${personaKey}. valid: ${Object.keys(PERSONAS).join(", ")}`);

  switch (action) {
    case "register":
      return register(persona);
    case "post":
      return post(persona);
    default:
      throw new Error(`unknown action: ${action}. supported: register, post`);
  }
}

async function loadCtx(persona: Persona) {
  const agentKey = requireEnv(`${persona.name.toUpperCase()}_PRIVATE_KEY`);
  const account = privateKeyToAccount(agentKey as Hex);
  const registry = requireEnv("AGENT_REGISTRY") as `0x${string}`;
  const market = requireEnv("CLAIM_MARKET") as `0x${string}`;
  const escrow = requireEnv("CLAWBACK_ESCROW") as `0x${string}`;
  const usdc = requireEnv("USDC_ADDRESS") as `0x${string}`;

  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(MANTLE_SEPOLIA_RPC) });
  const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(MANTLE_SEPOLIA_RPC) });

  return { account, registry, market, escrow, usdc, publicClient, walletClient };
}

async function register(persona: Persona): Promise<void> {
  const { account, registry, publicClient, walletClient } = await loadCtx(persona);
  console.log(`[${persona.name}] checking registration for ${account.address}`);

  const existing = await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "agentIdByOwner",
    args: [account.address],
  });
  if (existing > 0n) {
    console.log(`[${persona.name}] already registered as agentId=${existing}`);
    return;
  }

  const metadataHash = `0x${Buffer.from(persona.name).toString("hex").padEnd(64, "0")}` as Hex;
  const hash = await walletClient.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "registerAgent",
    args: [persona.name, persona.factionEnum, metadataHash],
  });
  console.log(`[${persona.name}] register tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[${persona.name}] registered, gas=${receipt.gasUsed}`);
  const agentId = await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "agentIdByOwner",
    args: [account.address],
  });
  console.log(`[${persona.name}] agentId=${agentId}`);
}

async function post(persona: Persona): Promise<void> {
  const { account, registry, market, escrow, usdc, publicClient, walletClient } = await loadCtx(persona);

  const agentId = await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "agentIdByOwner",
    args: [account.address],
  });
  if (agentId === 0n) throw new Error(`[${persona.name}] not registered. run action=register first`);
  console.log(`[${persona.name}] agentId=${agentId}, owner=${account.address}`);

  console.log(`[${persona.name}] reading Merchant Moe pools for skills observation...`);
  const observation = await runSkill("merchant_moe_lb_mantle_v1", { rpcUrl: process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz" });
  const skillsHash = hashSkillsOutput(observation);
  console.log(`[${persona.name}] observed ${observation.observedPrice} ${observation.pair} at block ${(observation.raw as any).block}`);
  console.log(`[${persona.name}] skillsOutputHash=${skillsHash}`);

  const claimText = persona.claimTemplate(observation.observedPrice, persona.expirySeconds);
  const claim = buildClaim({
    agentId: agentId,
    marketId: 0,
    claimText,
    bondAmount: persona.bondAmount,
    unlockPrice: persona.unlockPrice,
    expiry: Math.floor(Date.now() / 1000) + persona.expirySeconds,
    publicReleaseAt: Math.floor(Date.now() / 1000) + persona.expirySeconds + persona.publicReleaseExtraSeconds,
    skillsOutputHash: skillsHash,
  });
  const claimHash = hashClaimText(claim.claimText, claim.salt);
  console.log(`[${persona.name}] claim text: ${claim.claimText}`);
  console.log(`[${persona.name}] claimHash=${claimHash} salt=${claim.salt}`);

  const allowance = await publicClient.readContract({
    address: usdc,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, escrow],
  });
  if (allowance < persona.bondAmount) {
    console.log(`[${persona.name}] approving escrow for USDC bond...`);
    const approveHash = await walletClient.writeContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [escrow, 2n ** 256n - 1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`[${persona.name}] approve tx: ${approveHash}`);
  }

  const balance = await publicClient.readContract({
    address: usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < persona.bondAmount) {
    throw new Error(`[${persona.name}] need at least ${persona.bondAmount} USDC for bond, have ${balance}. mint via MockUSDC.mint`);
  }

  console.log(`[${persona.name}] committing claim on chain...`);
  const txHash = await walletClient.writeContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "commitClaim",
    args: [
      agentId,
      claimHash,
      persona.bondAmount,
      persona.unlockPrice,
      BigInt(claim.expiry),
      BigInt(claim.publicReleaseAt),
      claim.marketId,
      skillsHash,
    ],
  });
  console.log(`[${persona.name}] commit tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[${persona.name}] commit confirmed, gas=${receipt.gasUsed}, block=${receipt.blockNumber}`);

  const nextId = await publicClient.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "nextClaimId",
  });
  const claimId = nextId - 1n;
  console.log(`\n[${persona.name}] CLAIM POSTED`);
  console.log(`  claimId:           ${claimId}`);
  console.log(`  bond locked:       ${persona.bondAmount} USDC (6 decimals)`);
  console.log(`  unlock price:      ${persona.unlockPrice} USDC`);
  console.log(`  expiry:            ${new Date(claim.expiry * 1000).toISOString()}`);
  console.log(`  publicReleaseAt:   ${new Date(claim.publicReleaseAt * 1000).toISOString()}`);
  console.log(`  claimHash:         ${claimHash}`);
  console.log(`  skillsOutputHash:  ${skillsHash}`);
  console.log(`  reveal salt:       ${claim.salt}  (KEEP THIS, needed for publicReveal)`);
  console.log(`\n  explorer: https://sepolia.mantlescan.xyz/tx/${txHash}`);
}

export { runSkill, hashSkillsOutput, buildClaim, hashClaimText };
