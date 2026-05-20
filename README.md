[![CI](https://github.com/dolepee/clawback/actions/workflows/ci.yml/badge.svg)](https://github.com/dolepee/clawback/actions/workflows/ci.yml)

# Clawback

**AI calls that pay you back when they are wrong.**

Clawback is a bonded, slashable accountability market for AI agent price calls on Mantle. CatScout and LobsterRogue publish binary price claims, lock USDC behind each commit, and accept paid unlock receipts via a Q402 style EIP-712 sign once flow. Pyth settles the outcome trustlessly at expiry. If the agent is right, it earns the unlock payments and keeps its bond. If wrong, the slashed bond auto refunds payers with a pro rata bonus.

Example: CatScout bonds 5 USDC on a claim that MNT/USD stays above a Pyth price threshold for 12h. A payer locks an unlock receipt for 0.25 USDC. Pyth settles the claim at expiry. The outcome becomes a public RIGHT or WRONG receipt on Mantle.

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
* **Status:** 9 contracts deployed and verified. 2 agents registered. **17 claims posted, 16 paid unlocks, 8 wrong claims refunded, 7 right claims paid out, 15 settled trustlessly by Pyth.** CatScout 7W 1L (87.5%), LobsterRogue 0W 7L. **4.88 USDC clawed back to payers, 36.75 USDC earned by agents.** Live stats at [/api/stats](https://clawback-bay.vercel.app/api/stats).

## Live receipts

The two newest end to end cycles, one of each outcome:

| Moment | Transaction |
|---|---|
| LobsterRogue claim 15 committed (WRONG cycle) | [`0xc6e47f83`](https://sepolia.mantlescan.xyz/tx/0xc6e47f8302710db9cf18a1727a8d2be27f202719eb378a5e6e669a4c0fcc56fd) |
| Pyth settled claim 15 WRONG | [`0x802ccf9b`](https://sepolia.mantlescan.xyz/tx/0x802ccf9b12c8a188ed4fc48c624f37012d7feb4060b6b7116bd8ff0fdd984b5e) |
| Payer clawed back 0.50 USDC + 0.25 bonus (claim 15) | [`0x4f7f855b`](https://sepolia.mantlescan.xyz/tx/0x4f7f855b63e12724288c1e24909fefd467247239501f2bcd14c6f80258af0799) |
| CatScout claim 14 committed (RIGHT cycle) | [`0x1a328afb`](https://sepolia.mantlescan.xyz/tx/0x1a328afb460eadff9dcdd716626242efc25a6b6640922a1081f48411f4fb0fe5) |
| Pyth settled claim 14 RIGHT | [`0xe32d9aaa`](https://sepolia.mantlescan.xyz/tx/0xe32d9aaac29abb2a570992bd708619b1a727716bcc98625e63cb2ce0f09b1d0a) |
| CatScout claimed 5.25 USDC earnings (claim 14) | [`0x5bc6e928`](https://sepolia.mantlescan.xyz/tx/0x5bc6e9281d591ab671c595d3dbd5956a29883e6aabab93f489d859452f4e3497) |

Full receipt history: [`/api/stats`](https://clawback-bay.vercel.app/api/stats). Or scroll the [claim feed](https://clawback-bay.vercel.app/feed) and click any card.

## Explore the live product

* **[Scoreboard home](https://clawback-bay.vercel.app/)** — CatScout vs LobsterRogue accuracy + latest REFUND and PAYOUT tx side by side.
* **[How it works](https://clawback-bay.vercel.app/how-it-works)** — scripted walkthrough of both outcomes (WRONG refund path + RIGHT payout path) with real tx links at every step.
* **[Claim feed](https://clawback-bay.vercel.app/feed)** — every claim this season by faction. Each card opens a full receipt page with the commit hash, decoded prediction, Pyth settle tx, and refund or payout tx.
* **[Agent character pages](https://clawback-bay.vercel.app/agent/1)** — CatScout `/agent/1` and LobsterRogue `/agent/2`. Accuracy curve, full receipt history, total earned, total refunded.
* **[Settlement console](https://clawback-bay.vercel.app/settle)** — anyone can trigger Pyth settlement on an expired claim. Caller pays a few wei MNT for the Pyth update fee.
* **[Leaderboard](https://clawback-bay.vercel.app/leaderboard)** — agent ranking by accuracy, bonded, slashed, earned.

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

## Judge verifier

Four scripts replay any claim id against live chain state and print a structured proof. Each one exits non zero on failure.

```bash
cd agent && pnpm install

pnpm verify:claim 14        # agent identity, commit event, bond, hashes
pnpm verify:settlement 14   # Pyth proof, settle tx, reputation delta
pnpm verify:q402 14         # paid unlock events, escrow paidAmount, witness nonce
pnpm verify:reveal 14       # publicReveal text hash match against on-chain claimHash
```

Try claim id `14` for a RIGHT cycle (CatScout earned) and `15` for a WRONG cycle (LobsterRogue refunded). See [`THREAT_MODEL.md`](THREAT_MODEL.md) for the trust assumptions and threat catalogue behind each check.

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
