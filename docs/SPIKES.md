# Feasibility Spikes

Five spikes must pass before full build proceeds. Each spike is a small, time boxed test of a load bearing assumption in the spec.

## S1: Q402 hello world

**Goal:** Sign once via EIP 712, facilitator submits a 0.01 USDC payment to ClawbackEscrow, observe on chain receipt and PaymentAccepted event.

**Status:** ADAPTER PATH LOCKED 2026-05-10. Building custom Q402Adapter.sol over ERC-3009 transferWithAuthorization. SDK fallback per spec.

**Research findings (2026-05-10):**

* **Q402 SDK upstream** at https://github.com/quackai-labs/Q402. TypeScript monorepo (core, facilitator, middleware-express, middleware-hono). Last push 2026-03-08, 3 stars.
* **Q402 SDK supports BSC mainnet and BSC testnet only.** `packages/core/src/types/network.ts` SupportedNetworks enum has only `BSC_MAINNET (56)` and `BSC_TESTNET (97)`. No Mantle entry. Adding Mantle requires forking the package or writing our own client.
* **Q402 wire shape** is HTTP 402 with `accepts[]` array. Each entry has `scheme: "evm/eip7702-delegated-payment"`, `networkId`, `token`, `amount`, `to`, `implementationContract`, EIP-712 `witness` (domain + types + message: owner, token, amount, to, deadline, paymentId, nonce), and `authorization` (chainId, address, nonce). Client signs witness + 7702 authorization, sends as `X-PAYMENT` HTTP header. Facilitator submits type 0x04 set-code transaction with sponsored gas.
* **Mantle EIP-7702 status.** Mantle's own docs confirm SetCodeTx will be supported via the Everest upgrade, replacing native MetaTX. Activation timing on Mantle Sepolia and mainnet is unclear from docs and search. Treated as unverified for v1.

**v1 decision (locked):**

1. **Build Q402Adapter.sol** as a thin EIP-712 sign once contract in our repo. Wire shape mirrors Q402 (witness EIP-712, paymentId, nonce, deadline). Lets us claim Q402 compatibility while not depending on upstream BSC-only SDK.
2. **Settlement primitive: ERC-3009 transferWithAuthorization** on USDC. User signs one ERC-3009 authorization per payment. Facilitator calls Q402Adapter which calls USDC.transferWithAuthorization then ClawbackEscrow.acceptPayment. Gas paid by facilitator. No prior approve needed.
3. **EIP-7702 stretch.** If Mantle Sepolia accepts type 0x04 transactions during ramp testing, layer in EIP-7702 single-auth-multi-payment as a stretch goal. v1 ships without it.
4. **No Q402 SDK dependency.** Skip @x402-bnb/core. Write our own viem-based client for sign + submit.

**Steps:**
1. Q402Adapter.sol with EIP-712 witness verification, ERC-3009 USDC pull, ClawbackEscrow.acceptPayment call. DONE on adapter path.
2. ClawbackEscrow.acceptPayment locked to Q402Adapter as authorized caller. DONE.
3. Foundry test: mock USDC with ERC-3009, sign witness, facilitator submits, verify PaymentAccepted event and USDC balance change.
4. TS spike script `agent/src/spikes/s1-q402.ts` that signs witness against deployed Q402Adapter on Mantle Sepolia and submits via facilitator.
5. Capture tx hash, EIP-712 domain hex, gas cost, in `docs/SPIKE_1_RECEIPTS.json`.

**Pass criteria:** One signed witness, one payment executed by facilitator on Mantle Sepolia, PaymentAccepted event visible on explorer, USDC moves from payer to ClawbackEscrow, payer pays zero gas.

**Fail handling:** If Mantle Sepolia rejects type 0 transactions from facilitator (extremely unlikely) or USDC on Mantle Sepolia lacks ERC-3009 (verify this first), fall back to plain `permit` (EIP-2612) or a synthetic test USDC stub for the demo, document which is mocked.

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
