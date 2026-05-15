import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
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

export type PersonaKey = "cat-scout" | "lobster-rogue";

type Direction = "above" | "below";

type PersonaConfig = {
  key: PersonaKey;
  handle: "CatScout" | "LobsterRogue";
  faction: 0 | 1;
  envKeys: string[];
  bondAmount: bigint;
  unlockPrice: bigint;
  direction: Direction;
  thresholdMultiplierBps: bigint;
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
    thresholdMultiplierBps: 9_500n,
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
  return ["cat-scout", "lobster-rogue"];
}

export function getPersona(key: string): PersonaConfig {
  if (key !== "cat-scout" && key !== "lobster-rogue") {
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

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [env("MANTLE_SEPOLIA_RPC_URL", DEFAULTS.rpc)] } },
  blockExplorers: { default: { name: "Mantle Sepolia Explorer", url: DEFAULTS.explorer } },
  testnet: true,
});

export function publicClient(): PublicClient {
  return createPublicClient({
    chain: mantleSepolia,
    transport: http(env("MANTLE_SEPOLIA_RPC_URL", DEFAULTS.rpc)),
  }) as PublicClient;
}

export function accountFromPrivateKey(privateKey: string): PrivateKeyAccount {
  return privateKeyToAccount(privateKey as Hex);
}

export function walletClient(account: PrivateKeyAccount): WalletClient {
  return createWalletClient({
    account,
    chain: mantleSepolia,
    transport: http(env("MANTLE_SEPOLIA_RPC_URL", DEFAULTS.rpc)),
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
  const skillsOutputHash = hashSkillsOutput(skillOutput);
  const thresholdPriceE8 = (pythSnapshot.priceE8 * persona.thresholdMultiplierBps) / 10_000n;
  const directionId = persona.direction === "below" ? 1 : 0;
  const predictionParams = encodeAbiParameters(
    [{ type: "uint128" }, { type: "uint8" }],
    [thresholdPriceE8, directionId],
  );

  const expirySeconds = BigInt(Number(process.env.CRON_EXPIRY_SECONDS ?? 12 * 60 * 60));
  const publicReleaseExtra = BigInt(Number(process.env.CRON_PUBLIC_RELEASE_EXTRA_SECONDS ?? 12 * 60 * 60));
  const now = BigInt(Math.floor(Date.now() / 1000));
  const expiry = now + expirySeconds;
  const thresholdUsd = Number(thresholdPriceE8) / 1e8;
  const currentUsd = Number(pythSnapshot.priceE8) / 1e8;
  const claimText =
    `[${persona.handle}] MNT will be ${persona.direction} $${thresholdUsd.toFixed(4)} by ` +
    `${new Date(Number(expiry) * 1000).toISOString()}. ` +
    `Commit price: $${currentUsd.toFixed(4)}. Skill source: Merchant Moe Liquidity Book.`;
  const claim = buildClaim({
    agentId,
    marketId: MARKET_ID_THRESHOLD,
    claimText,
    bondAmount: persona.bondAmount,
    unlockPrice: persona.unlockPrice,
    expiry: Number(expiry),
    publicReleaseAt: Number(expiry + publicReleaseExtra),
    skillsOutputHash,
  });
  const claimHash = hashClaimText(claim.claimText, claim.salt);

  await approveIfNeeded(account, addrs.usdc, addrs.clawbackEscrow, persona.bondAmount, client, wallet, "bond");

  const txHash = await wallet.writeContract({
    address: addrs.claimMarket,
    abi: CLAIM_MARKET_ABI,
    functionName: "commitClaim",
    args: [
      agentId,
      claimHash,
      persona.bondAmount,
      persona.unlockPrice,
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
    direction: persona.direction,
    commitMntPriceE8: pythSnapshot.priceE8.toString(),
    pythSnapshot: stringifyBigints(pythSnapshot),
    skillsOutputHash,
    skillsOutput: stringifyBigints(skillOutput),
    predictionParams,
    expiry: claim.expiry,
    publicReleaseAt: claim.publicReleaseAt,
    createdAt: new Date().toISOString(),
  };

  await writeProvenance(claimId, persona, commonFields, { visibility: "public" });
  await writeProvenance(claimId, persona, { ...commonFields, claimText, salt: claim.salt.toString() }, { visibility: "private" });

  console.log("CLAWBACK_CLAIM_COMMITTED");
  console.log(`persona=${persona.handle}`);
  console.log(`claimId=${claimId}`);
  console.log(`tx=${txHash}`);
  console.log(`expiry=${new Date(claim.expiry * 1000).toISOString()}`);
  console.log(`claimHash=${claimHash}`);
  console.log(`skillsOutputHash=${skillsOutputHash}`);
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
      domain: { name: "Clawback Q402", version: "1", chainId: 5003, verifyingContract: addrs.q402Adapter },
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

  for (const claimId of await claimIds(client)) {
    if (completed >= limit) break;
    const claim = await readClaim(claimId, client);
    if (claim.state !== CLAIM_STATE_COMMITTED) continue;
    if (claim.expiry > now) continue;
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
    for (const snapshot of bundle.snapshots) {
      console.log(`priceFeed=${snapshot.id} priceE8=${snapshot.priceE8} publishTime=${snapshot.publishTime}`);
    }
  }
  if (completed === 0) console.log("CLAWBACK_CLAIM_SETTLED none");
}

export async function collectClaims(): Promise<void> {
  const client = publicClient();
  const addrs = addresses();
  const payer = payerAccount();
  const payerWallet = walletClient(payer);
  const agentEntries = await Promise.all(personaKeys().map(async (key) => {
    const persona = getPersona(key);
    const account = personaAccount(persona);
    const agentId = await client.readContract({
      address: addrs.agentRegistry,
      abi: AGENT_REGISTRY_ABI,
      functionName: "agentIdByOwner",
      args: [account.address],
    });
    return { persona, account, agentId, wallet: walletClient(account) };
  }));
  let completed = 0;

  for (const claimId of await claimIds(client)) {
    const accounting = await readAccounting(claimId, client);
    if (!accounting.settled) continue;
    if (accounting.agentRight) {
      const already = await client.readContract({
        address: addrs.clawbackEscrow,
        abi: ESCROW_ABI,
        functionName: "earningsClaimed",
        args: [claimId],
      });
      if (already) continue;
      const entry = agentEntries.find((candidate) => candidate.agentId === accounting.agentId);
      if (!entry) continue;
      const txHash = await entry.wallet.writeContract({
        address: addrs.clawbackEscrow,
        abi: ESCROW_ABI,
        functionName: "claimAgentEarnings",
        args: [entry.agentId, claimId],
        account: entry.account,
        chain: mantleSepolia,
      });
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      completed++;
      console.log("CLAWBACK_EARNINGS_CLAIMED");
      console.log(`claimId=${claimId}`);
      console.log(`recipient=${entry.account.address}`);
      console.log(`tx=${txHash}`);
      console.log(`block=${receipt.blockNumber}`);
    } else {
      const [already, paid, claimable] = await Promise.all([
        client.readContract({ address: addrs.clawbackEscrow, abi: ESCROW_ABI, functionName: "refundClaimed", args: [claimId, payer.address] }),
        client.readContract({ address: addrs.clawbackEscrow, abi: ESCROW_ABI, functionName: "paidAmount", args: [payer.address, claimId] }),
        client.readContract({ address: addrs.clawbackEscrow, abi: ESCROW_ABI, functionName: "claimableRefund", args: [payer.address, claimId] }),
      ]);
      if (already || paid === 0n || (claimable[0] === 0n && claimable[1] === 0n)) continue;
      const txHash = await payerWallet.writeContract({
        address: addrs.clawbackEscrow,
        abi: ESCROW_ABI,
        functionName: "claimRefund",
        args: [claimId],
        account: payer,
        chain: mantleSepolia,
      });
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      completed++;
      console.log("CLAWBACK_REFUND_CLAIMED");
      console.log(`claimId=${claimId}`);
      console.log(`recipient=${payer.address}`);
      console.log(`amount=${claimable[0] + claimable[1]}`);
      console.log(`tx=${txHash}`);
      console.log(`block=${receipt.blockNumber}`);
    }
  }
  if (completed === 0) console.log("CLAWBACK_COLLECTED none");
}

interface PrivateClaimRecord {
  claimText?: string;
  salt?: string;
}

async function loadPrivateClaimRecord(claimId: bigint): Promise<PrivateClaimRecord | null> {
  const root = join(process.cwd(), "cron-private");
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

    const day = new Date().toISOString().slice(0, 10);
    const dir = join(process.cwd(), "cron-runs", day);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `claim-${claimId}-revealed.json`),
      `${JSON.stringify({
        kind: "claim_revealed",
        claimId: claimId.toString(),
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        claimText: record.claimText,
        revealedAt: new Date().toISOString(),
      }, null, 2)}\n`,
    );
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

  for (const actor of unique.values()) {
    const [mnt, usdc] = await Promise.all([
      client.getBalance({ address: actor.account.address }),
      client.readContract({ address: addrs.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [actor.account.address] }),
    ]);
    console.log(`${actor.label} ${actor.account.address} MNT=${mnt} USDC=${usdc}`);
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
  const root = opts.visibility === "private" ? "cron-private" : "cron-runs";
  const dir = join(process.cwd(), root, day);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `claim-${claimId}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`provenance=${root}/${day}/claim-${claimId}.json persona=${persona.handle} visibility=${opts.visibility}`);
}

function stringifyBigints<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested))) as T;
}
