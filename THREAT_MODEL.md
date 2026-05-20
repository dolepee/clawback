# Clawback threat model

Scope. This document covers the v1 production surface on Mantle Sepolia: nine verified contracts, the Q402 facilitator path, the Pyth pull-oracle settlement, the cron-driven agent runners, and the Next.js frontend on Vercel. The product is a bonded, slashable accountability market for AI agent price calls. Every threat that can change a payout, refund, or reputation outcome is in scope. Pure denial-of-service of off chain services (Vercel down, RPC down) is mentioned but not modelled in depth because no value is at stake while the chain is healthy.

## Trust assumptions

These are the trust roots the system inherits. If any one is broken, the corresponding mitigation no longer holds.

1. **Mantle Sepolia consensus is honest.** All state transitions, balances, and event logs are taken at face value. We do not model reorgs deeper than two blocks. If a reorg deeper than that hits a settled claim, the settled state replays from chain and the verifier reruns.
2. **Pyth pull oracle prices on Mantle are honest.** Settlement reads `getPriceNoOlderThan(feedId, priceMaxAge)` from the Pyth contract at `0x98046Bd286715D3B0BC227Dd7a956b83D8978603`. If Pyth publishes a wrong price, the wrong agent wins or loses. We do not have a secondary oracle in v1 for the MNT/USD and ETH/USD feeds.
3. **ECDSA on secp256k1 is unbroken.** Agent and payer keys are EOAs. Q402 witness signatures are EIP 712 typed data signatures. We rely on `ecrecover` returning the right signer.
4. **Foundry test coverage is faithful.** All four bond, refund, payout, and reveal paths are exercised by the 31 contract tests. A regression on those tests is a release blocker.
5. **Mantle Sepolia mUSDC stays a thin ERC20.** The MockUSDC at `0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd` is a vanilla 6 decimal ERC20 minted at deploy. No fee on transfer, no rebase, no admin pause. Mainnet migration will swap in real USDC, and that swap must re-audit the no fee assumption.

## Actors

* **Agent owner.** Holds the agent EOA. Posts bonded claims via `ClaimMarket.commitClaim`. Pulls earnings via `ClawbackEscrow.claimAgentEarnings` after a right settlement.
* **Payer.** Anyone. Signs a Q402 witness once, the facilitator submits, the payer's USDC is debited and the call text is delivered privately. After a wrong settlement, the payer pulls `claimRefund`.
* **Facilitator.** A relayer EOA that pays MNT gas to submit `Q402Adapter.accept` on behalf of the payer. Does not custody funds. Cannot mint claims or move escrow funds independently.
* **Settler.** Any address. After a claim expires, anyone can call `PythSettlementAdapter.resolve(claimId, params)` and front the Pyth update fee in MNT. The settlement adapter writes the proof to escrow and marks the claim settled. No special role.
* **Reveal cron.** Owns a settler EOA. After `publicReleaseAt` (or after settlement), it calls `ClaimMarket.publicReveal(claimId, claimText, salt)` using the artifact decrypted from `agent/cron-private-encrypted/<day>/claim-<id>.json.enc` with the `CRON_PRIVATE_KEY` GitHub Actions secret. The reveal is hash verified on chain. Plaintext lives only inside the runner for the duration of the reveal job.
* **Operator.** The hackathon team. Holds deployer key, sets `escrow` and `claimMarket` wiring on each contract once at deploy, registers the agent identities, and pushes the cron secrets to GitHub Actions. Does not custody payer or agent funds at runtime.

## Asset inventory

* Locked agent bonds in `ClawbackEscrow.accounting[claimId].bondAtStake` until settlement.
* Paid unlock funds in `ClawbackEscrow.totalPaid[claimId]` until settlement.
* Slashed bond pool in `ClawbackEscrow.slashedBondPool[claimId]` after a wrong settlement, capped by `bonusCapBps` per payer.
* Earnings claimable by the agent in `ClawbackEscrow` after a right settlement.
* Agent reputation in `ReputationLedger.scores[agentId]` (`wins`, `losses`, `totalBonded`, `totalSlashed`, `totalEarned`, `accuracyBps`).
* Soulbound `AgentIdentity` NFTs. One per agent. Token id mirrors agent id.
* Cron private artifacts under `agent/cron-private-encrypted/` (AES-256-CBC + PBKDF2 ciphertext of claim text + salt, committed to the public repo). The matching plaintext under `agent/cron-private/` is gitignored and exists only on cron-cycle and cron-reveal runners during job execution. Compromise of the `CRON_PRIVATE_KEY` GitHub Actions secret retroactively decrypts every committed blob.

## Threat catalogue

### T1. Agent commits a claim with a hash that does not match the eventual reveal

* **Goal.** Agent posts a sealed claim, takes the unlock payment, and at reveal time pushes claim text that bears no relation to the signal it actually sold.
* **Path.** Caller passes any 32 byte `claimHash` into `commitClaim`. At reveal time, calls `publicReveal(claimId, claimText, salt)` with arbitrary text.
* **Defence.** `ClaimMarket.publicReveal` recomputes `keccak256(abi.encode(claimText, salt))` and reverts unless it equals the stored hash. Off chain, the private delivery service signs the same `(claimText, salt)` tuple it later reveals, and the payer can verify the signed payload against the on chain `claimHash` at unlock time.
* **Residual risk.** Low. The hash check is unavoidable. Worst case is an agent never reveals at all; the deal then settles silently from Pyth without a public claim text, which is visibly degraded for buyers and the agent's reputation suffers.

### T2. Payer signs a Q402 witness and the facilitator replays it

* **Goal.** Facilitator submits the same witness twice and pulls double USDC from the payer.
* **Path.** The witness carries `(owner, claimId, amount, deadline, paymentId, nonce)`. `Q402Adapter.accept` enforces EIP 712 signature recovery, `block.timestamp <= deadline`, and `nonceUsed[owner][nonce] == false`. After acceptance, the nonce is marked used.
* **Defence.** Per owner, per nonce single-use. Deadlines enforce a sign once window. The adapter also calls back into `ClaimMarket` to confirm the claim is in `Committed` state and to record `paidUnlock[claimId][payer] = true`; replays against already paid unlocks revert in `recordPaidUnlock`.
* **Residual risk.** Low. A facilitator who collects an unspent witness and waits until `deadline - 1` to submit can still claim the unlock, but the user did intend to pay; the only attack surface is a withheld submission, which doesn't drain funds.

### T3. Adversary submits a forged witness against a payer who did not sign

* **Goal.** Forge `(owner, claimId, amount, ...)` to debit a stranger's USDC.
* **Path.** `_recover(digest, sig)` recovers the signer from EIP 712 typed data; if the recovered address is not `w.owner` the call reverts.
* **Defence.** Standard ECDSA recovery. EIP 712 domain pins chain id 5003, the verifying contract address, and the version string, so a signature for one Q402 deployment cannot be replayed against another.
* **Residual risk.** Low, conditional on ECDSA safety.

### T4. Pyth update is replayed against an old claim

* **Goal.** An attacker buys an unlock for a still-pending claim, picks a previously published Pyth update they know would settle the claim in their favour, and resolves with it.
* **Defence.** `PythSettlementAdapter.resolve` requires `block.timestamp >= c.expiry` before reading prices. It then calls `pyth.updatePriceFeeds(updateData)` which only accepts updates whose `publishTime` is strictly newer than the previously cached publish time for that feed. Stale updates are rejected by the Pyth contract. The adapter then reads via `getPriceNoOlderThan(feedId, priceMaxAge)`, which reverts if the price is older than `priceMaxAge`.
* **Residual risk.** Medium. If `priceMaxAge` is set too liberally, an attacker could submit an update that is fresh-enough but still older than the expiry, biasing settlement away from "the price at expiry" toward "the most attacker friendly fresh price after expiry." Mitigation: keep `priceMaxAge` tight (current value documented in deployment receipts).

### T5. Settlement adapter is upgraded to a malicious one

* **Goal.** Operator swaps the wired `PythSettlementAdapter` address inside `ClawbackEscrow.settle` authorization, allowing arbitrary `settle(claimId, agentRight, proof)` calls.
* **Defence.** `ClawbackEscrow.settle` is gated on `msg.sender == settlementAdapter`, and the adapter is set once in `ClawbackEscrow` at deploy. Re-wiring requires the deployer key. The deployer key is not rotated at runtime; production deployment hands off `setSettlementAdapter` to a multisig if the project graduates beyond v1.
* **Residual risk.** v1 keeps a single-sig deployer. Documented limitation. Mitigation for v2: migrate ownership to a 2-of-3 multisig before any mainnet TVL.

### T6. Refund pool is drained twice by the same payer

* **Goal.** Payer calls `claimRefund` twice and walks away with double the principal plus double the bonus.
* **Defence.** `claimRefund` zeroes `paidAmount[msg.sender][claimId]` and flips `refundClaimed[claimId][msg.sender] = true` before transferring. Subsequent calls revert on the `refundClaimed` guard. The pro rata bonus pool is decremented per claim, capped by `bonusCapBps`.
* **Residual risk.** Low. The pull pattern eliminates cross-payer interference (one payer cannot block another's refund), and `bonusCapBps` caps the bonus per user regardless of pool size.

### T7. Agent claims earnings twice

* **Goal.** Agent calls `claimAgentEarnings` repeatedly to drain the escrow.
* **Defence.** `earningsClaimed[claimId]` is checked and set in the same call. Only the agent owner of `accounting[claimId].agentId` can call it (enforced via `AgentRegistry.ownerOf(agentId) == msg.sender`).
* **Residual risk.** Low.

### T8. Bond is locked but never released after a right settlement

* **Goal.** Funds stuck in escrow forever.
* **Defence.** `claimAgentEarnings` on a right settlement transfers both the unlock payments and the bond back. There is no path where a settled right claim leaves bond stranded. Tests cover this in `contracts/test/ClawbackEscrow.t.sol`.
* **Residual risk.** Low.

### T9. Private claim text leaked before reveal window

* **Goal.** A third party reads the privately delivered text before the unlock window expires, free riding on the paid call.
* **Path.** Salts and claim texts are generated inside the `cron-cycle` GitHub Actions workflow, written to `agent/cron-private/<day>/claim-<id>.json` on the runner, immediately encrypted with AES-256-CBC + PBKDF2 (`openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:CRON_PRIVATE_KEY`), and the `.enc` ciphertext is committed to the public repository at `agent/cron-private-encrypted/<day>/claim-<id>.json.enc`. The plaintext directory is gitignored. Anyone who decrypts a `.enc` blob obtains both `claimText` and `salt` and could front-run the paid unlock, or read the call without paying.
* **Defence.** Ciphertext is useless without `CRON_PRIVATE_KEY`. GitHub Actions masks the secret in workflow logs and restricts read access to repository administrators. The reveal cron is the only consumer; it decrypts in-memory on a fresh runner and never writes the key to disk. Local replay needs the same key passed via env, never committed. `cron-private/` is gitignored everywhere so plaintext never reaches a public commit.
* **Residual risk.** Medium, and now centralized around a single secret. A leak of `CRON_PRIVATE_KEY` retroactively decrypts every salt committed under this scheme. Mitigation if leaked: rotate the GHA secret, re-encrypt the historical `cron-private-encrypted/` tree under the new key, force push, and acknowledge the leak window (no fund impact because the on chain hash check still prevents fake reveals, and any paid unlock has already delivered the text off chain). For mainnet v2, encrypt the per-claim payload to the payer's libsodium public key so no central secret is load bearing.

### T10. Public reveal is censored

* **Goal.** Operator refuses to call `publicReveal`, keeping a settled claim's text private forever.
* **Defence.** `publicReveal` is permissionless. Anyone who knows the `(claimText, salt)` tuple can submit it. Buyers who paid for the unlock necessarily learn both at unlock time, so the operator cannot meaningfully gate reveal of a paid claim. For unpaid claims, the text is only known to the agent operator and the platform. v1 accepts that risk because there is no payer harm from a never-revealed unpaid claim.
* **Residual risk.** Low for paid claims, accepted for unpaid claims.

### T11. Two agents register with the same handle

* **Goal.** A new agent registers `CatScout` and impersonates the established account.
* **Defence.** `AgentRegistry.registerAgent` does not deduplicate by handle, but `agentIdByOwner[msg.sender]` is one-per-EOA. The frontend resolves agents by `agentId` and faction, not by handle string. The `AgentIdentity` NFT is soulbound and the token id mirrors the agent id, so the canonical reference is the on chain integer, not the human label.
* **Residual risk.** Low. The frontend should display agent id alongside handle on every page to prevent visual confusion.

### T12. Reputation manipulation by churning small claims

* **Goal.** Agent posts many tiny bonded claims, all of which it expects to win, to inflate `accuracyBps` without putting real capital at risk.
* **Defence.** `accuracyBps = wins * 10000 / (wins + losses)` is volume-weighted by count, not stake. Sybil risk exists at v1. Mitigation surface: the frontend displays `totalBonded` and `totalEarned` next to accuracy, and the leaderboard sorts by accuracy with a minimum-claim threshold for ranking. v2 should weight reputation by bond size, not count.
* **Residual risk.** Medium. Accepted for v1 because each claim still bonds USDC; the worst case is a low capital agent that grinds reputation but cannot put any real money behind a single call.

### T13. Settler griefs by burning Pyth update fees on irrelevant claims

* **Goal.** Random caller resolves an expired claim that no one paid for, wasting their own MNT on the Pyth fee.
* **Defence.** This is a self-grief, not an attack on anyone else. The system is happy if anyone settles. The settler pays the Pyth update fee from `msg.value` and gets the refund of any excess automatically.
* **Residual risk.** None.

### T14. Reorg deeper than two blocks between settle and refund

* **Defence.** All state lookups (`getClaim`, `accounting`, `paidAmount`) are read post-confirmation in the frontend with viem's default `blockTag: "latest"`. A short reorg replays the settlement; deeper reorgs are out of scope for the testnet deployment. Mainnet migration will require a wait-N-blocks confirmation window before payout UI surfaces.
* **Residual risk.** Accepted for Sepolia.

### T15. Frontend serves a stale settle status and the user double-clicks refund

* **Defence.** The Next.js page hydrates from server-side viem reads, then auto-refreshes via `/api/stats` every 20 seconds. `claimRefund` is idempotent on the contract side (`refundClaimed` guard), so a double click reverts the second tx, costs only gas on the user's side, and corrects the UI.
* **Residual risk.** Low.

### T16. Operator key is compromised

* **Path.** Deployer key or agent owner keys leak via shell history, env var leak, or repo accident.
* **Defence.** Keys are loaded from environment, never written to the repo. `.env` is gitignored. GitHub Actions secrets are masked. Agent keys are isolated per persona so a CatScout leak does not compromise LobsterRogue.
* **Mitigation if leaked.** Rotate the affected key, redeploy the dependent contract if it is the deployer key, register a new agent if it is a persona key, mark the old agent retired in the frontend.
* **Residual risk.** Acknowledged. Production migration requires HSM or multisig custody for the deployer.

### T17. Pyth feed is delisted on Mantle Sepolia

* **Defence.** `ManualSettlementAdapter` remains deployed and whitelisted as a fallback. The operator can migrate settlement to manual for affected feeds by re-wiring `ClawbackEscrow.settlementAdapter`. The manual adapter records DEX TWAP from a Mantle pool plus admin attestation in the settlement proof.
* **Residual risk.** Medium. Failover requires the deployer key. Documented as a v1 limitation.

## Out of scope for v1

* Cross-chain settlement.
* MEV protection around settle order. (Pyth settlement is permissionless; ordering does not affect the outcome because the price snapshot is anchored at the first valid post-expiry update.)
* Formal verification of contracts.
* Account abstraction smart wallet support for payers. (Q402 v1 expects an EOA signature; ERC 4337 wrappers can submit on behalf of contract wallets in a future iteration.)
* Spam bonded claims that never get bought. (No payer = no system harm.)
* Treasury or DAO governance over `bonusCapBps`, `priceMaxAge`, or settlement adapter swap. (Single-sig deployer in v1.)

## Verification commands

The four verifier scripts in `agent/` are the judge replay path. Each one prints a structured proof and exits non zero on validation failure.

```bash
pnpm verify:claim 14
pnpm verify:settlement 14
pnpm verify:q402 14
pnpm verify:reveal 14
```

The judge runs them against any claim id and grades the output. The expected `verdict:` line for a well-formed settled claim is `CLAWBACK_*_VALID`.
