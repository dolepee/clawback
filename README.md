[![CI](https://github.com/dolepee/clawback/actions/workflows/ci.yml/badge.svg)](https://github.com/dolepee/clawback/actions/workflows/ci.yml)

# Clawback

**AI calls that pay you back when they are wrong.**

Clawback turns AI alpha into a paid performance market on Mantle. CatScout and LobsterRogue publish price calls, lock USDC behind each claim, and let users pay through Q402 to see the call before public release. Pyth settles the outcome at expiry. If the agent is right, the agent earns the payment and gets its bond back. If the agent is wrong, the payer receives the unlock payment back plus a bonus from the slashed bond.

Example: CatScout can bond 5 USDC on a claim that MNT stays above 0.50 USDC. A payer unlocks the call for 0.25 USDC. Pyth settles the claim at expiry. The result becomes a public RIGHT or WRONG receipt on Mantle.

The product loop is simple:

1. Agent reads live Mantle market data.
2. Agent commits a sealed price call on Mantle with `claimHash` and `skillsOutputHash`.
3. User pays through Q402 to unlock the call privately.
4. Pyth resolves the claim at expiry.
5. RIGHT pays the agent. WRONG refunds the payer and slashes the agent bond.

Built for the [Mantle Turing Test Hackathon 2026](https://dorahacks.io/), AI Awakening Phase 2. Submission deadline 2026-06-15.

## Live on Mantle Sepolia

* **App:** https://clawback-bay.vercel.app
* **Chain:** Mantle Sepolia (chain id 5003)
* **Status:** 8 contracts deployed and verified, 2 agents registered, 3 claims posted, Q402 unlocks confirmed, Pyth settlements confirmed, payer refunds confirmed, agent earnings confirmed.

## Live receipts

| Moment | Transaction |
|---|---|
| Fresh LobsterRogue claim committed | [`0x4d4c74f63d6fb2b1adbce713d18227cb6cbb3331cafc122f52d7ffd810531672`](https://sepolia.mantlescan.xyz/tx/0x4d4c74f63d6fb2b1adbce713d18227cb6cbb3331cafc122f52d7ffd810531672) |
| Payer unlocked LobsterRogue claim through Q402 | [`0x7e299b394230272f01eda2e232656cadbc87ba4372f1a9ec598b11ea72236768`](https://sepolia.mantlescan.xyz/tx/0x7e299b394230272f01eda2e232656cadbc87ba4372f1a9ec598b11ea72236768) |
| Pyth settled LobsterRogue WRONG | [`0xe716ac9e97eb3a40641b6dd9839b3931d4fe1b580f1433c9808abc2aa1ddb22c`](https://sepolia.mantlescan.xyz/tx/0xe716ac9e97eb3a40641b6dd9839b3931d4fe1b580f1433c9808abc2aa1ddb22c) |
| Payer claimed refund plus bonus | [`0x3898e4e7f78334029df2c1ec8aa06ffd24204d290507606f17e07a40058cc542`](https://sepolia.mantlescan.xyz/tx/0x3898e4e7f78334029df2c1ec8aa06ffd24204d290507606f17e07a40058cc542) |
| CatScout claim settled RIGHT | [`0xbc7ab08f2a56bcf04b9ef27b83da2ebaf0a295329463c222dd5fab1bfd8c4879`](https://sepolia.mantlescan.xyz/tx/0xbc7ab08f2a56bcf04b9ef27b83da2ebaf0a295329463c222dd5fab1bfd8c4879) |
| CatScout claimed earnings | [`0xf51cafa1091dfe45f67048f3ce249b981e9b00c9743d1a3d2c11bb894e9e65f1`](https://sepolia.mantlescan.xyz/tx/0xf51cafa1091dfe45f67048f3ce249b981e9b00c9743d1a3d2c11bb894e9e65f1) |

## Verified contracts

| Contract | Address | Mantlescan |
|---|---|---|
| ClaimMarket | `0x8C076c7452E526526De877F86BBb4BA37E027af9` | [verified](https://sepolia.mantlescan.xyz/address/0x8C076c7452E526526De877F86BBb4BA37E027af9#code) |
| ClawbackEscrow | `0xEa02e04E9550eA556235B46d10b554b876C16d2a` | [verified](https://sepolia.mantlescan.xyz/address/0xEa02e04E9550eA556235B46d10b554b876C16d2a#code) |
| AgentRegistry | `0x0b7B93C0E6591bD415BEDE8B8DCD57171f4A7851` | [verified](https://sepolia.mantlescan.xyz/address/0x0b7B93C0E6591bD415BEDE8B8DCD57171f4A7851#code) |
| ReputationLedger | `0x02aE8215844DC8AA962e44Fd07e537F05241f8E6` | [verified](https://sepolia.mantlescan.xyz/address/0x02aE8215844DC8AA962e44Fd07e537F05241f8E6#code) |
| PythSettlementAdapter | `0x78a138EB1EaB4fAcB0fe982F685AB2B29a8562d3` | [verified](https://sepolia.mantlescan.xyz/address/0x78a138EB1EaB4fAcB0fe982F685AB2B29a8562d3#code) |
| ManualSettlementAdapter | `0x19E3597340b57950D7893b1805c54c81d341C540` | [verified](https://sepolia.mantlescan.xyz/address/0x19E3597340b57950D7893b1805c54c81d341C540#code) |
| Q402Adapter | `0x3Eba0528a19295d0A48EFD4c38DC4100462761aB` | [verified](https://sepolia.mantlescan.xyz/address/0x3Eba0528a19295d0A48EFD4c38DC4100462761aB#code) |
| MockUSDC (mUSDC) | `0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd` | [verified](https://sepolia.mantlescan.xyz/address/0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd#code) |

## AI on chain function

The AI agent produces a verifiable trading claim from live Mantle on chain market data plus a live Pyth price snapshot, hashes the full reasoning trace into `skillsOutputHash`, hashes the bonded claim text into `claimHash`, encodes the binary settlement question into `predictionParams`, and commits all of it on chain:

```solidity
function commitClaim(
    uint256 agentId,
    bytes32 claimHash,
    uint256 bondAmount,
    uint256 unlockPrice,
    uint64 expiry,
    uint64 publicReleaseAt,
    uint8 marketId,
    bytes32 skillsOutputHash,
    bytes calldata predictionParams
) external returns (uint256 claimId);
```

Contract: [`ClaimMarket.sol`](contracts/src/ClaimMarket.sol). The agent runtime that produces a real call lives in [`agent/src/personas.ts`](agent/src/personas.ts) and observes Merchant Moe Liquidity Book pools on Mantle mainnet plus Pyth Hermes for the commit time price snapshot. `predictionParams` is decoded at expiry by [`PythSettlementAdapter`](contracts/src/PythSettlementAdapter.sol) against a fresh Pyth pull oracle update, so settlement is trustless and reproducible.

## Tracks

* **Primary:** Alpha & Data Track Path B (AI driven trading strategy).
* **Other tags:** Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award.

Clawback fits Alpha & Data naturally because every claim is generated from live Mantle on chain market data, bonded with USDC, and verifiably settled by an on chain price oracle.

## How a claim works

```
agent commits claim                 →    payer unlocks via Q402             →    settlement after expiry
ClaimMarket.commitClaim()                Q402Adapter.executePayment()              PythSettlementAdapter.resolve()
(bond locked, hash sealed,               (1 sig, USDC pulled, claim text seen)     (fresh Pyth update, decode predictionParams,
 Pyth snapshot encoded)                                                             mark WRONG / RIGHT trustlessly)

                                                                            ┌→  WRONG:  payer refunded + bonus from slashed bond
                                                                            └→  RIGHT:  agent earns payment + keeps bond
```

The same flow is the headline of the demo: WRONG refund vs RIGHT payout.

## Local replay

```bash
git clone https://github.com/dolepee/clawback
cd clawback

# Contracts
cd contracts && forge test -vvv

# Frontend (reads live Mantle Sepolia)
cd ../app && pnpm install && pnpm dev

# Agent (posts a real claim from live mainnet price feed)
cd ../agent && pnpm install
CATSCOUT_PRIVATE_KEY=0x... pnpm tsx src/index.ts cat-scout register
CATSCOUT_PRIVATE_KEY=0x... pnpm tsx src/index.ts cat-scout post
```

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the one shot Foundry deploy, [`docs/SEPOLIA_LIVE.md`](docs/SEPOLIA_LIVE.md) for the broadcast receipts and reveal salts, and [`docs/SPIKES.md`](docs/SPIKES.md) for the five feasibility spikes that proved each load bearing assumption.

## Repo layout

```
contracts/   Foundry project. Seven contracts plus MockUSDC. 24/24 tests passing (incl. 9 PythSettlementAdapter tests, 6 Q402Adapter validation tests).
app/         Next.js 15 frontend. Server side reads from chain via viem. Cat vs Lobster faction split.
agent/       CatScout and LobsterRogue personas. Live Merchant Moe price observation + commit.
scripts/     Bootstrap and demo helpers.
docs/        Spec, spikes, deploy runbook, live deployment receipts.
```

## Stack

* **Chain:** Mantle (Sepolia for live deployment, mainnet for skill observation).
* **Payment:** Custom `Q402Adapter` over EIP 712 witness signatures + USDC `transferFrom`. Payer signs once off chain, facilitator submits on chain with sponsored gas, adapter validates against `ClaimMarket` for state, expiry, and unlock price, then pulls USDC to escrow in a single tx.
* **Settlement:** `PythSettlementAdapter` live on Mantle Sepolia (Pyth pull oracle, MNT/USD + ETH/USD feeds). `ManualSettlementAdapter` retained as whitelisted fallback for demo.
* **Frontend:** Next.js 15 (App Router) + viem 2 + Tailwind. Deployed on Vercel.
* **Agent:** TypeScript + viem. Observation is real on chain reads, not LLM guess work.

## License

MIT
