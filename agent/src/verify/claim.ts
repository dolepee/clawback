import { keccak256, encodePacked } from "viem";
import {
  STATE_LABELS,
  MARKET_LABELS,
  FACTION_LABELS,
  addresses,
  blockExplorerTx,
  decodePrediction,
  fail,
  findCommitEventLog,
  formatTimestamp,
  formatUsdc,
  loadPrivateClaimRecord,
  pad,
  parseClaimIdArg,
  pass,
  publicClient,
  readAccounting,
  readAgent,
  readClaim,
} from "./lib.js";

async function main() {
  const claimId = parseClaimIdArg();
  const client = publicClient();
  const addrs = addresses();

  console.log("CLAWBACK_CLAIM");
  console.log(`${pad("claim id:")}${claimId}`);

  const claim = await readClaim(claimId, client);
  if (!claim.agentId) fail("CLAWBACK_CLAIM", `claim ${claimId} not found`);

  const agent = await readAgent(claim.agentId, client);
  if (!agent.registered) fail("CLAWBACK_CLAIM", `agent ${claim.agentId} not registered`);
  console.log(
    `${pad("agent identity:")}registered (${agent.handle}, faction ${FACTION_LABELS[agent.faction] ?? agent.faction}, agentId ${claim.agentId}, owner ${agent.owner})`,
  );

  const commitLog = await findCommitEventLog(claimId, client);
  if (!commitLog) fail("CLAWBACK_CLAIM", `no ClaimCommitted event for ${claimId}`);
  console.log(
    `${pad("claim committed:")}yes (block ${commitLog.blockNumber}, tx ${commitLog.transactionHash}) ${blockExplorerTx(commitLog.transactionHash!)}`,
  );
  console.log(`${pad("claim hash:")}${claim.claimHash}`);
  console.log(`${pad("signal output hash:")}${claim.skillsOutputHash}`);
  console.log(
    `${pad("market:")}${MARKET_LABELS[claim.marketId] ?? claim.marketId} (id ${claim.marketId})`,
  );
  console.log(`${pad("prediction params:")}${decodePrediction(claim.predictionParams, claim.marketId)}`);

  const accounting = await readAccounting(claimId, client);
  console.log(`${pad("agent bond locked:")}${formatUsdc(accounting.bondAtStake)} at commit`);
  console.log(`${pad("unlock price:")}${formatUsdc(claim.unlockPrice)} per buyer`);
  console.log(`${pad("expiry:")}${formatTimestamp(claim.expiry)}`);
  console.log(`${pad("public release at:")}${formatTimestamp(claim.publicReleaseAt)}`);
  console.log(`${pad("state:")}${STATE_LABELS[claim.state] ?? claim.state}`);

  const teaserPrivate = claim.state !== 2;
  console.log(
    `${pad("public teaser visible:")}yes ${teaserPrivate ? "(no claim text on chain until reveal)" : "(claim text now public)"}`,
  );

  if (claim.state === 2 && claim.revealedClaimText) {
    const record = await loadPrivateClaimRecord(claimId);
    if (record && record.salt) {
      const computed = keccak256(encodePacked(["string", "uint256"], [claim.revealedClaimText, BigInt(record.salt)]));
      const matches = computed.toLowerCase() === claim.claimHash.toLowerCase();
      console.log(`${pad("reveal hash match:")}${matches ? "yes" : "no"} (computed ${computed})`);
      if (!matches) fail("CLAWBACK_CLAIM", "revealed text does not hash to claimHash");
    } else {
      console.log(`${pad("reveal hash match:")}skipped (no local salt artifact, on-chain hash check happened in publicReveal)`);
    }
  }

  console.log(`${pad("contracts:")}market ${addrs.claimMarket}, escrow ${addrs.clawbackEscrow}`);
  pass("CLAWBACK_CLAIM");
}

main().catch((err) => {
  console.error("CLAWBACK_CLAIM_ERROR", err?.message ?? err);
  process.exit(2);
});
