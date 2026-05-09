# Feasibility Spikes

Five spikes must pass before full build proceeds. Each spike is a small, time boxed test of a load bearing assumption in the spec.

## S1: Q402 hello world

**Goal:** Sign once via EIP 712 against ClawbackEscrow stub, submit a 0.01 USDC payment, observe the on chain receipt and allowance decrement.

**Status:** Not started.

**Steps:**
1. Locate Q402 SDK or docs. Starting point: https://quackai.ai/q402
2. Follow the quickstart for a simple sign once flow.
3. Deploy the ClawbackEscrow stub to Mantle testnet with an `acceptPayment` function that just emits `PaymentAccepted` and decrements an internal allowance.
4. Run the Q402 client, sign once, observe the testnet tx and event log.
5. Capture: SDK shape, EIP 712 domain, allowance decrement semantics, gas paid by who.

**Pass criteria:** One signed authorization, two payments executed against it without further popups, both events visible on Mantle testnet.

**Fail handling:** If the SDK is unstable or undocumented, fall back to a thin Q402 adapter contract that wraps the EIP 712 sign once flow manually. Document the fallback in the spec.

---

## S2: Byreal Skills hello world

**Goal:** Run a single Mantle Skill locally that returns price quote data for MNT vs mETH.

**Status:** Not started.

**Steps:**
1. Clone https://github.com/byreal-git/byreal-agent-skills
2. Install per repo instructions.
3. Run a built in skill that reads pool reserves or quotes a swap on Fluxion or Merchant Moe.
4. Capture the JSON output shape, hash it with keccak256, that becomes the `skillsOutputHash` field on a claim.
5. Write a Node script that wraps the call and prints `{ skillId, output, hash }`.

**Pass criteria:** One skill invocation returns deterministic JSON. Hash is reproducible. Output makes sense for an MNT vs mETH context.

**Fail handling:** If the Skills CLI is not installable or maintained, document the gap and fall back to a direct Mantle RPC reading of pool reserves with the same JSON shape. Skills CLI integration becomes stretch.

---

## S3: Mantle testnet contract deploy

**Goal:** Deploy the five contract stubs to Mantle testnet via Foundry, verify on the explorer.

**Status:** Not started.

**Steps:**
1. Find Mantle testnet RPC URL and chain ID (Sepolia testnet for Mantle).
2. Get testnet MNT from the faucet.
3. Write a Foundry deploy script `script/Deploy.s.sol` that deploys all five contracts and wires the `claimMarket`, `clawbackEscrow`, `settlementAdapter` addresses across them.
4. Run `forge script` with `--broadcast`.
5. Verify each contract on the testnet explorer.

**Pass criteria:** Five contracts deployed, addresses recorded in `docs/0G_MAINNET_PROOF.json` style file, all visible on explorer.

**Fail handling:** If Mantle testnet is congested or RPC unstable, fall back to local Anvil with chain id forked from Mantle. Document the workaround.

---

## S4: Settlement source check

**Goal:** Confirm a usable price source for MNT vs mETH and MNT vs USDT on Mantle.

**Status:** PARTIAL PASS (research phase, 2026-05-10). Final verification deferred to ramp week.

**Findings:**

* **Pyth IS supported on Mantle.** Verified.
  * Mantle mainnet contract: `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`
  * Mantle Sepolia testnet contract: `0x98046Bd286715D3B0BC227Dd7a956b83D8978603`
  * Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
* **Pyth has a METH/USD feed.** Confirmed via Pyth insights page (Crypto.METH/USD). Full feed ID hex to be captured during ramp by querying the deployed contract or Pyth API.
* **Pyth MNT/USD feed status: unconfirmed.** Need to verify during ramp. If absent, derive MNT vs mETH from a separate MNT pricing source plus METH/USD.
* **Chainlink NOT supported on Mantle.** Chainlink data feeds page lists Ethereum mainnet only. Drop Chainlink from the v1 plan entirely.
* **DEX TWAP fallback confirmed.**
  * Merchant Moe has a MNT/mETH pool (AMM, Trader Joe team). Strong liquidity hub.
  * Agni Finance has a mETH/wMNT pool (concentrated liquidity).
  * Fluxion is newer (Dec 2025 launch), RWA focus, less depth.
  * Merchant Moe + Agni hold ~66% of Mantle DeFi TVL ($242M total at last report).

**v1 settlement decision (locked):**

1. **Primary:** Pyth METH/USD feed for resolving MNT_OUTPERFORMS_METH market. If MNT/USD feed exists, use it. If not, use Merchant Moe MNT/mETH pool spot or TWAP for the MNT side.
2. **Fallback:** Merchant Moe MNT/mETH pool TWAP read at observation block. Recorded as `source_id = "merchant_moe_mnt_meth_twap"` with pool address, block, reserves snapshot, formula version.
3. **No Chainlink dependency.**

**Remaining ramp tasks:**

1. Confirm Pyth MNT/USD feed ID exists or document its absence.
2. Capture Pyth METH/USD feed ID hex.
3. Identify the canonical Merchant Moe MNT/mETH pool address.
4. Write the price observation script (Node + ethers.js) that reads both Pyth and Merchant Moe and prints a unified observation.

**Pass criteria for ramp:** A reproducible price observation for MNT vs mETH at the current block, using Pyth where possible and Merchant Moe TWAP as fallback.

**Fail handling:** If Pyth MNT/USD is absent AND Merchant Moe MNT/mETH liquidity is too thin for a stable TWAP, scope v1 down to Pyth METH/USD plus a Pyth USDT-pegged stablecoin feed and resolve only the MNT_USDT_THRESHOLD market. Document.

---

## S5: Minimal ClaimMarket + Escrow proof path

**Goal:** End to end happy path on testnet. Agent commits a claim, user pays unlock, settlement triggers, refund or earnings claim works.

**Status:** Not started.

**Steps:**
1. Implement minimal versions of `commitClaim`, `recordPaidUnlock`, `acceptPayment`, `lockBond`, `settle`, `claimRefund`, `claimAgentEarnings`. No reveal, no skills hash verification, no bonus cap math beyond the simplest pro rata.
2. Write a Foundry integration test that exercises both right and wrong outcomes.
3. Deploy to testnet, run the same flow with cast or a small Node script.
4. Capture tx hashes and event logs in `docs/SPIKE_5_RECEIPTS.json`.

**Pass criteria:** Both paths work on testnet. One wrong claim with refund withdrawn. One right claim with agent earnings withdrawn. All logged.

**Fail handling:** If integration is blocked by Q402 (S1) or settlement source (S4), proxy with a mock payment and a hardcoded settlement outcome. Document which parts are mocked.

---

## Pass condition for the build phase to begin

S1, S2, S3 must pass for the build to be feasible.
S4 must pass at the DEX TWAP fallback level minimum.
S5 can be partial (mocked components allowed) but the contract surface must be exercised end to end.

If any spike blocks for more than 24 hours, escalate the spec section in question and pick the documented fallback path.
