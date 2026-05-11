import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { runSkill, hashSkillsOutput } from "./skills.js";
import { buildClaim, hashClaimText } from "./claim.js";
import { fetchPythPriceE8, fetchPythUpdateBundle } from "./pyth.js";

export type MarketKind = "outperform" | "threshold";

export interface Persona {
  name: string;
  faction: "cat" | "lobster";
  factionEnum: 0 | 1;
  bondAmount: bigint;
  unlockPrice: bigint;
  expirySeconds: number;
  publicReleaseExtraSeconds: number;
  market: MarketKind;
  minOutperformBps?: number;
  thresholdPriceUsd?: number;
  thresholdDirection?: "above" | "below";
  claimTemplate: (ctx: { observation: string; expirySec: number; thresholdPriceUsd?: number; minOutperformBps?: number }) => string;
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
    market: "outperform",
    minOutperformBps: 100,
    claimTemplate: ({ observation, expirySec, minOutperformBps }) =>
      `[CatScout] MNT outperforms mETH by at least ${(minOutperformBps ?? 0) / 100}% over the next ${expirySec / 3600}h. Skill observation: ${observation} MNT per mETH.`,
  },
  "lobster-rogue": {
    name: "LobsterRogue",
    faction: "lobster",
    factionEnum: 1,
    bondAmount: 10_000_000n,
    unlockPrice: 500_000n,
    expirySeconds: 6 * 60 * 60,
    publicReleaseExtraSeconds: 18 * 60 * 60,
    market: "threshold",
    thresholdPriceUsd: 0.5,
    thresholdDirection: "below",
    claimTemplate: ({ observation, expirySec, thresholdPriceUsd }) =>
      `[LobsterRogue] MNT crashes below $${thresholdPriceUsd?.toFixed(2)} within ${expirySec / 3600}h. Skill observation: ${observation} MNT per mETH.`,
  },
};

const REGISTRY_ABI = parseAbi([
  "function registerAgent(string handle, uint8 faction, bytes32 metadataHash) returns (uint256)",
  "function agentIdByOwner(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function bondedBalance(uint256) view returns (uint256)",
]);

const MARKET_ABI = parseAbi([
  "function commitClaim(uint256 agentId, bytes32 claimHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes32 skillsOutputHash, bytes predictionParams) returns (uint256)",
  "function nextClaimId() view returns (uint256)",
  "function paidUnlock(uint256, address) view returns (bool)",
  "event ClaimCommitted(uint256 indexed claimId, uint256 indexed agentId, bytes32 claimHash, bytes32 skillsOutputHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes predictionParams)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const Q402_ABI = parseAbi([
  "struct Witness { address owner; uint256 claimId; uint256 amount; uint256 deadline; bytes32 paymentId; uint256 nonce; }",
  "function accept(Witness calldata w, bytes calldata sig) external",
  "function nonceUsed(address, uint256) view returns (bool)",
]);

const ESCROW_ABI = parseAbi([
  "function claimRefund(uint256 claimId) external",
  "function claimAgentEarnings(uint256 agentId, uint256 claimId) external",
  "function claimableRefund(address user, uint256 claimId) view returns (uint256 paidBack, uint256 bonus)",
  "function paidAmount(address, uint256) view returns (uint256)",
  "function earningsClaimed(uint256) view returns (bool)",
  "function refundClaimed(uint256, address) view returns (bool)",
  "function accounting(uint256) view returns (uint256 totalPaid, uint256 bondAtStake, uint256 slashedBondPool, uint256 agentId, bool settled, bool agentRight, bytes settlementProof)",
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

export async function runPersona(personaKey: string, action: string, extra: string[] = []): Promise<void> {
  if (personaKey === "payer") {
    const claimIdStr = extra[0];
    if (!claimIdStr) throw new Error(`${action} requires a claimId argument`);
    const claimId = BigInt(claimIdStr);
    if (action === "unlock") {
      const amtArg = extra[1];
      return unlockAsPayer(claimId, amtArg ? BigInt(amtArg) : undefined);
    }
    if (action === "refund") return refundAsPayer(claimId);
    throw new Error(`unknown payer action: ${action}. supported: unlock <claimId> [amount], refund <claimId>`);
  }

  const persona = PERSONAS[personaKey];
  if (!persona) throw new Error(`unknown persona: ${personaKey}. valid: ${Object.keys(PERSONAS).join(", ")}, payer`);

  switch (action) {
    case "register":
      return register(persona);
    case "post":
      return post(persona);
    case "settle": {
      const claimIdStr = extra[0];
      if (!claimIdStr) throw new Error(`settle action requires a claimId argument`);
      return settleViaPyth(persona, BigInt(claimIdStr));
    }
    case "claim-earnings": {
      const claimIdStr = extra[0];
      if (!claimIdStr) throw new Error(`claim-earnings action requires a claimId argument`);
      return claimAgentEarnings(persona, BigInt(claimIdStr));
    }
    default:
      throw new Error(`unknown action: ${action}. supported: register, post, settle <claimId>, claim-earnings <claimId>`);
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

  const { marketId, predictionParams, commitMetadata } = await derivePredictionParams(persona);

  const claimText = persona.claimTemplate({
    observation: observation.observedPrice,
    expirySec: persona.expirySeconds,
    thresholdPriceUsd: persona.thresholdPriceUsd,
    minOutperformBps: persona.minOutperformBps,
  });
  const expirySecondsOverride = process.env.EXPIRY_SECONDS_OVERRIDE ? Number(process.env.EXPIRY_SECONDS_OVERRIDE) : null;
  const expirySeconds = expirySecondsOverride ?? persona.expirySeconds;
  const publicReleaseExtra = expirySecondsOverride ? Math.max(60, expirySecondsOverride * 2) : persona.publicReleaseExtraSeconds;
  if (expirySecondsOverride) console.log(`[${persona.name}] EXPIRY_SECONDS_OVERRIDE=${expirySecondsOverride} active (short demo claim)`);
  const claim = buildClaim({
    agentId: agentId,
    marketId,
    claimText,
    bondAmount: persona.bondAmount,
    unlockPrice: persona.unlockPrice,
    expiry: Math.floor(Date.now() / 1000) + expirySeconds,
    publicReleaseAt: Math.floor(Date.now() / 1000) + expirySeconds + publicReleaseExtra,
    skillsOutputHash: skillsHash,
  });
  const claimHash = hashClaimText(claim.claimText, claim.salt);
  console.log(`[${persona.name}] claim text: ${claim.claimText}`);
  console.log(`[${persona.name}] claimHash=${claimHash} salt=${claim.salt}`);
  console.log(`[${persona.name}] marketId=${marketId} predictionParams=${predictionParams}`);
  for (const [k, v] of Object.entries(commitMetadata)) console.log(`[${persona.name}]   ${k}: ${v}`);

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
      predictionParams,
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

const PYTH_ADAPTER_ABI = parseAbi([
  "function resolve(uint256 claimId, bytes params) payable returns (bool agentRight, bytes proof)",
  "event PythSettlement(uint256 indexed claimId, bool agentRight, int64 mntPrice, int64 ethPrice, uint256 publishTime)",
]);

const PYTH_ABI = parseAbi([
  "function getUpdateFee(bytes[] updateData) view returns (uint256)",
]);

const MARKET_READ_ABI = [
  {
    type: "function",
    name: "getClaim",
    stateMutability: "view",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "claimHash", type: "bytes32" },
          { name: "skillsOutputHash", type: "bytes32" },
          { name: "bondAmount", type: "uint256" },
          { name: "unlockPrice", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "publicReleaseAt", type: "uint64" },
          { name: "marketId", type: "uint8" },
          { name: "state", type: "uint8" },
          { name: "revealedClaimText", type: "string" },
          { name: "predictionParams", type: "bytes" },
        ],
      },
    ],
  },
] as const;

async function settleViaPyth(persona: Persona, claimId: bigint): Promise<void> {
  const { account, market, publicClient, walletClient } = await loadCtx(persona);
  const adapter = requireEnv("PYTH_SETTLEMENT_ADAPTER") as `0x${string}`;
  const pyth = requireEnv("PYTH_CONTRACT") as `0x${string}`;
  const mntFeed = requireEnv("PYTH_MNT_USD_FEED_ID") as `0x${string}`;
  const ethFeed = requireEnv("PYTH_ETH_USD_FEED_ID") as `0x${string}`;

  console.log(`[${persona.name}] settling claimId=${claimId} via PythSettlementAdapter ${adapter}`);

  const c = await publicClient.readContract({
    address: market,
    abi: MARKET_READ_ABI,
    functionName: "getClaim",
    args: [claimId],
  });
  console.log(`[${persona.name}] claim agentId=${c.agentId} marketId=${c.marketId} state=${c.state} expiry=${c.expiry}`);
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(c.expiry)) throw new Error(`claim not expired yet (expiry=${c.expiry}, now=${now}, waitSec=${Number(c.expiry) - now})`);
  if (c.state !== 0) throw new Error(`claim already resolved or revealed (state=${c.state})`);

  const feedIds: `0x${string}`[] = c.marketId === 0 ? [mntFeed, ethFeed] : [mntFeed];
  console.log(`[${persona.name}] fetching Pyth update bundle for ${feedIds.length} feed(s)...`);
  const bundle = await fetchPythUpdateBundle(feedIds);
  for (const s of bundle.snapshots) {
    console.log(`[${persona.name}]   ${s.id.slice(0, 14)}... priceE8=${s.priceE8} publishTime=${s.publishTime} (age=${now - s.publishTime}s)`);
  }

  const fee = await publicClient.readContract({
    address: pyth,
    abi: PYTH_ABI,
    functionName: "getUpdateFee",
    args: [bundle.updateData],
  });
  console.log(`[${persona.name}] Pyth update fee: ${fee} wei MNT`);

  const params = encodeAbiParameters([{ type: "bytes[]" }], [bundle.updateData]);
  console.log(`[${persona.name}] resolving on chain (msg.value=${fee})...`);
  const txHash = await walletClient.writeContract({
    address: adapter,
    abi: PYTH_ADAPTER_ABI,
    functionName: "resolve",
    args: [claimId, params],
    value: fee,
  });
  console.log(`[${persona.name}] resolve tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[${persona.name}] resolve confirmed, status=${receipt.status}, gas=${receipt.gasUsed}, block=${receipt.blockNumber}`);

  const settled = await publicClient.readContract({
    address: market,
    abi: MARKET_READ_ABI,
    functionName: "getClaim",
    args: [claimId],
  });
  console.log(`\n[${persona.name}] SETTLEMENT COMPLETE`);
  console.log(`  claimId:    ${claimId}`);
  console.log(`  new state:  ${settled.state} (1=Settled)`);
  console.log(`  marketId:   ${settled.marketId}`);
  console.log(`\n  explorer: https://sepolia.mantlescan.xyz/tx/${txHash}`);
  void account;
}

async function claimAgentEarnings(persona: Persona, claimId: bigint): Promise<void> {
  const { account, registry, escrow, publicClient, walletClient } = await loadCtx(persona);

  const agentId = await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "agentIdByOwner",
    args: [account.address],
  });
  if (agentId === 0n) throw new Error(`[${persona.name}] not registered`);

  const acct = await publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "accounting", args: [claimId] });
  const [totalPaid, bondAtStake, , acctAgentId, settled, agentRight] = acct;
  console.log(`[${persona.name}] accounting(${claimId}): totalPaid=${totalPaid} bond=${bondAtStake} agentId=${acctAgentId} settled=${settled} agentRight=${agentRight}`);
  if (!settled) throw new Error(`claim not settled yet`);
  if (!agentRight) throw new Error(`agent was wrong on this claim, no earnings owed`);
  if (acctAgentId !== agentId) throw new Error(`claim belongs to agentId=${acctAgentId}, you are agentId=${agentId}`);

  const alreadyClaimed = await publicClient.readContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "earningsClaimed",
    args: [claimId],
  });
  if (alreadyClaimed) throw new Error(`earnings already claimed`);

  const payout = totalPaid + bondAtStake;
  console.log(`[${persona.name}] claiming earnings: ${payout} USDC (totalPaid ${totalPaid} + bond ${bondAtStake})`);

  const txHash = await walletClient.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "claimAgentEarnings",
    args: [agentId, claimId],
  });
  console.log(`[${persona.name}] claim-earnings tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[${persona.name}] earnings claimed, status=${receipt.status}, gas=${receipt.gasUsed}`);
  console.log(`\n  explorer: https://sepolia.mantlescan.xyz/tx/${txHash}`);
}

async function loadPayerCtx() {
  const payerKey = requireEnv("PAYER_PRIVATE_KEY") as Hex;
  const facilitatorKey = requireEnv("FACILITATOR_PRIVATE_KEY") as Hex;
  const adapter = requireEnv("Q402_ADAPTER") as `0x${string}`;
  const escrow = requireEnv("CLAWBACK_ESCROW") as `0x${string}`;
  const usdc = requireEnv("USDC_ADDRESS") as `0x${string}`;
  const market = requireEnv("CLAIM_MARKET") as `0x${string}`;

  const payer = privateKeyToAccount(payerKey);
  const facilitator = privateKeyToAccount(facilitatorKey);
  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(MANTLE_SEPOLIA_RPC) });
  const payerWallet = createWalletClient({ account: payer, chain: mantleSepolia, transport: http(MANTLE_SEPOLIA_RPC) });
  const facilitatorWallet = createWalletClient({ account: facilitator, chain: mantleSepolia, transport: http(MANTLE_SEPOLIA_RPC) });

  return { payer, facilitator, adapter, escrow, usdc, market, publicClient, payerWallet, facilitatorWallet };
}

async function unlockAsPayer(claimId: bigint, amountOverride?: bigint): Promise<void> {
  const { payer, facilitator, adapter, escrow, usdc, market, publicClient, payerWallet, facilitatorWallet } = await loadPayerCtx();

  const claim = await publicClient.readContract({ address: market, abi: MARKET_READ_ABI, functionName: "getClaim", args: [claimId] });
  console.log(`[payer ${payer.address}] claim ${claimId}: unlockPrice=${claim.unlockPrice} state=${claim.state} expiry=${claim.expiry}`);
  if (claim.state !== 0) throw new Error(`claim not unlockable (state=${claim.state}, must be 0=Committed)`);
  const now = Math.floor(Date.now() / 1000);
  if (now >= Number(claim.expiry)) throw new Error(`claim expired (now=${now}, expiry=${claim.expiry})`);

  const amount = amountOverride ?? claim.unlockPrice;
  if (amount !== claim.unlockPrice) {
    console.log(`[payer] WARNING amount ${amount} != unlockPrice ${claim.unlockPrice}, tx will revert`);
  }

  const [bal, allowance] = await Promise.all([
    publicClient.readContract({ address: usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [payer.address] }),
    publicClient.readContract({ address: usdc, abi: ERC20_ABI, functionName: "allowance", args: [payer.address, adapter] }),
  ]);
  console.log(`[payer] USDC balance=${bal}, allowance->adapter=${allowance}`);
  if (bal < amount) throw new Error(`payer USDC ${bal} < ${amount}`);
  if (allowance < amount) {
    console.log(`[payer] approving Q402 adapter for max...`);
    const aHash = await payerWallet.writeContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [adapter, 2n ** 256n - 1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: aHash });
    console.log(`[payer] approve tx: ${aHash}`);
  }

  const nonce = BigInt(Date.now());
  const deadline = BigInt(now + 600);
  const paymentId = (`0x${nonce.toString(16).padStart(64, "0")}`) as Hex;
  const witness = { owner: payer.address, claimId, amount, deadline, paymentId, nonce };

  const sig = await payer.signTypedData({
    domain: { name: "Clawback Q402", version: "1", chainId: 5003, verifyingContract: adapter },
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
  console.log(`[payer] signed witness off-chain (sig ${sig.slice(0, 10)}...${sig.slice(-8)})`);

  const data = encodeFunctionData({ abi: Q402_ABI, functionName: "accept", args: [witness, sig] });
  console.log(`[facilitator ${facilitator.address}] submitting accept...`);
  const txHash = await facilitatorWallet.sendTransaction({ to: adapter, data });
  console.log(`[facilitator] tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[facilitator] status=${receipt.status}, gas=${receipt.gasUsed}, block=${receipt.blockNumber}`);

  const [paid, unlocked] = await Promise.all([
    publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "paidAmount", args: [payer.address, claimId] }),
    publicClient.readContract({ address: market, abi: MARKET_ABI, functionName: "paidUnlock", args: [claimId, payer.address] }),
  ]);
  console.log(`\nUNLOCK COMPLETE`);
  console.log(`  claimId:    ${claimId}`);
  console.log(`  amount:     ${amount}`);
  console.log(`  paidAmount: ${paid} (escrow)`);
  console.log(`  paidUnlock: ${unlocked} (market)`);
  console.log(`\n  explorer: https://sepolia.mantlescan.xyz/tx/${txHash}`);
}

async function refundAsPayer(claimId: bigint): Promise<void> {
  const { payer, escrow, publicClient, payerWallet } = await loadPayerCtx();

  const [claimable, alreadyClaimed, paid] = await Promise.all([
    publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "claimableRefund", args: [payer.address, claimId] }),
    publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "refundClaimed", args: [claimId, payer.address] }),
    publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: "paidAmount", args: [payer.address, claimId] }),
  ]);
  const [paidBack, bonus] = claimable;
  console.log(`[payer ${payer.address}] claim ${claimId}: paidAmount=${paid} claimable: paidBack=${paidBack} bonus=${bonus} alreadyClaimed=${alreadyClaimed}`);
  if (alreadyClaimed) throw new Error(`already refunded`);
  if (paidBack === 0n && bonus === 0n) throw new Error(`nothing to refund (claim may not be settled, agent may have been right, or you never paid)`);

  const txHash = await payerWallet.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: "claimRefund",
    args: [claimId],
  });
  console.log(`[payer] claimRefund tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[payer] refund settled, status=${receipt.status}, gas=${receipt.gasUsed}`);
  console.log(`\n  refunded:  ${paidBack} USDC base + ${bonus} bonus = ${paidBack + bonus} total`);
  console.log(`  explorer: https://sepolia.mantlescan.xyz/tx/${txHash}`);
}

async function derivePredictionParams(persona: Persona): Promise<{
  marketId: number;
  predictionParams: `0x${string}`;
  commitMetadata: Record<string, string>;
}> {
  const mntFeed = requireEnv("PYTH_MNT_USD_FEED_ID") as `0x${string}`;
  const ethFeed = requireEnv("PYTH_ETH_USD_FEED_ID") as `0x${string}`;

  if (persona.market === "outperform") {
    const minOutperformBps = persona.minOutperformBps ?? 100;
    const [mnt, eth] = await Promise.all([fetchPythPriceE8(mntFeed), fetchPythPriceE8(ethFeed)]);
    const predictionParams = encodeAbiParameters(
      [
        { type: "int64" },
        { type: "uint64" },
        { type: "uint64" },
      ],
      [BigInt(minOutperformBps), mnt.priceE8, eth.priceE8],
    );
    return {
      marketId: 0,
      predictionParams,
      commitMetadata: {
        minOutperformBps: String(minOutperformBps),
        commitMntPriceE8: mnt.priceE8.toString(),
        commitEthPriceE8: eth.priceE8.toString(),
        commitMntPriceUsd: (Number(mnt.priceE8) / 1e8).toFixed(6),
        commitEthPriceUsd: (Number(eth.priceE8) / 1e8).toFixed(2),
      },
    };
  }

  if (persona.market === "threshold") {
    const priceUsd = persona.thresholdPriceUsd;
    if (priceUsd == null) throw new Error(`persona ${persona.name} missing thresholdPriceUsd`);
    const direction = persona.thresholdDirection === "below" ? 1 : 0;
    const thresholdE8 = BigInt(Math.round(priceUsd * 1e8));
    const predictionParams = encodeAbiParameters(
      [
        { type: "uint128" },
        { type: "uint8" },
      ],
      [thresholdE8, direction],
    );
    return {
      marketId: 1,
      predictionParams,
      commitMetadata: {
        thresholdPriceUsd: priceUsd.toFixed(4),
        thresholdPriceE8: thresholdE8.toString(),
        direction: persona.thresholdDirection ?? "above",
      },
    };
  }

  throw new Error(`unsupported market: ${persona.market}`);
}

export { runSkill, hashSkillsOutput, buildClaim, hashClaimText };
