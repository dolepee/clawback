import { parseAbi, type Address } from "viem";
import {
  ESCROW_ABI,
  CLAIM_MARKET_ABI,
  Q402_ABI,
  addresses,
  blockExplorerTx,
  fail,
  findPaymentSettledLogs,
  formatUsdc,
  pad,
  parseClaimIdArg,
  parseOptionalAddressArg,
  pass,
  publicClient,
} from "./lib.js";

async function main() {
  const claimId = parseClaimIdArg();
  const overridePayer = parseOptionalAddressArg();
  const client = publicClient();
  const addrs = addresses();

  console.log("CLAWBACK_Q402");
  console.log(`${pad("claim id:")}${claimId}`);
  console.log(`${pad("adapter:")}${addrs.q402Adapter} on Mantle Sepolia (chain id 5003)`);

  const logs = await findPaymentSettledLogs(claimId, client);
  if (logs.length === 0) fail("CLAWBACK_Q402", `no PaymentSettled events for claim ${claimId}`);

  console.log(`${pad("paid unlocks count:")}${logs.length}`);
  for (const log of logs) {
    const args = log.args as { payer: Address; amount: bigint; paymentId: `0x${string}` };
    console.log(
      `${pad("- payer:")}${args.payer} amount=${formatUsdc(args.amount)} paymentId=${args.paymentId} tx=${log.transactionHash} ${blockExplorerTx(log.transactionHash!)}`,
    );
  }

  const payer = overridePayer ?? (logs[0].args as { payer: Address }).payer;
  console.log(`${pad("validating payer:")}${payer}`);

  const [paidUnlock, paidAmount] = await Promise.all([
    client.readContract({ address: addrs.claimMarket, abi: CLAIM_MARKET_ABI, functionName: "paidUnlock", args: [claimId, payer] }),
    client.readContract({ address: addrs.clawbackEscrow, abi: ESCROW_ABI, functionName: "paidAmount", args: [payer, claimId] }),
  ]);
  console.log(`${pad("paidUnlock[claim,payer]:")}${paidUnlock ? "yes" : "no"}`);
  console.log(`${pad("escrow paidAmount:")}${formatUsdc(paidAmount)}`);
  if (!paidUnlock) fail("CLAWBACK_Q402", "ClaimMarket.paidUnlock returned false; Q402Adapter never recorded acceptance");
  if (paidAmount === 0n) fail("CLAWBACK_Q402", "Escrow paidAmount is zero; funds did not route");

  const adapterAbi = parseAbi([
    "function nonceUsed(address, uint256) view returns (bool)",
  ]);
  const args = logs[0].args as { paymentId: `0x${string}` };
  const nonce = BigInt(args.paymentId);
  const nonceUsed = await client.readContract({
    address: addrs.q402Adapter,
    abi: adapterAbi,
    functionName: "nonceUsed",
    args: [payer, nonce],
  });
  console.log(`${pad("witness nonce used:")}${nonceUsed ? "yes (replay impossible)" : "no (would allow replay — investigate)"}`);
  if (!nonceUsed) fail("CLAWBACK_Q402", "witness nonce not marked used in Q402Adapter");

  pass("CLAWBACK_Q402");
}

main().catch((err) => {
  console.error("CLAWBACK_Q402_ERROR", err?.message ?? err);
  process.exit(2);
});
