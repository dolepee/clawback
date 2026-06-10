import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  fallback,
  http,
  keccak256,
  nonceManager,
  parseAbi,
  toHex,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildClaim, hashClaimText } from "../claim.js";
import { fetchPythPriceE8, fetchPythUpdateBundle } from "../pyth.js";
import { hashSkillsOutput, runSkill, type SkillsOutput } from "../skills.js";
import { sendTelegram, usd } from "../telegram.js";

const DEFAULTS = {
  rpc: "https://rpc.sepolia.mantle.xyz",
  explorer: "https://sepolia.mantlescan.xyz",
  agentRegistry: "0x0b7B93C0E6591bD415BEDE8B8DCD57171f4A7851",
  claimMarket: "0x8C076c7452E526526De877F86BBb4BA37E027af9",
  clawbackEscrow: "0xEa02e04E9550eA556235B46d10b554b876C16d2a",
  reputationLedger: "0x02aE8215844DC8AA962e44Fd07e537F05241f8E6",
  pythSettlementAdapter: "0x78a138EB1EaB4fAcB0fe982F685AB2B29a8562d3",
  q402Adapter: "0x3Eba0528a19295d0A48EFD4c38DC4100462761aB",
  usdc: "0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd",
  pyth: "0x98046Bd286715D3B0BC227Dd7a956b83D8978603",
  mntFeed: "0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585",
  ethFeed: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
} as const;

// CLAWBACK_NETWORK=mainnet flips the whole cron + verifier stack to the
// Mantle mainnet season: chain id 5000, real USDC, contract addresses
// strictly from MAINNET_* env (never the Sepolia defaults, never the
// generic env names a local .env may set for Sepolia), bonds at one
// tenth of the Sepolia sizes, network-scoped provenance directories,
// and no MockUSDC self-minting. Default behavior (unset / "sepolia")
// is byte-identical to the original single-lane setup.
export const IS_MAINNET = (process.env.CLAWBACK_NETWORK ?? "sepolia").toLowerCase() === "mainnet";
const ECON_DIVISOR = IS_MAINNET ? 10n : 1n;

const MAINNET_DEFAULTS = {
  rpc: "https://rpc.mantle.xyz",
  explorer: "https://mantlescan.xyz",
  usdc: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
  pyth: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
} as const;

// Claim ids overlap across chains, so each lane keeps its own provenance
// and reveal-vault directories.
export const RUNS_DIR = IS_MAINNET ? "cron-runs-mainnet" : "cron-runs";
export const PRIVATE_DIR = IS_MAINNET ? "cron-private-mainnet" : "cron-private";

const AGENT_REGISTRY_ABI = parseAbi([
  "function registerAgent(string handle, uint8 faction, bytes32 metadataHash) returns (uint256)",
  "function agentIdByOwner(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
]);

const CLAIM_MARKET_ABI = parseAbi([
  "event ClaimCommitted(uint256 indexed claimId, uint256 indexed agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes predictionParams)",
  "function commitClaim(uint256 agentId, bytes32 claimHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes32 skillsOutputHash, bytes predictionParams) returns (uint256)",
  "function nextClaimId() view returns (uint256)",
  "function getClaim(uint256 claimId) view returns ((uint256 agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, uint8 state, string revealedClaimText, bytes predictionParams))",
  "function paidUnlock(uint256, address) view returns (bool)",
  "function publicReveal(uint256 claimId, string claimText, uint256 salt)",
]);

const ESCROW_ABI = parseAbi([
  "function accounting(uint256) view returns (uint256 totalPaid, uint256 bondAtStake, uint256 slashedBondPool, uint256 agentId, bool settled, bool agentRight, bytes settlementProof)",
  "function paidAmount(address, uint256) view returns (uint256)",
  "function claimableRefund(address user, uint256 claimId) view returns (uint256 paidBack, uint256 bonus)",
  "function refundClaimed(uint256, address) view returns (bool)",
  "function earningsClaimed(uint256) view returns (bool)",
  "function claimRefund(uint256 claimId)",
  "function claimAgentEarnings(uint256 agentId, uint256 claimId)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

// MockUSDC.mint is public — anyone can mint to any address. Preflight uses
// this to keep persona bond balances topped up automatically so the cron
// never fails on "bond balance 0 below required X" after a long run of
// WRONG outcomes drains a persona's USDC.
const MOCK_USDC_MINT_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
]);

const Q402_ABI = parseAbi([
  "struct Witness { address owner; uint256 claimId; uint256 amount; uint256 deadline; bytes32 paymentId; uint256 nonce; }",
  "function accept(Witness calldata w, bytes calldata sig)",
  "function nonceUsed(address, uint256) view returns (bool)",
]);

const PYTH_ABI = parseAbi(["function getUpdateFee(bytes[] updateData) view returns (uint256)"]);
const PYTH_ADAPTER_ABI = parseAbi(["function resolve(uint256 claimId, bytes params) payable returns (bool agentRight, bytes proof)"]);

const MARKET_ID_THRESHOLD = 1;

function parseClaimIdFromReceipt(logs: Log[], market: Address): bigint {
  for (const log of logs) {
    if (log.address.toLowerCase() !== market.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: CLAIM_MARKET_ABI,
        data: log.data,
        topics: log.topics,
        eventName: "ClaimCommitted",
      });
      return decoded.args.claimId as bigint;
    } catch {
      // not ClaimCommitted, keep scanning
    }
  }
  throw new Error("ClaimCommitted event not found in receipt");
}
const CLAIM_STATE_COMMITTED = 0;
const CLAIM_STATE_SETTLED = 1;
const CLAIM_STATE_PUBLICLY_REVEALED = 2;
const MAX_UINT = 2n ** 256n - 1n;

export type PersonaKey = "cat-scout" | "lobster-rogue" | "llm-scout";

type Direction = "above" | "below";

type PersonaConfig = {
  key: PersonaKey;
  handle: "CatScout" | "LobsterRogue" | "LlmScout";
  faction: 0 | 1;
  envKeys: string[];
  bondAmount: bigint;
  unlockPrice: bigint;
  direction: Direction;
  thresholdMultiplierBps: bigint;
  // When set, the cron asks an LLM to decide the threshold direction and
  // multiplier at commit time instead of using the static defaults above.
  // The LLM prompt + response is captured in the encrypted reveal blob so
  // judges can audit the model's reasoning after publicReleaseAt.
  useLlm?: boolean;
};

const PERSONAS: Record<PersonaKey, PersonaConfig> = {
  "cat-scout": {
    key: "cat-scout",
    handle: "CatScout",
    faction: 0,
    envKeys: ["CAT_AGENT_PRIVATE_KEY", "CATSCOUT_PRIVATE_KEY"],
    bondAmount: 5_000_000n,
    unlockPrice: 250_000n,
    direction: "above",
    thresholdMultiplierBps: 9_800n,
  },
  "lobster-rogue": {
    key: "lobster-rogue",
    handle: "LobsterRogue",
    faction: 1,
    envKeys: ["LOBSTER_AGENT_PRIVATE_KEY", "LOBSTERROGUE_PRIVATE_KEY"],
    bondAmount: 10_000_000n,
    unlockPrice: 500_000n,
    direction: "below",
    thresholdMultiplierBps: 9_700n,
  },
  // V2 model-driven persona. direction and thresholdMultiplierBps below are
  // used only as the fallback when every LLM provider fails. When the LLM
  // responds, those fields are overridden at commit time from the model's
  // structured decision.
  "llm-scout": {
    key: "llm-scout",
    handle: "LlmScout",
    faction: 0,
    envKeys: ["LLM_AGENT_PRIVATE_KEY", "LLMSCOUT_PRIVATE_KEY"],
    bondAmount: 5_000_000n,
    unlockPrice: 250_000n,
    direction: "above",
    thresholdMultiplierBps: 9_700n,
    useLlm: true,
  },
};

export type ClaimView = {
  agentId: bigint;
  claimHash: Hex;
  skillsOutputHash: Hex;
  bondAmount: bigint;
  unlockPrice: bigint;
  expiry: bigint;
  publicReleaseAt: bigint;
  marketId: number;
  state: number;
  revealedClaimText: string;
  predictionParams: Hex;
};

export type AccountingView = {
  totalPaid: bigint;
  bondAtStake: bigint;
  slashedBondPool: bigint;
  agentId: bigint;
  settled: boolean;
  agentRight: boolean;
  settlementProof: Hex;
};

export function personaKeys(): PersonaKey[] {
  // Explicit rotation override (e.g. the mainnet lane runs only
  // "llm-scout,lobster-rogue" to keep real-money working capital small).
  const override = process.env.CRON_PERSONAS;
  if (override) {
    const parsed = override.split(",").map((s) => s.trim()).filter(Boolean);
    for (const key of parsed) getPersona(key);
    return parsed as PersonaKey[];
  }
  // llm-scout is opt-in via env: it only enters the rotation when both the
  // wallet key and an LLM provider key are configured. This keeps the cron
  // healthy on fresh clones that have not set up the LLM yet.
  const keys: PersonaKey[] = ["cat-scout", "lobster-rogue"];
  const llmReady = (process.env.LLM_AGENT_PRIVATE_KEY || process.env.LLMSCOUT_PRIVATE_KEY) &&
    (process.env.ZAI_API_KEY || process.env.LLM_API_KEY || process.env.BANKR_LLM_KEY);
  if (llmReady) keys.push("llm-scout");
  return keys;
}

function collectPersonaKeys(): PersonaKey[] {
  const keys = personaKeys();
  if (
    !keys.includes("llm-scout") &&
    (process.env.LLM_AGENT_PRIVATE_KEY || process.env.LLMSCOUT_PRIVATE_KEY)
  ) {
    keys.push("llm-scout");
  }
  return keys;
}

// Per-network claim economics. The persona table holds the Sepolia base
// sizes; the mainnet season runs real USDC at one tenth of them.
export function personaEconomics(persona: PersonaConfig): { bondAmount: bigint; unlockPrice: bigint } {
  return {
    bondAmount: persona.bondAmount / ECON_DIVISOR,
    unlockPrice: persona.unlockPrice / ECON_DIVISOR,
  };
}

export function getPersona(key: string): PersonaConfig {
  if (key !== "cat-scout" && key !== "lobster-rogue" && key !== "llm-scout") {
    throw new Error(`unknown persona ${key}`);
  }
  return PERSONAS[key];
}

export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

function firstEnv(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error(`missing env ${keys.join(" or ")}`);
}

export function addresses() {
  if (IS_MAINNET) {
    // Mainnet contract addresses come exclusively from MAINNET_* env so a
    // local .env holding Sepolia values can never cross the lanes.
    return {
      agentRegistry: env("MAINNET_AGENT_REGISTRY") as Address,
      claimMarket: env("MAINNET_CLAIM_MARKET") as Address,
      clawbackEscrow: env("MAINNET_CLAWBACK_ESCROW") as Address,
      reputationLedger: env("MAINNET_REPUTATION_LEDGER") as Address,
      pythSettlementAdapter: env("MAINNET_PYTH_SETTLEMENT_ADAPTER") as Address,
      q402Adapter: env("MAINNET_Q402_ADAPTER") as Address,
      usdc: env("MAINNET_USDC_ADDRESS", MAINNET_DEFAULTS.usdc) as Address,
      pyth: env("MAINNET_PYTH_CONTRACT", MAINNET_DEFAULTS.pyth) as Address,
      mntFeed: env("PYTH_MNT_USD_FEED_ID", DEFAULTS.mntFeed) as Hex,
      ethFeed: env("PYTH_ETH_USD_FEED_ID", DEFAULTS.ethFeed) as Hex,
    };
  }
  return {
    agentRegistry: env("AGENT_REGISTRY", DEFAULTS.agentRegistry) as Address,
    claimMarket: env("CLAIM_MARKET", DEFAULTS.claimMarket) as Address,
    clawbackEscrow: env("CLAWBACK_ESCROW", DEFAULTS.clawbackEscrow) as Address,
    reputationLedger: env("REPUTATION_LEDGER", DEFAULTS.reputationLedger) as Address,
    pythSettlementAdapter: env("PYTH_SETTLEMENT_ADAPTER", DEFAULTS.pythSettlementAdapter) as Address,
    q402Adapter: env("Q402_ADAPTER", DEFAULTS.q402Adapter) as Address,
    usdc: env("USDC_ADDRESS", env("PAYMENT_TOKEN", DEFAULTS.usdc)) as Address,
    pyth: env("PYTH_CONTRACT", DEFAULTS.pyth) as Address,
    mntFeed: env("PYTH_MNT_USD_FEED_ID", DEFAULTS.mntFeed) as Hex,
    ethFeed: env("PYTH_ETH_USD_FEED_ID", DEFAULTS.ethFeed) as Hex,
  };
}

function primaryRpc(): string {
  return IS_MAINNET
    ? env("MANTLE_RPC_URL", MAINNET_DEFAULTS.rpc)
    : env("MANTLE_SEPOLIA_RPC_URL", DEFAULTS.rpc);
}

export const activeChain = defineChain({
  id: IS_MAINNET ? 5000 : 5003,
  name: IS_MAINNET ? "Mantle" : "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [primaryRpc()] } },
  blockExplorers: {
    default: {
      name: IS_MAINNET ? "Mantlescan" : "Mantle Sepolia Explorer",
      url: IS_MAINNET ? MAINNET_DEFAULTS.explorer : DEFAULTS.explorer,
    },
  },
  testnet: !IS_MAINNET,
});

// Legacy export name: every consumer follows CLAWBACK_NETWORK through this.
export const mantleSepolia = activeChain;

// Some Mantle Sepolia RPC providers (drpc.org in particular) return
// "Unknown block" (code 26) immediately after a tx is submitted, before they
// index it. viem's default transport surfaces that as a hard error and the
// cron crashes mid-cycle. Raising retryCount + retryDelay lets the transport
// re-poll until the receipt is indexed.
const RPC_TRANSPORT_OPTS = {
  retryCount: 8,
  retryDelay: 600,
  timeout: 15_000,
} as const;

// Sticky-order fallback: the env-configured endpoint stays primary; the
// independent public endpoints only serve requests the primary fails through
// all retries (a single dropped request killed two cron cycles on 2026-06-09).
const NETWORK_FALLBACK_RPCS = IS_MAINNET
  ? ["https://mantle-rpc.publicnode.com", "https://mantle.drpc.org"]
  : ["https://mantle-sepolia.drpc.org"];

function networkTransport() {
  const primary = primaryRpc();
  const urls = [primary, ...NETWORK_FALLBACK_RPCS.filter((u) => u !== primary)];
  return fallback(urls.map((u) => http(u, RPC_TRANSPORT_OPTS)), { rank: false });
}

export function publicClient(): PublicClient {
  return createPublicClient({
    chain: activeChain,
    transport: networkTransport(),
  }) as PublicClient;
}

export function accountFromPrivateKey(privateKey: string): PrivateKeyAccount {
  return privateKeyToAccount(privateKey as Hex, { nonceManager });
}

export function walletClient(account: PrivateKeyAccount): WalletClient {
  return createWalletClient({
    account,
    chain: activeChain,
    transport: networkTransport(),
  }) as WalletClient;
}

export function personaAccount(persona: PersonaConfig): PrivateKeyAccount {
  return accountFromPrivateKey(firstEnv(persona.envKeys));
}

export function payerAccount(): PrivateKeyAccount {
  return accountFromPrivateKey(firstEnv(["PAYER_PRIVATE_KEY"]));
}

export function settlerAccount(): PrivateKeyAccount {
  return accountFromPrivateKey(firstEnv(["SETTLER_PRIVATE_KEY", "PAYER_PRIVATE_KEY"]));
}

// Cap the reasoning fragment we put into claimText so the on-chain
// reveal stays bounded (and so a chatty model can't blow up the
// publicReveal calldata). 240 chars is generous for a 1-2 sentence
// rationale and leaves room for the surrounding metadata.
function truncateReasoning(text: string, maxLen = 240): string {
  const clean = text.replace(/\s+/g, " ").replace(/"/g, "'").trim();
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}…`;
}

// Minimum native MNT a cron actor must hold for the step to attempt any tx.
// Below this, the step prints a clean skip marker and exits 0 so the
// workflow stays green and no failure email is sent. Tune via env override.
const MIN_GAS_MNT_WEI = BigInt(process.env.CLAWBACK_CRON_MIN_GAS_WEI ?? "50000000000000000"); // 0.05 MNT

export async function requireGasOrSkip(
  account: PrivateKeyAccount,
  label: string,
  client = publicClient(),
): Promise<void> {
  const balance = await client.getBalance({ address: account.address });
  if (balance < MIN_GAS_MNT_WEI) {
    console.log(
      `CLAWBACK_CRON_SKIP_LOW_GAS step=${label} address=${account.address} balance=${balance} threshold=${MIN_GAS_MNT_WEI}`,
    );
    process.exit(0);
  }
}

export async function ensureAgent(persona: PersonaConfig, client = publicClient()): Promise<bigint> {
  const addrs = addresses();
  const account = personaAccount(persona);
  const existing = await client.readContract({
    address: addrs.agentRegistry,
    abi: AGENT_REGISTRY_ABI,
    functionName: "agentIdByOwner",
    args: [account.address],
  });
  if (existing > 0n) return existing;

  const wallet = walletClient(account);
  const metadataHash = keccak256(toHex(`${persona.handle}:daily-threshold-agent`));
  const txHash = await wallet.writeContract({
    address: addrs.agentRegistry,
    abi: AGENT_REGISTRY_ABI,
    functionName: "registerAgent",
    args: [persona.handle, persona.faction, metadataHash],
    account,
    chain: mantleSepolia,
  });
  await client.waitForTransactionReceipt({ hash: txHash });
  const agentId = await client.readContract({
    address: addrs.agentRegistry,
    abi: AGENT_REGISTRY_ABI,
    functionName: "agentIdByOwner",
    args: [account.address],
  });
  console.log(`${persona.handle} registered agentId=${agentId} tx=${txHash}`);
  return agentId;
}

export async function readClaim(claimId: bigint, client = publicClient()): Promise<ClaimView> {
  const c = await client.readContract({
    address: addresses().claimMarket,
    abi: CLAIM_MARKET_ABI,
    functionName: "getClaim",
    args: [claimId],
  });
  return {
    agentId: c.agentId,
    claimHash: c.claimHash,
    skillsOutputHash: c.skillsOutputHash,
    bondAmount: c.bondAmount,
    unlockPrice: c.unlockPrice,
    expiry: c.expiry,
    publicReleaseAt: c.publicReleaseAt,
    marketId: Number(c.marketId),
    state: Number(c.state),
    revealedClaimText: c.revealedClaimText,
    predictionParams: c.predictionParams,
  };
}

export async function readAccounting(claimId: bigint, client = publicClient()): Promise<AccountingView> {
  const result = await client.readContract({
    address: addresses().clawbackEscrow,
    abi: ESCROW_ABI,
    functionName: "accounting",
    args: [claimId],
  });
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

export async function claimIds(client = publicClient()): Promise<bigint[]> {
  const next = await client.readContract({
    address: addresses().claimMarket,
    abi: CLAIM_MARKET_ABI,
    functionName: "nextClaimId",
  });
  const ids: bigint[] = [];
  for (let id = 1n; id < next; id++) ids.push(id);
  return ids;
}

export async function commitDailyClaim(persona: PersonaConfig): Promise<void> {
  const client = publicClient();
  const account = personaAccount(persona);
  const wallet = walletClient(account);
  const addrs = addresses();
  const agentId = await ensureAgent(persona, client);

  const [skillOutput, pythSnapshot] = await Promise.all([
    runSkill("merchant_moe_lb_mantle_v1", { rpcUrl: process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz" }),
    fetchPythPriceE8(addrs.mntFeed),
  ]);

  // LLM persona path: ask the model for a fresh direction + threshold.
  // Falls back to the persona's static config when no provider responds.
  let chosenDirection: Direction = persona.direction;
  let chosenMultiplierBps: bigint = persona.thresholdMultiplierBps;
  let llmDecisionRecord: Record<string, unknown> | undefined;
  let elfaSnapshot: Awaited<ReturnType<typeof import("../elfa.js")["fetchElfaTriggers"]>> | null = null;
  if (persona.useLlm) {
    const { providersFromEnv, decideWithProviders } = await import("../llm.js");
    const { fetchElfaTriggers } = await import("../elfa.js");
    const { fetchPoolAnomalies } = await import("../anomaly.js");
    const providers = providersFromEnv();
    // Pull Elfa real-time triggers and the on-chain anomaly scan in
    // parallel. Either may resolve null (no key / RPC trouble); the
    // prompt context degrades gracefully and the cycle never dies here.
    let anomalySnapshot: Awaited<ReturnType<typeof fetchPoolAnomalies>> = null;
    [elfaSnapshot, anomalySnapshot] = await Promise.all([
      fetchElfaTriggers().catch(() => null),
      fetchPoolAnomalies().catch(() => null),
    ]);
    if (elfaSnapshot) {
      console.log(`[${persona.handle}] elfa: ${elfaSnapshot.signals.length} signals fetched at ${elfaSnapshot.fetchedAt}`);
    }
    if (anomalySnapshot) {
      const summary = anomalySnapshot.pools
        .map((p) => `${p.pool}:${p.swapCount} swaps${p.flags.length > 0 ? ` [${p.flags.join("+")}]` : ""}`)
        .join(", ");
      console.log(`[${persona.handle}] anomaly-scan: ${summary} (blocks ${anomalySnapshot.fromBlock}..${anomalySnapshot.toBlock})`);
    }
    const priceHistory = await recentPriceHistory(8);
    if (priceHistory.length > 0) {
      const prices = priceHistory.map((s) => Number(s.priceE8) / 1e8);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      console.log(`[${persona.handle}] price-history: ${priceHistory.length} snapshots, range ${min.toFixed(6)} to ${max.toFixed(6)}`);
    }
    const currentUsdPreview = Number(pythSnapshot.priceE8) / 1e8;
    const decision = await decideWithProviders(
      {
        pair: skillOutput.pair,
        observedPrice: skillOutput.observedPrice,
        mntPriceUsdt: String((skillOutput.raw as { mntPriceUsdt?: string }).mntPriceUsdt ?? ""),
        methPriceUsdt: String((skillOutput.raw as { methPriceUsdt?: string }).methPriceUsdt ?? ""),
        pythMntE8: pythSnapshot.priceE8,
        blockNumber: String((skillOutput.raw as { block?: string }).block ?? ""),
        elfaTriggers: elfaSnapshot,
        anomalyScan: anomalySnapshot,
        priceHistory,
      },
      providers,
      {
        thresholdPriceUsd: currentUsdPreview * Number(persona.thresholdMultiplierBps) / 10_000,
        direction: persona.direction,
        confidenceBps: 6000,
      },
    );
    chosenDirection = decision.direction;
    const thresholdPriceE8Llm = BigInt(Math.max(1, Math.round(decision.thresholdPriceUsd * 1e8)));
    chosenMultiplierBps = (thresholdPriceE8Llm * 10_000n) / pythSnapshot.priceE8;
    llmDecisionRecord = {
      provider: decision.model,
      direction: decision.direction,
      strategy: decision.strategy,
      thresholdPriceUsd: decision.thresholdPriceUsd,
      // On-chain confidence is mechanically calibrated from the chosen
      // threshold's safety margin. The model's own confidence call is
      // kept alongside for audit (encrypted reveal vault).
      confidenceBps: decision.confidenceBps,
      modelConfidenceBps: decision.modelConfidenceBps,
      reasoning: decision.reasoning,
      providerCount: providers.length,
      fellBack: decision.fellBack,
      // Full anomaly scan rides in provenance so the claim page can show
      // exactly what on-chain flow the model saw before it bonded.
      anomalyScan: anomalySnapshot ?? undefined,
    };
    console.log(
      `[${persona.handle}] llm: ${decision.model} → ${decision.strategy} | ${decision.direction} $${decision.thresholdPriceUsd.toFixed(4)} ` +
      `(onChainConf=${decision.confidenceBps}bps modelConf=${decision.modelConfidenceBps}bps fellBack=${decision.fellBack})`,
    );
    if (decision.fellBack && process.env.LLM_REQUIRE_PROVIDER_SUCCESS === "1") {
      throw new Error(
        `[${persona.handle}] LLM provider failed and LLM_REQUIRE_PROVIDER_SUCCESS=1; refusing to commit a baseline fallback claim`,
      );
    }
  }

  const skillsOutputHash = hashSkillsOutput(skillOutput);
  const thresholdPriceE8 = (pythSnapshot.priceE8 * chosenMultiplierBps) / 10_000n;
  const directionId = chosenDirection === "below" ? 1 : 0;
  const predictionParams = encodeAbiParameters(
    [{ type: "uint128" }, { type: "uint8" }],
    [thresholdPriceE8, directionId],
  );

  const expirySeconds = BigInt(Number(process.env.CRON_EXPIRY_SECONDS ?? 6 * 60 * 60));
  const publicReleaseExtra = BigInt(Number(process.env.CRON_PUBLIC_RELEASE_EXTRA_SECONDS ?? 12 * 60 * 60));
  const now = BigInt(Math.floor(Date.now() / 1000));
  const expiry = now + expirySeconds;
  const thresholdUsd = Number(thresholdPriceE8) / 1e8;
  const currentUsd = Number(pythSnapshot.priceE8) / 1e8;
  // Build claimText. For the LLM persona, append the model identity,
  // confidence, and a trimmed reasoning sentence so the full audit trail
  // surfaces in the ClaimPubliclyRevealed event after publicReleaseAt.
  // Judges read the reveal tx on Mantlescan and see the model's actual
  // call without needing the encrypted vault key.
  const baseClaimText =
    `[${persona.handle}] MNT will be ${chosenDirection} $${thresholdUsd.toFixed(4)} by ` +
    `${new Date(Number(expiry) * 1000).toISOString()}. ` +
    `Commit price: $${currentUsd.toFixed(4)}. Skill source: Merchant Moe Liquidity Book.`;
  const llmAnnotation = llmDecisionRecord
    ? ` Model: ${String(llmDecisionRecord.provider ?? "unknown")} ` +
      `conf=${String(llmDecisionRecord.confidenceBps ?? 0)}bps ` +
      `fellBack=${String(llmDecisionRecord.fellBack ?? false)} ` +
      `reasoning: "${truncateReasoning(String(llmDecisionRecord.reasoning ?? ""))}".` +
      (elfaSnapshot
        ? ` Elfa triggers: ${elfaSnapshot.signals.length} signals (source=${elfaSnapshot.source}).`
        : "")
    : "";
  const claimText = baseClaimText + llmAnnotation;
  const claim = buildClaim({
    agentId,
    marketId: MARKET_ID_THRESHOLD,
    claimText,
    bondAmount: personaEconomics(persona).bondAmount,
    unlockPrice: personaEconomics(persona).unlockPrice,
    expiry: Number(expiry),
    publicReleaseAt: Number(expiry + publicReleaseExtra),
    skillsOutputHash,
  });
  const claimHash = hashClaimText(claim.claimText, claim.salt);

  await approveIfNeeded(account, addrs.usdc, addrs.clawbackEscrow, personaEconomics(persona).bondAmount, client, wallet, "bond");

  const txHash = await wallet.writeContract({
    address: addrs.claimMarket,
    abi: CLAIM_MARKET_ABI,
    functionName: "commitClaim",
    args: [
      agentId,
      claimHash,
      personaEconomics(persona).bondAmount,
      personaEconomics(persona).unlockPrice,
      BigInt(claim.expiry),
      BigInt(claim.publicReleaseAt),
      MARKET_ID_THRESHOLD,
      skillsOutputHash,
      predictionParams,
    ],
    account,
    chain: mantleSepolia,
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  const claimId = parseClaimIdFromReceipt(receipt.logs, addrs.claimMarket);

  const commonFields = {
    kind: "claim_commit" as const,
    persona: persona.handle,
    agentId: agentId.toString(),
    claimId: claimId.toString(),
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    claimHash,
    marketId: MARKET_ID_THRESHOLD,
    thresholdPriceE8: thresholdPriceE8.toString(),
    thresholdPriceUsd: thresholdUsd.toFixed(8),
    direction: chosenDirection,
    commitMntPriceE8: pythSnapshot.priceE8.toString(),
    pythSnapshot: stringifyBigints(pythSnapshot),
    skillsOutputHash,
    skillsOutput: stringifyBigints(skillOutput),
    predictionParams,
    expiry: claim.expiry,
    publicReleaseAt: claim.publicReleaseAt,
    createdAt: new Date().toISOString(),
    // Public surface shows the model decision shape — provider, strategy
    // choice, mechanical on-chain confidence, and the model's own
    // confidence call. The prompt/reasoning stays in the encrypted
    // private blob until publicReleaseAt.
    elfa: elfaSnapshot
      ? {
          source: elfaSnapshot.source,
          fetchedAt: elfaSnapshot.fetchedAt,
          signalCount: elfaSnapshot.signals.length,
          signals: elfaSnapshot.signals.slice(0, 6),
        }
      : null,
    llm: llmDecisionRecord
      ? {
          provider: llmDecisionRecord.provider,
          strategy: llmDecisionRecord.strategy,
          fellBack: llmDecisionRecord.fellBack,
          confidenceBps: llmDecisionRecord.confidenceBps,
          modelConfidenceBps: llmDecisionRecord.modelConfidenceBps,
        }
      : undefined,
  };

  await writeProvenance(claimId, persona, commonFields, { visibility: "public" });
  await writeProvenance(
    claimId,
    persona,
    {
      ...commonFields,
      claimText,
      salt: claim.salt.toString(),
      // Full LLM decision (including reasoning) lives in the encrypted
      // private blob so judges can audit it after publicReveal.
      llmFull: llmDecisionRecord ?? null,
    },
    { visibility: "private" },
  );

  console.log("CLAWBACK_CLAIM_COMMITTED");
  console.log(`persona=${persona.handle}`);
  console.log(`claimId=${claimId}`);
  console.log(`tx=${txHash}`);
  console.log(`expiry=${new Date(claim.expiry * 1000).toISOString()}`);
  console.log(`claimHash=${claimHash}`);
  console.log(`skillsOutputHash=${skillsOutputHash}`);

  const econ = personaEconomics(persona);
  await sendTelegram(
    [
      `${persona.handle} bonded a sealed price call on ${activeChain.name}`,
      `Bond at risk: ${usd(econ.bondAmount)} ${IS_MAINNET ? "real USDC" : "mUSDC"} · unlock ${usd(econ.unlockPrice)} · settles ${new Date(claim.expiry * 1000).toISOString().slice(0, 16)}Z`,
      `Wrong = bond slashed, buyers refunded. Right = agent earns.`,
      `Receipt: ${activeChain.blockExplorers.default.url}/tx/${txHash}`,
    ].join("\n"),
  );
}

export async function unlockClaims(): Promise<void> {
  const client = publicClient();
  const addrs = addresses();
  const payer = payerAccount();
  const wallet = walletClient(payer);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const limit = Number(process.env.CRON_UNLOCK_LIMIT ?? 10);
  let completed = 0;

  for (const claimId of await claimIds(client)) {
    if (completed >= limit) break;
    const claim = await readClaim(claimId, client);
    if (claim.state !== CLAIM_STATE_COMMITTED) continue;
    if (claim.expiry <= now) continue;
    const alreadyUnlocked = await client.readContract({
      address: addrs.claimMarket,
      abi: CLAIM_MARKET_ABI,
      functionName: "paidUnlock",
      args: [claimId, payer.address],
    });
    if (alreadyUnlocked) continue;

    await approveIfNeeded(payer, addrs.usdc, addrs.q402Adapter, claim.unlockPrice, client, wallet, "unlock");
    const nonce = BigInt(Date.now()) + claimId;
    const deadline = now + 900n;
    const paymentId = `0x${nonce.toString(16).padStart(64, "0")}` as Hex;
    const witness = {
      owner: payer.address,
      claimId,
      amount: claim.unlockPrice,
      deadline,
      paymentId,
      nonce,
    };
    const sig = await payer.signTypedData({
      domain: { name: "Clawback Q402", version: "1", chainId: activeChain.id, verifyingContract: addrs.q402Adapter },
      types: {
        Witness: [
          { name: "owner", type: "address" },
          { name: "claimId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "paymentId", type: "bytes32" },
          { name: "nonce", type: "uint256" },
        ],
      },
      primaryType: "Witness",
      message: witness,
    });
    const data = encodeFunctionData({ abi: Q402_ABI, functionName: "accept", args: [witness, sig] });
    const txHash = await wallet.sendTransaction({ to: addrs.q402Adapter, data, account: payer, chain: mantleSepolia });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    completed++;
    console.log("CLAWBACK_Q402_UNLOCKED");
    console.log(`claimId=${claimId}`);
    console.log(`payer=${payer.address}`);
    console.log(`amount=${claim.unlockPrice}`);
    console.log(`tx=${txHash}`);
    console.log(`block=${receipt.blockNumber}`);
    await sendTelegram(
      `Claim #${claimId} unlocked for ${usd(claim.unlockPrice)} on ${activeChain.name}. The buyer is now covered by the bond.\nReceipt: ${activeChain.blockExplorers.default.url}/tx/${txHash}`,
    );
  }
  if (completed === 0) console.log("CLAWBACK_Q402_UNLOCKED none");
}

export async function settleClaims(): Promise<void> {
  const client = publicClient();
  const addrs = addresses();
  const settler = settlerAccount();
  const wallet = walletClient(settler);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const limit = Number(process.env.CRON_SETTLE_LIMIT ?? 10);
  let completed = 0;

  // Resolve newest claims first so fresh demo/user receipts are not blocked
  // behind an old testnet backlog when the cron has a per-run limit.
  for (const claimId of (await claimIds(client)).reverse()) {
    if (completed >= limit) break;
    const claim = await readClaim(claimId, client);
    if (claim.state !== CLAIM_STATE_COMMITTED) continue;
    if (claim.expiry > now) continue;
    try {
      const feedIds = claim.marketId === 0 ? [addrs.mntFeed, addrs.ethFeed] : [addrs.mntFeed];
      const bundle = await fetchPythUpdateBundle(feedIds);
      const fee = await client.readContract({
        address: addrs.pyth,
        abi: PYTH_ABI,
        functionName: "getUpdateFee",
        args: [bundle.updateData],
      });
      const params = encodeAbiParameters([{ type: "bytes[]" }], [bundle.updateData]);
      const txHash = await wallet.writeContract({
        address: addrs.pythSettlementAdapter,
        abi: PYTH_ADAPTER_ABI,
        functionName: "resolve",
        args: [claimId, params],
        value: fee,
        account: settler,
        chain: mantleSepolia,
      });
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      const accounting = await readAccounting(claimId, client);
      completed++;
      console.log("CLAWBACK_CLAIM_SETTLED");
      console.log(`claimId=${claimId}`);
      console.log(`outcome=${accounting.agentRight ? "right" : "wrong"}`);
      console.log(`tx=${txHash}`);
      console.log(`fee=${fee}`);
      console.log(`block=${receipt.blockNumber}`);
      await sendTelegram(
        `Pyth settled claim #${claimId} on ${activeChain.name}: the agent was ${accounting.agentRight ? "RIGHT. Bond returns, agent earns the unlocks." : "WRONG. Bond slashed, buyers get refunded."}\nReceipt: ${activeChain.blockExplorers.default.url}/tx/${txHash}`,
      );
      for (const snapshot of bundle.snapshots) {
        console.log(`priceFeed=${snapshot.id} priceE8=${snapshot.priceE8} publishTime=${snapshot.publishTime}`);
      }
    } catch (e) {
      const err = e as Error;
      console.log(`CLAWBACK_CLAIM_SETTLE_SKIPPED claimId=${claimId} err=${err.message.slice(0, 200)}`);
      if (completed > 0) break;
      throw err;
    }
  }
  if (completed === 0) console.log("CLAWBACK_CLAIM_SETTLED none");
}

export async function collectClaims(): Promise<void> {
  const client = publicClient();
  const addrs = addresses();
  const payer = payerAccount();
  const payerWallet = walletClient(payer);
  const agentEntries = await Promise.all(collectPersonaKeys().map(async (key) => {
    const persona = getPersona(key);
    const account = personaAccount(persona);
    const agentId = await withRetry(() => client.readContract({
      address: addrs.agentRegistry,
      abi: AGENT_REGISTRY_ABI,
      functionName: "agentIdByOwner",
      args: [account.address],
    }), 3, 800);
    return { persona, account, agentId, wallet: walletClient(account) };
  }));
  let completed = 0;
  let skipped = 0;

  const ids = await withRetry(() => claimIds(client), 3, 800);
  for (const claimId of ids) {
    // Mantle Sepolia public RPC intermittently reverts on view reads
    // (accounting / paidAmount / claimableRefund / refundClaimed / etc.)
    // for arbitrary claim IDs, even when the same call succeeds moments
    // earlier in the settle step. Isolate every per-claim read so one
    // flaky upstream node response can't kill the whole loop and stall
    // refunds / earnings for every other claim.
    try {
      await processClaimForCollect(claimId, client, addrs, payer, payerWallet, agentEntries, () => completed++);
    } catch (e) {
      skipped++;
      console.log(`CLAWBACK_COLLECT_SKIP claimId=${claimId} reason=read_or_tx_failed err=${(e as Error).message.slice(0, 160)}`);
    }
  }
  if (completed === 0 && skipped === 0) console.log("CLAWBACK_COLLECTED none");
  if (skipped > 0) console.log(`CLAWBACK_COLLECT_SKIPPED count=${skipped}`);
}

type CollectAgentEntry = {
  persona: PersonaConfig;
  account: PrivateKeyAccount;
  agentId: bigint;
  wallet: ReturnType<typeof walletClient>;
};

async function processClaimForCollect(
  claimId: bigint,
  client: PublicClient,
  addrs: ReturnType<typeof addresses>,
  payer: PrivateKeyAccount,
  payerWallet: ReturnType<typeof walletClient>,
  agentEntries: CollectAgentEntry[],
  onCompleted: () => void,
): Promise<void> {
  const accounting = await withRetry(() => readAccounting(claimId, client), 3, 800);
  if (!accounting.settled) return;
  if (accounting.agentRight) {
    const already = await withRetry(() => client.readContract({
      address: addrs.clawbackEscrow,
      abi: ESCROW_ABI,
      functionName: "earningsClaimed",
      args: [claimId],
    }), 3, 800);
    if (already) return;
    const entry = agentEntries.find((candidate) => candidate.agentId === accounting.agentId);
    if (!entry) return;
    const txHash = await entry.wallet.writeContract({
      address: addrs.clawbackEscrow,
      abi: ESCROW_ABI,
      functionName: "claimAgentEarnings",
      args: [entry.agentId, claimId],
      account: entry.account,
      chain: mantleSepolia,
    });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    onCompleted();
    console.log("CLAWBACK_EARNINGS_CLAIMED");
    console.log(`claimId=${claimId}`);
    console.log(`recipient=${entry.account.address}`);
    console.log(`tx=${txHash}`);
    console.log(`block=${receipt.blockNumber}`);
    await sendTelegram(
      `RIGHT call paid out: ${entry.persona.handle} collected bond + unlock revenue on claim #${claimId} (${activeChain.name}).\nReceipt: ${activeChain.blockExplorers.default.url}/tx/${txHash}`,
    );
  } else {
    const already = await withRetry(() => client.readContract({ address: addrs.clawbackEscrow, abi: ESCROW_ABI, functionName: "refundClaimed", args: [claimId, payer.address] }), 3, 800);
    const paid = await withRetry(() => client.readContract({ address: addrs.clawbackEscrow, abi: ESCROW_ABI, functionName: "paidAmount", args: [payer.address, claimId] }), 3, 800);
    const claimable = await withRetry(() => client.readContract({ address: addrs.clawbackEscrow, abi: ESCROW_ABI, functionName: "claimableRefund", args: [payer.address, claimId] }), 3, 800);
    if (already || paid === 0n || (claimable[0] === 0n && claimable[1] === 0n)) return;
    const txHash = await payerWallet.writeContract({
      address: addrs.clawbackEscrow,
      abi: ESCROW_ABI,
      functionName: "claimRefund",
      args: [claimId],
      account: payer,
      chain: mantleSepolia,
    });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    onCompleted();
    console.log("CLAWBACK_REFUND_CLAIMED");
    console.log(`claimId=${claimId}`);
    console.log(`recipient=${payer.address}`);
    console.log(`amount=${claimable[0] + claimable[1]}`);
    console.log(`tx=${txHash}`);
    console.log(`block=${receipt.blockNumber}`);
    await sendTelegram(
      `WRONG call clawed back on #${claimId} (${activeChain.name}): buyer refunded ${usd(claimable[0])} + ${usd(claimable[1])} bonus from the slashed bond.\nReceipt: ${activeChain.blockExplorers.default.url}/tx/${txHash}`,
    );
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number, baseMs: number): Promise<T> {
  let last: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e as Error;
      if (i === attempts - 1) throw last;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last ?? new Error("retry exhausted");
}

async function recentPriceHistory(limit: number): Promise<Array<{ publishTime: number; priceE8: bigint }>> {
  // Pulls Pyth snapshots from prior committed claim records on disk. The
  // cron-runs/ directory is checked into git so it's available on the
  // GitHub Actions runner after actions/checkout. Returns up to `limit`
  // snapshots (newest first by file scan, sorted oldest→newest at the
  // call site) so the LLM has volatility context for confidence calibration.
  const root = join(process.cwd(), RUNS_DIR);
  let days: string[];
  try {
    days = (await readdir(root)).sort().reverse();
  } catch {
    return [];
  }
  const out: Array<{ publishTime: number; priceE8: bigint }> = [];
  for (const day of days) {
    if (out.length >= limit) break;
    let files: string[];
    try {
      files = (await readdir(join(root, day))).filter((f) => f.startsWith("claim-") && f.endsWith(".json"));
    } catch {
      continue;
    }
    files.sort((a, b) => {
      const na = Number(a.replace(/^claim-(\d+)\.json$/, "$1"));
      const nb = Number(b.replace(/^claim-(\d+)\.json$/, "$1"));
      return nb - na;
    });
    for (const f of files) {
      if (out.length >= limit) break;
      try {
        const raw = await readFile(join(root, day, f), "utf8");
        const j = JSON.parse(raw) as { pythSnapshot?: { priceE8?: string; publishTime?: number | string } };
        const ps = j.pythSnapshot;
        if (ps?.priceE8 && ps?.publishTime != null) {
          out.push({ publishTime: Number(ps.publishTime), priceE8: BigInt(ps.priceE8) });
        }
      } catch {
        // skip unreadable file
      }
    }
  }
  return out;
}

interface PrivateClaimRecord {
  claimText?: string;
  salt?: string;
}

async function loadPrivateClaimRecord(claimId: bigint): Promise<PrivateClaimRecord | null> {
  const root = join(process.cwd(), PRIVATE_DIR);
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

async function findPublicCommitPath(claimId: bigint): Promise<string | null> {
  const root = join(process.cwd(), RUNS_DIR);
  let days: string[];
  try {
    days = await readdir(root);
  } catch {
    return null;
  }
  for (const day of days) {
    const path = join(root, day, `claim-${claimId}.json`);
    try {
      await readFile(path, "utf8");
      return path;
    } catch {
      // try next day
    }
  }
  return null;
}

export async function revealClaims(): Promise<void> {
  const client = publicClient();
  const addrs = addresses();
  const settler = settlerAccount();
  const wallet = walletClient(settler);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const limit = Number(process.env.CRON_REVEAL_LIMIT ?? 10);
  let completed = 0;

  for (const claimId of await claimIds(client)) {
    if (completed >= limit) break;
    const claim = await readClaim(claimId, client);
    if (claim.state === CLAIM_STATE_PUBLICLY_REVEALED) continue;
    const canReveal = claim.publicReleaseAt <= now || claim.state === CLAIM_STATE_SETTLED;
    if (!canReveal) continue;

    const record = await loadPrivateClaimRecord(claimId);
    if (!record || !record.claimText || !record.salt) {
      console.log(`CLAWBACK_REVEAL_SKIPPED claimId=${claimId} reason=no_private_artifact`);
      continue;
    }

    const txHash = await wallet.writeContract({
      address: addrs.claimMarket,
      abi: CLAIM_MARKET_ABI,
      functionName: "publicReveal",
      args: [claimId, record.claimText, BigInt(record.salt)],
      account: settler,
      chain: mantleSepolia,
    });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    completed++;
    console.log("CLAWBACK_CLAIM_REVEALED");
    console.log(`claimId=${claimId}`);
    console.log(`tx=${txHash}`);
    console.log(`block=${receipt.blockNumber}`);

    const reveal = {
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      claimText: record.claimText,
      revealedAt: new Date().toISOString(),
    };
    const commitPath = await findPublicCommitPath(claimId);
    if (commitPath) {
      const existing = JSON.parse(await readFile(commitPath, "utf8")) as Record<string, unknown>;
      existing.reveal = reveal;
      await writeFile(commitPath, `${JSON.stringify(existing, null, 2)}\n`);
      console.log(`provenance=${commitPath} reveal=merged`);
    } else {
      const day = new Date().toISOString().slice(0, 10);
      const dir = join(process.cwd(), RUNS_DIR, day);
      await mkdir(dir, { recursive: true });
      const path = join(dir, `claim-${claimId}.json`);
      await writeFile(
        path,
        `${JSON.stringify({ kind: "claim_revealed_only", claimId: claimId.toString(), ...reveal }, null, 2)}\n`,
      );
      console.log(`provenance=${path} reveal=standalone`);
    }
  }

  if (completed === 0) console.log("CLAWBACK_CLAIM_REVEALED none");
}

export async function preflight(): Promise<void> {
  const client = publicClient();
  const addrs = addresses();
  const actors = [
    ...personaKeys().map((key) => ({ label: getPersona(key).handle, account: personaAccount(getPersona(key)) })),
    { label: "Payer", account: payerAccount() },
    { label: "Settler", account: settlerAccount() },
  ];
  const unique = new Map<string, { label: string; account: PrivateKeyAccount }>();
  for (const actor of actors) unique.set(actor.account.address.toLowerCase(), actor);

  // Self-healing USDC top-up: when any persona / payer / settler falls
  // below the threshold, the payer wallet mints fresh mUSDC straight to
  // that address. MockUSDC.mint is permissionless on the deployed
  // contract, so this works without any privileged role.
  const MIN_USDC_BALANCE = 50_000_000n; // 50 mUSDC
  const TOPUP_AMOUNT = 1_000_000_000n; // 1000 mUSDC
  const minter = payerAccount();
  const minterWallet = walletClient(minter);
  for (const actor of unique.values()) {
    const [mnt, usdc] = await Promise.all([
      client.getBalance({ address: actor.account.address }),
      client.readContract({ address: addrs.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [actor.account.address] }),
    ]);
    console.log(`${actor.label} ${actor.account.address} MNT=${mnt} USDC=${usdc}`);
    // Real USDC is never minted: on mainnet a low balance is reported and
    // the commit/unlock step fails loudly if truly short.
    if (IS_MAINNET) {
      if (usdc === 0n) console.warn(`  ! ${actor.label} holds no mainnet USDC; bond/unlock will revert if it needs any`);
      continue;
    }
    if (usdc < MIN_USDC_BALANCE) {
      console.log(`  → topping up ${actor.label} with ${TOPUP_AMOUNT} mUSDC (current ${usdc} < min ${MIN_USDC_BALANCE})`);
      const txHash = await minterWallet.writeContract({
        address: addrs.usdc,
        abi: MOCK_USDC_MINT_ABI,
        functionName: "mint",
        args: [actor.account.address, TOPUP_AMOUNT],
        account: minter,
        chain: mantleSepolia,
      });
      await client.waitForTransactionReceipt({ hash: txHash });
      console.log(`  ✓ minted ${TOPUP_AMOUNT} mUSDC to ${actor.label} tx=${txHash}`);
    }
  }
  for (const key of personaKeys()) {
    const persona = getPersona(key);
    const account = personaAccount(persona);
    const agentId = await ensureAgent(persona, client);
    const allowance = await client.readContract({
      address: addrs.usdc,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, addrs.clawbackEscrow],
    });
    console.log(`${persona.handle} agentId=${agentId} escrowAllowance=${allowance}`);
  }
  console.log("CLAWBACK_CRON_PREFLIGHT_VALID");
}

async function approveIfNeeded(
  account: PrivateKeyAccount,
  token: Address,
  spender: Address,
  amount: bigint,
  client: PublicClient,
  wallet: WalletClient,
  label: string,
): Promise<void> {
  const [balance, allowance] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [account.address, spender] }),
  ]);
  if (balance < amount) throw new Error(`${label} balance ${balance} below required ${amount} for ${account.address}`);
  if (allowance >= amount) return;
  const txHash = await wallet.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, MAX_UINT],
    account,
    chain: mantleSepolia,
  });
  await client.waitForTransactionReceipt({ hash: txHash });
  console.log(`${label} approval tx=${txHash}`);
}

async function writeProvenance(
  claimId: bigint,
  persona: PersonaConfig,
  payload: unknown,
  opts: { visibility: "public" | "private" } = { visibility: "public" },
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const root = opts.visibility === "private" ? PRIVATE_DIR : RUNS_DIR;
  const dir = join(process.cwd(), root, day);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `claim-${claimId}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`provenance=${root}/${day}/claim-${claimId}.json persona=${persona.handle} visibility=${opts.visibility}`);
}

function stringifyBigints<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested))) as T;
}
