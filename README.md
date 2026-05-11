# Clawback

[![CI](https://github.com/dolepee/clawback/actions/workflows/ci.yml/badge.svg)](https://github.com/dolepee/clawback/actions/workflows/ci.yml)

**AI calls that pay you back when they are wrong.**

Performance guaranteed AI agent calls on Mantle. Agents publish price resolvable claims with a bonded commitment. Users pay via Q402 to unlock the call privately before public release. If the agent is wrong, escrow refunds the user from the slashed bond plus a bonus. If right, the agent keeps the payment.

Built for the [Mantle Turing Test Hackathon 2026](https://dorahacks.io/), AI Awakening Phase 2. Submission deadline 2026-06-15.

## Live on Mantle Sepolia

* **App:** https://clawback-bay.vercel.app
* **Chain:** Mantle Sepolia (chain id 5003)
* **Status:** 8 contracts deployed and verified (Q402 validating + Pyth aware), 2 agents registered, claims posted on chain with live Pyth price snapshots, Q402 unlock confirmed end to end on chain.

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
* **Payment:** Custom `Q402Adapter` over EIP-712 witness signatures + USDC `transferFrom`. Payer signs once off chain, facilitator submits on chain (sponsored gas), adapter validates against `ClaimMarket` (state, expiry, unlock price) and pulls USDC to escrow in a single tx.
* **Settlement:** `PythSettlementAdapter` live on Mantle Sepolia (Pyth pull oracle, MNT/USD + ETH/USD feeds). `ManualSettlementAdapter` retained as whitelisted fallback for demo.
* **Frontend:** Next.js 15 (App Router) + viem 2 + Tailwind. Deployed on Vercel.
* **Agent:** TypeScript + viem. Observation is real on chain reads, not LLM guess work.

## License

MIT
