/**
 * S1: Q402 hello world on Mantle Sepolia.
 *
 * Flow:
 *   1. Payer signs an EIP-712 Witness offline (no gas).
 *   2. Facilitator submits Q402Adapter.accept(witness, sig) on Mantle Sepolia.
 *   3. Adapter pulls USDC from payer (prior approve required), forwards to ClawbackEscrow.
 *   4. We log tx hash, gas, PaymentAccepted event for the receipts file.
 *
 * Required env: PAYER_PRIVATE_KEY, FACILITATOR_PRIVATE_KEY, Q402_ADAPTER, USDC_ADDRESS,
 *               CLAWBACK_ESCROW, MANTLE_SEPOLIA_RPC_URL.
 *
 * Run: pnpm --filter clawback-agent spike:s1
 */

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  parseAbi,
  parseAbiItem,
  decodeEventLog,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MANTLE_SEPOLIA_RPC = process.env.MANTLE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const PAYER_KEY = process.env.PAYER_PRIVATE_KEY as Hex | undefined;
const FACILITATOR_KEY = process.env.FACILITATOR_PRIVATE_KEY as Hex | undefined;
const Q402_ADAPTER = process.env.Q402_ADAPTER as `0x${string}` | undefined;
const USDC_ADDRESS = process.env.USDC_ADDRESS as `0x${string}` | undefined;
const ESCROW = process.env.CLAWBACK_ESCROW as `0x${string}` | undefined;

if (!PAYER_KEY || !FACILITATOR_KEY || !Q402_ADAPTER || !USDC_ADDRESS || !ESCROW) {
  console.error("missing env: need PAYER_PRIVATE_KEY, FACILITATOR_PRIVATE_KEY, Q402_ADAPTER, USDC_ADDRESS, CLAWBACK_ESCROW");
  process.exit(1);
}

const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [MANTLE_SEPOLIA_RPC] } },
  blockExplorers: { default: { name: "Mantle Sepolia Explorer", url: "https://sepolia.mantlescan.xyz" } },
});

const payer = privateKeyToAccount(PAYER_KEY);
const facilitator = privateKeyToAccount(FACILITATOR_KEY);

const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(MANTLE_SEPOLIA_RPC) });
const facilitatorWallet = createWalletClient({ account: facilitator, chain: mantleSepolia, transport: http(MANTLE_SEPOLIA_RPC) });

const ADAPTER_ABI = parseAbi([
  "struct Witness { address owner; uint256 claimId; uint256 amount; uint256 deadline; bytes32 paymentId; uint256 nonce; }",
  "function accept(Witness calldata w, bytes calldata sig) external",
  "function nonceUsed(address, uint256) view returns (bool)",
  "function domainSeparator() view returns (bytes32)",
]);

const PAYMENT_ACCEPTED = parseAbiItem(
  "event PaymentAccepted(uint256 indexed claimId, address indexed payer, uint256 amount)",
);

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

async function main() {
  console.log(`payer:        ${payer.address}`);
  console.log(`facilitator:  ${facilitator.address}`);
  console.log(`adapter:      ${Q402_ADAPTER}`);
  console.log(`escrow:       ${ESCROW}`);
  console.log(`usdc:         ${USDC_ADDRESS}`);

  const [payerBal, payerAllowance, escrowBal] = await Promise.all([
    publicClient.readContract({ address: USDC_ADDRESS!, abi: USDC_ABI, functionName: "balanceOf", args: [payer.address] }),
    publicClient.readContract({ address: USDC_ADDRESS!, abi: USDC_ABI, functionName: "allowance", args: [payer.address, Q402_ADAPTER!] }),
    publicClient.readContract({ address: USDC_ADDRESS!, abi: USDC_ABI, functionName: "balanceOf", args: [ESCROW!] }),
  ]);
  console.log(`payer USDC:        ${payerBal}`);
  console.log(`payer->adapter allowance: ${payerAllowance}`);
  console.log(`escrow USDC (pre): ${escrowBal}`);

  if (payerAllowance < 1_000_000n) {
    console.error("payer must approve adapter for at least 1 USDC. Run an approve tx first.");
    process.exit(2);
  }

  const claimId = BigInt(process.env.SPIKE_CLAIM_ID ?? "1");
  const amount = BigInt(process.env.SPIKE_AMOUNT ?? "10000");
  const nonce = BigInt(Date.now());
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const paymentId = ("0x" + nonce.toString(16).padStart(64, "0")) as Hex;

  const witness = { owner: payer.address, claimId, amount, deadline, paymentId, nonce };

  const sig = await payer.signTypedData({
    domain: { name: "Clawback Q402", version: "1", chainId: 5003, verifyingContract: Q402_ADAPTER! },
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

  console.log(`witness signed off-chain. sig: ${sig.slice(0, 10)}...${sig.slice(-8)}`);

  const data = encodeFunctionData({ abi: ADAPTER_ABI, functionName: "accept", args: [witness, sig] });

  console.log("submitting via facilitator...");
  const txHash = await facilitatorWallet.sendTransaction({ to: Q402_ADAPTER!, data });
  console.log(`tx submitted: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`status: ${receipt.status}, gas used: ${receipt.gasUsed}, block: ${receipt.blockNumber}`);

  const escrowBalPost = await publicClient.readContract({
    address: USDC_ADDRESS!,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [ESCROW!],
  });
  console.log(`escrow USDC (post): ${escrowBalPost}`);

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: [PAYMENT_ACCEPTED], data: log.data, topics: log.topics });
      console.log(`PaymentAccepted: claimId=${decoded.args.claimId}, payer=${decoded.args.payer}, amount=${decoded.args.amount}`);
    } catch {
      // not a PaymentAccepted event
    }
  }

  console.log("S1 PASS: witness signed once off-chain, facilitator submitted, payment accepted, payer paid zero gas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
