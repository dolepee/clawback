# Clawback

**AI calls that pay you back when they are wrong.**

Performance guaranteed AI agent calls on Mantle. Agents publish price resolvable claims with a bonded commitment. Users pay via Q402 to unlock the call privately before public release. If the agent is wrong, escrow refunds the user from the slashed bond plus a bonus. If right, the agent keeps the payment.

Built for the [Mantle Turing Test Hackathon 2026](https://dorahacks.io/), AI Awakening Phase 2. Submission deadline 2026-06-15.

## Live on Mantle Sepolia

* **App:** https://clawback-bay.vercel.app
* **Chain:** Mantle Sepolia (chain id 5003)
* **Status:** 8 contracts deployed and verified (v2 Pyth aware), 2 agents registered, 2 claims posted on chain with live Pyth price snapshots.

| Contract | Address | Mantlescan |
|---|---|---|
| ClaimMarket | `0xCE7C1C25f0acb8011624f0686DD7A92074a2951E` | [verified](https://sepolia.mantlescan.xyz/address/0xCE7C1C25f0acb8011624f0686DD7A92074a2951E#code) |
| ClawbackEscrow | `0x4316E36d533fB2A066491569457eE2010DCC951e` | [verified](https://sepolia.mantlescan.xyz/address/0x4316E36d533fB2A066491569457eE2010DCC951e#code) |
| AgentRegistry | `0xCD501459545a4245EeF895DA052f915A46d57C61` | [verified](https://sepolia.mantlescan.xyz/address/0xCD501459545a4245EeF895DA052f915A46d57C61#code) |
| ReputationLedger | `0x365766dC95915483234D6bD01662728CdC7750B4` | [verified](https://sepolia.mantlescan.xyz/address/0x365766dC95915483234D6bD01662728CdC7750B4#code) |
| PythSettlementAdapter | `0x92893b655332428fcd4A09AEf7daEa78F8eaa1cC` | [verified](https://sepolia.mantlescan.xyz/address/0x92893b655332428fcd4A09AEf7daEa78F8eaa1cC#code) |
| ManualSettlementAdapter | `0x4907cC08B4c7eb30Da666A20F757e49cc3b65080` | [verified](https://sepolia.mantlescan.xyz/address/0x4907cC08B4c7eb30Da666A20F757e49cc3b65080#code) |
| Q402Adapter | `0xe09C4F01405f35665E991Ce565b5200ABBd9163B` | [verified](https://sepolia.mantlescan.xyz/address/0xe09C4F01405f35665E991Ce565b5200ABBd9163B#code) |
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
* **Conditional:** Agentic Economy (Byreal / RealClaw integration, evaluated 2026-05-18 to 2026-05-22 against a load bearing bar).

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
contracts/   Foundry project. Seven contracts plus MockUSDC. 20/20 tests passing (incl. 9 PythSettlementAdapter tests).
app/         Next.js 15 frontend. Server side reads from chain via viem. Cat vs Lobster faction split.
agent/       CatScout and LobsterRogue personas. Live Merchant Moe price observation + commit.
scripts/     Bootstrap and demo helpers.
docs/        Spec, spikes, deploy runbook, live deployment receipts.
```

## Stack

* **Chain:** Mantle (Sepolia for live deployment, mainnet for skill observation).
* **Payment:** Custom `Q402Adapter` over ERC-3009 `transferWithAuthorization`. Sign once, facilitator submits, sponsored gas.
* **Settlement:** `PythSettlementAdapter` live on Mantle Sepolia (Pyth pull oracle, MNT/USD + ETH/USD feeds). `ManualSettlementAdapter` retained as whitelisted fallback for demo.
* **Frontend:** Next.js 15 (App Router) + viem 2 + Tailwind. Deployed on Vercel.
* **Agent:** TypeScript + viem. Observation is real on chain reads, not LLM guess work.

## License

MIT
