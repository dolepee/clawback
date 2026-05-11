# Clawback

**AI calls that pay you back when they are wrong.**

Performance guaranteed AI agent calls on Mantle. Agents publish price resolvable claims with a bonded commitment. Users pay via Q402 to unlock the call privately before public release. If the agent is wrong, escrow refunds the user from the slashed bond plus a bonus. If right, the agent keeps the payment.

Built for the [Mantle Turing Test Hackathon 2026](https://dorahacks.io/), AI Awakening Phase 2. Submission deadline 2026-06-15.

## Live on Mantle Sepolia

* **App:** https://clawback-bay.vercel.app
* **Chain:** Mantle Sepolia (chain id 5003)
* **Status:** 7 contracts deployed and verified, 2 agents registered, 1 claim posted on chain.

| Contract | Address | Mantlescan |
|---|---|---|
| ClaimMarket | `0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd` | [verified](https://sepolia.mantlescan.xyz/address/0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd#code) |
| ClawbackEscrow | `0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e` | [verified](https://sepolia.mantlescan.xyz/address/0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e#code) |
| AgentRegistry | `0x734c3037AEb58E5B60338C74318224bb5Dd70DB8` | [verified](https://sepolia.mantlescan.xyz/address/0x734c3037AEb58E5B60338C74318224bb5Dd70DB8#code) |
| ReputationLedger | `0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9` | [verified](https://sepolia.mantlescan.xyz/address/0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9#code) |
| ManualSettlementAdapter | `0xAbA92B00871C8fE5975d297419109780D010444E` | [verified](https://sepolia.mantlescan.xyz/address/0xAbA92B00871C8fE5975d297419109780D010444E#code) |
| Q402Adapter | `0xF8fE1d95f0C3F2aF70fB2663c5989CCeD38Ee83d` | [verified](https://sepolia.mantlescan.xyz/address/0xF8fE1d95f0C3F2aF70fB2663c5989CCeD38Ee83d#code) |
| MockUSDC (mUSDC) | `0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd` | [verified](https://sepolia.mantlescan.xyz/address/0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd#code) |

## AI on chain function

The AI agent produces a verifiable trading claim from live Mantle on chain market data, hashes the full reasoning trace into `skillsOutputHash`, hashes the bonded claim text into `claimHash`, and commits both on chain:

```solidity
function commitClaim(
    uint256 agentId,
    bytes32 claimHash,
    uint256 bondAmount,
    uint256 unlockPrice,
    uint64 expiry,
    uint64 publicReleaseAt,
    uint8 marketId,
    bytes32 skillsOutputHash
) external returns (uint256 claimId);
```

Contract: [`ClaimMarket.sol`](contracts/src/ClaimMarket.sol). The agent runtime that produces a real call lives in [`agent/src/personas.ts`](agent/src/personas.ts) and observes Merchant Moe Liquidity Book pools on Mantle mainnet for ground truth pricing.

## Tracks

* **Primary:** Alpha & Data Track Path B (AI driven trading strategy).
* **Other tags:** Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award.
* **Conditional:** Agentic Economy (Byreal / RealClaw integration, evaluated 2026-05-18 to 2026-05-22 against a load bearing bar).

Clawback fits Alpha & Data naturally because every claim is generated from live Mantle on chain market data, bonded with USDC, and verifiably settled by an on chain price oracle.

## How a claim works

```
agent commits claim                 →    payer unlocks via Q402             →    settlement after expiry
ClaimMarket.commitClaim()                Q402Adapter.executePayment()              ManualSettlementAdapter.settle()
(bond locked, hash sealed)               (1 sig, USDC pulled, claim text seen)     (oracle reads price, marks WRONG / RIGHT)

                                                                            ┌─→  WRONG:  payer refunded + bonus from slashed bond
                                                                            └─→  RIGHT:  agent earns payment + keeps bond
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
contracts/   Foundry project. Six contracts plus MockUSDC. 10/10 tests passing.
app/         Next.js 15 frontend. Server side reads from chain via viem. Cat vs Lobster faction split.
agent/       CatScout and LobsterRogue personas. Live Merchant Moe price observation + commit.
scripts/     Bootstrap and demo helpers.
docs/        Spec, spikes, deploy runbook, live deployment receipts.
```

## Stack

* **Chain:** Mantle (Sepolia for live deployment, mainnet for skill observation).
* **Payment:** Custom `Q402Adapter` over ERC-3009 `transferWithAuthorization`. Sign once, facilitator submits, sponsored gas.
* **Settlement:** `ManualSettlementAdapter` v1, Pyth oracle adapter on the roadmap.
* **Frontend:** Next.js 15 (App Router) + viem 2 + Tailwind. Deployed on Vercel.
* **Agent:** TypeScript + viem. Observation is real on chain reads, not LLM guess work.

## License

MIT
