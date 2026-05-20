import {
  STATE_LABELS,
  addresses,
  blockExplorerTx,
  decodePythProof,
  fail,
  findPythSettlementLog,
  formatTimestamp,
  formatUsdc,
  pad,
  parseClaimIdArg,
  pass,
  publicClient,
  readAccounting,
  readAgent,
  readAgentScore,
  readClaim,
} from "./lib.js";

async function main() {
  const claimId = parseClaimIdArg();
  const client = publicClient();
  const addrs = addresses();

  console.log("CLAWBACK_SETTLEMENT");
  console.log(`${pad("claim id:")}${claimId}`);

  const claim = await readClaim(claimId, client);
  if (claim.state === 0) fail("CLAWBACK_SETTLEMENT", "claim still in Committed state, not settled yet");
  const accounting = await readAccounting(claimId, client);
  if (!accounting.settled) fail("CLAWBACK_SETTLEMENT", "escrow accounting has settled=false");

  console.log(`${pad("state:")}${STATE_LABELS[claim.state] ?? claim.state}`);
  console.log(`${pad("settlement adapter:")}PythSettlementAdapter (${addrs.pythSettlementAdapter})`);
  console.log(`${pad("settlement outcome:")}agent ${accounting.agentRight ? "right" : "wrong"}`);

  const proof = decodePythProof(accounting.settlementProof);
  if (!proof) fail("CLAWBACK_SETTLEMENT", "settlementProof did not decode as (int64,int64,uint256,uint8)");
  const mntUsd = Number(proof.mntPrice) / 1e8;
  const ethUsd = Number(proof.ethPrice) / 1e8;
  console.log(`${pad("pyth proof:")}mntPriceE8=${proof.mntPrice} (≈$${mntUsd.toFixed(6)}), ethPriceE8=${proof.ethPrice} (≈$${ethUsd.toFixed(4)})`);
  console.log(`${pad("pyth publish time:")}${formatTimestamp(proof.publishTime)} (unix ${proof.publishTime})`);

  const log = await findPythSettlementLog(claimId, client);
  if (!log) fail("CLAWBACK_SETTLEMENT", "no PythSettlement event in adapter log range");
  console.log(`${pad("settle tx:")}${log.transactionHash} ${blockExplorerTx(log.transactionHash!)}`);
  console.log(`${pad("settle block:")}${log.blockNumber}`);

  console.log(`${pad("bond at risk:")}${formatUsdc(accounting.bondAtStake)}`);
  console.log(`${pad("total paid by buyers:")}${formatUsdc(accounting.totalPaid)}`);
  console.log(`${pad("slashed bond pool:")}${formatUsdc(accounting.slashedBondPool)}`);

  const score = await readAgentScore(claim.agentId, client);
  const agent = await readAgent(claim.agentId, client);
  console.log(
    `${pad("reputation now:")}${agent.handle} accuracyBps=${score.accuracyBps} wins=${score.wins} losses=${score.losses} totalBonded=${formatUsdc(score.totalBonded)} totalSlashed=${formatUsdc(score.totalSlashed)} totalEarned=${formatUsdc(score.totalEarned)}`,
  );
  pass("CLAWBACK_SETTLEMENT");
}

main().catch((err) => {
  console.error("CLAWBACK_SETTLEMENT_ERROR", err?.message ?? err);
  process.exit(2);
});
