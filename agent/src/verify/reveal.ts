import { encodePacked, keccak256 } from "viem";
import {
  STATE_LABELS,
  blockExplorerTx,
  fail,
  findRevealEventLog,
  loadPrivateClaimRecord,
  pad,
  parseClaimIdArg,
  pass,
  publicClient,
  readClaim,
} from "./lib.js";

async function main() {
  const claimId = parseClaimIdArg();
  const client = publicClient();

  console.log("CLAWBACK_REVEAL");
  console.log(`${pad("claim id:")}${claimId}`);

  const claim = await readClaim(claimId, client);
  console.log(`${pad("state:")}${STATE_LABELS[claim.state] ?? claim.state}`);

  if (claim.state !== 2) {
    console.log(`${pad("revealed yet:")}no (claim state must be PubliclyRevealed)`);
    fail("CLAWBACK_REVEAL", `claim state is ${STATE_LABELS[claim.state] ?? claim.state}, not PubliclyRevealed`);
  }

  if (!claim.revealedClaimText) fail("CLAWBACK_REVEAL", "claim state is PubliclyRevealed but revealedClaimText is empty");

  console.log(`${pad("on-chain claim hash:")}${claim.claimHash}`);
  console.log(`${pad("revealed text bytes:")}${Buffer.byteLength(claim.revealedClaimText, "utf8")}`);
  console.log(`${pad("revealed preview:")}${claim.revealedClaimText.slice(0, 120)}${claim.revealedClaimText.length > 120 ? "…" : ""}`);

  const log = await findRevealEventLog(claimId, client);
  if (log) {
    console.log(`${pad("reveal tx:")}${log.transactionHash} ${blockExplorerTx(log.transactionHash!)}`);
    console.log(`${pad("reveal block:")}${log.blockNumber}`);
  } else {
    console.log(`${pad("reveal tx:")}(no ClaimPubliclyRevealed log found — older block range may be pruned)`);
  }

  const record = await loadPrivateClaimRecord(claimId);
  if (!record || !record.salt) {
    console.log(`${pad("local salt artifact:")}not found (judges can still trust on-chain publicReveal hash check)`);
    console.log(`${pad("hash check:")}on-chain (publicReveal reverts unless keccak256(claimText, salt) == claimHash)`);
    pass("CLAWBACK_REVEAL");
    return;
  }

  const computed = keccak256(encodePacked(["string", "uint256"], [claim.revealedClaimText, BigInt(record.salt)]));
  const matches = computed.toLowerCase() === claim.claimHash.toLowerCase();
  console.log(`${pad("local salt:")}${record.salt}`);
  console.log(`${pad("computed hash:")}${computed}`);
  console.log(`${pad("local hash match:")}${matches ? "yes" : "no"}`);
  if (!matches) fail("CLAWBACK_REVEAL", "local replay of keccak256(claimText, salt) does not match on-chain claimHash");

  pass("CLAWBACK_REVEAL");
}

main().catch((err) => {
  console.error("CLAWBACK_REVEAL_ERROR", err?.message ?? err);
  process.exit(2);
});
