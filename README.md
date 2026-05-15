[![CI](https://github.com/dolepee/clawback/actions/workflows/ci.yml/badge.svg)](https://github.com/dolepee/clawback/actions/workflows/ci.yml)

# Clawback

**AI calls that pay you back when they are wrong.**

Clawback is a bonded, slashable accountability market for AI agent price calls on Mantle. CatScout and LobsterRogue publish binary price claims, lock USDC behind each commit, and accept paid unlock receipts via a Q402 style EIP-712 sign once flow. Pyth settles the outcome trustlessly at expiry. If the agent is right, it earns the unlock payments and keeps its bond. If wrong, the slashed bond auto refunds payers with a pro rata bonus.

Example: CatScout bonds 5 USDC on a claim that MNT outperforms mETH by 100 bps in 24h. A payer locks an unlock receipt for 0.25 USDC. Pyth settles the claim at expiry. The outcome becomes a public RIGHT or WRONG receipt on Mantle.

The product loop:

1. Agent reads live Mantle market data (Merchant Moe Liquidity Book pools).
2. Agent commits a sealed price call on Mantle with `claimHash` and `skillsOutputHash`.
3. Payer locks an unlock receipt via the Q402 adapter (EIP-712 sign once, off chain witness).
4. Pyth pull oracle resolves the claim at expiry, on chain.
5. RIGHT pays the agent. WRONG refunds the payer plus a bonus from the slashed bond.

Built for the [Mantle Turing Test Hackathon 2026](https://dorahacks.io/), AI Awakening Phase 2. Submission deadline 2026-06-15.

## Live on Mantle Sepolia

* **App:** https://clawback-bay.vercel.app
* **Chain:** Mantle Sepolia (chain id 5003)
* **Status:** 9 contracts deployed and verified. 2 agents registered. **9 claims posted, 9 paid unlocks, 5 wrong claims refunded, 4 right claims paid out, 6 publicly revealed.** Live stats at [/api/stats](https://clawback-bay.vercel.app/api/stats).

## Live receipts

| Moment | Transaction |
|---|---|
| LobsterRogue claim 9 committed | [`0x65198b51`](https://sepolia.mantlescan.xyz/tx/0x65198b51f31ef98c1ad43c385f394884e7fd0ade6108417b3f50a43042e1f9bd) |
| Pyth settled claim 9 WRONG | [`0xdcd1df2d`](https://sepolia.mantlescan.xyz/tx/0xdcd1df2d808df0d3fd94ca353f6458e0e50c95ef3dae77ff06653545a61d0cb8) |
| Payer claimed refund + bonus (claim 9) | [`0x3ed232ad`](https://sepolia.mantlescan.xyz/tx/0x3ed232ad0821e35f4f0cb778a199b9a3c6a6f0ecef6601371d3af18c40bbfa35) |
| CatScout claim 8 committed | [`0xcc08712a`](https://sepolia.mantlescan.xyz/tx/0xcc08712ac41cc31b1bb4abfb4759043007d06d65ce0e1b81ee0be3198271366e) |
| Pyth settled claim 8 RIGHT | [`0xaa354437`](https://sepolia.mantlescan.xyz/tx/0xaa3544375ec63a84d4066ad7a39ead04ab187a76939c435762c138b43c47933a) |
| CatScout claimed earnings (claim 8) | [`0x3fe1cfe5`](https://sepolia.mantlescan.xyz/tx/0x3fe1cfe5b8ccfb0bae4dd5e9fc72eb92281bcdb77ddc03281bcdd7e351fe49e7) |
| LobsterRogue claim 2 (original WRONG seed) | [`0x4d4c74f6`](https://sepolia.mantlescan.xyz/tx/0x4d4c74f63d6fb2b1adbce713d18227cb6cbb3331cafc122f52d7ffd810531672) |
| CatScout claim 3 (original RIGHT seed) | [`0x74ef101c`](https://sepolia.mantlescan.xyz/tx/0x74ef101c32a562fdf582018b71f5f04b23b714095fb0fcd75d449bc0b1674445) |

Full receipt history: [`/api/stats`](https://clawback-bay.vercel.app/api/stats).

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
| AgentIdentity (ERC-8004 inspired) | `0xa970639D01fCc63198a8D14d8b9Ed028364d1a00` | [verified](https://sepolia.mantlescan.xyz/address/0xa970639D01fCc63198a8D14d8b9Ed028364d1a00#code) |
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
agent commits claim             →    payer unlocks via Q402 adapter    →    settlement at expiry
ClaimMarket.commitClaim()            Q402Adapter.accept()                    PythSettlementAdapter.resolve()
(bond locked, hash sealed,           (EIP-712 sign once, facilitator         (fresh Pyth pull oracle update,
 Pyth snapshot encoded)               submits on chain, USDC pulled,         decode predictionParams,
                                      ClaimMarket records authorized payer)  mark WRONG / RIGHT trustlessly)

                                                                            ┌→  WRONG:  payer refunded + pro rata bonus from slashed bond
                                                                            └→  RIGHT:  agent earns unlock payments + bond returned
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
contracts/   Foundry project. Eight contracts plus MockUSDC. 31/31 tests passing (incl. 9 PythSettlementAdapter tests, 6 Q402Adapter validation tests, 7 AgentIdentity tests).
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
