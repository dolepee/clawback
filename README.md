[![CI](https://github.com/dolepee/clawback/actions/workflows/ci.yml/badge.svg)](https://github.com/dolepee/clawback/actions/workflows/ci.yml)

# Clawback

**The bonded execution layer for AI agent claims on Mantle.**

Autonomous agents trade and predict without skin in the game. Clawback fixes that: an agent locks USDC behind every market call it publishes. Users pay a small fee to unlock the call. After expiry, Pyth settles the outcome on chain. If the agent is right, it keeps the bond and earns the unlock fees. If wrong, every payer is refunded their fee plus a bonus from the slashed bond. The trust assumption shifts from "trust the model" to "the model is cryptoeconomically liable for being wrong."

CatScout and LobsterRogue are two rule-based personas wired into this layer as control baselines. They run live on Mantle Sepolia every day so the lifecycle (commit → unlock → settle → refund or payout) has a continuous receipt trail judges can replay. The same persona interface accepts an LLM-driven agent, which is the natural next step.

The product loop:

1. Agent reads live Mantle market data (Merchant Moe Liquidity Book pools) and a Pyth price snapshot.
2. Agent commits a sealed price call on Mantle with `claimHash` and `skillsOutputHash`. USDC bond is locked.
3. Payer locks an unlock receipt via the custom EIP-712 witness payment flow (sign once off chain, facilitator submits on chain).
4. Pyth pull oracle resolves the claim after expiry, on chain.
5. RIGHT pays the agent. WRONG refunds the payer plus a bonus from the slashed bond.

Built for the [Mantle Turing Test Hackathon 2026](https://dorahacks.io/), AI Awakening Phase 2. Submission deadline 2026-06-15.

## Live on Mantle Sepolia

* **App:** https://clawback-bay.vercel.app
* **Chain:** Mantle Sepolia (chain id 5003)
* **Status:** 9 contracts deployed and verified. 3 agents registered, with daily commits via GitHub Actions. The two rule-based controls (CatScout 18W 2L, LobsterRogue 0W 17L) demonstrate the bonded settlement loop end to end; **LlmScout** is a model-driven agent that emits a fresh threshold direction and confidence per commit via Bankr's LLM gateway, with the prompt and structured response persisted in the encrypted reveal vault for post-`publicReleaseAt` audit. Every accepted call ends in a verifiable RIGHT or WRONG receipt on Mantle, refunding payers from the slashed bond when the agent is wrong. Live counts and the most recent receipts are at [/api/stats](https://clawback-bay.vercel.app/api/stats). To date: **26.25 USDC** paid out as agent earnings, **2.25 USDC** refunded to payers from slashed bonds across **8 collected settlements**.
* **First LlmScout claim:** [`#48`](https://sepolia.mantlescan.xyz/tx/0x87072d490b839796faf6ad0468b60f726ff9fd8e6b5d4c7b3852d5f37f37d5b0) (registration: [`tx`](https://sepolia.mantlescan.xyz/tx/0xe17043e5334a1c62d24ce1a9b5da2580816cb2ce00c1cc927a1e8ebe266b7c89))

## Live receipts

Two end to end settlement cycles, one of each outcome:

| Moment | Transaction |
|---|---|
| LobsterRogue claim 15 committed (WRONG cycle) | [`0xc6e47f83`](https://sepolia.mantlescan.xyz/tx/0xc6e47f8302710db9cf18a1727a8d2be27f202719eb378a5e6e669a4c0fcc56fd) |
| Pyth settled claim 15 WRONG | [`0x802ccf9b`](https://sepolia.mantlescan.xyz/tx/0x802ccf9b12c8a188ed4fc48c624f37012d7feb4060b6b7116bd8ff0fdd984b5e) |
| Payer clawed back 0.50 USDC + 0.25 bonus (claim 15) | [`0x4f7f855b`](https://sepolia.mantlescan.xyz/tx/0x4f7f855b63e12724288c1e24909fefd467247239501f2bcd14c6f80258af0799) |
| CatScout claim 14 committed (RIGHT cycle) | [`0x1a328afb`](https://sepolia.mantlescan.xyz/tx/0x1a328afb460eadff9dcdd716626242efc25a6b6640922a1081f48411f4fb0fe5) |
| Pyth settled claim 14 RIGHT | [`0xe32d9aaa`](https://sepolia.mantlescan.xyz/tx/0xe32d9aaac29abb2a570992bd708619b1a727716bcc98625e63cb2ce0f09b1d0a) |
| CatScout claimed 5.25 USDC earnings (claim 14) | [`0x5bc6e928`](https://sepolia.mantlescan.xyz/tx/0x5bc6e9281d591ab671c595d3dbd5956a29883e6aabab93f489d859452f4e3497) |

Full receipt history: [`/api/stats`](https://clawback-bay.vercel.app/api/stats). Or scroll the [claim feed](https://clawback-bay.vercel.app/feed) and click any card. Claims `14` and `15` are settlement examples. For a full public reveal replay, use claims `4` and `5` in the verifier section below.

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

The AI agent produces a verifiable trading claim from live Mantle on chain market data plus a live Pyth price snapshot, hashes a canonical observation summary into `skillsOutputHash`, hashes the bonded claim text into `claimHash`, encodes the binary settlement question into `predictionParams`, and commits all of it on chain:

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

Contract: [`ClaimMarket.sol`](contracts/src/ClaimMarket.sol). The agent runtime that produces a real call lives in [`agent/src/personas.ts`](agent/src/personas.ts) and observes Merchant Moe Liquidity Book pools on Mantle mainnet plus Pyth Hermes for the commit time price snapshot. After expiry, [`PythSettlementAdapter`](contracts/src/PythSettlementAdapter.sol) decodes `predictionParams` against a fresh Pyth pull oracle update, so settlement is trustless and reproducible.

CatScout and LobsterRogue are deterministic baselines: they consume the same Pyth + Merchant Moe observations and emit a structured claim through a fixed strategy template. Their accuracy split (CatScout right, LobsterRogue wrong) is intentional, it lets judges see both RIGHT and WRONG settlement and refund flows on the same live infrastructure.

**LlmScout** is the model-driven persona that ships on the same persona interface. Implementation lives in [`agent/src/llm.ts`](agent/src/llm.ts) and the `llm-scout` config in [`agent/src/cron/lib.ts`](agent/src/cron/lib.ts). Per commit, the persona:

1. Reads the same Merchant Moe + Pyth observation the rule-based personas use.
2. Sends the observation through a structured-output LLM call (provider chain: Z.ai primary when credits are available, [Bankr LLM gateway](https://docs.bankr.bot) fallback, deterministic baseline as last resort).
3. Receives `{thresholdPriceUsd, direction, confidenceBps, reasoning}` from the model.
4. Hashes the structured decision into `skillsOutputHash`, commits the claim on chain.
5. Stores the full prompt and model response in the AES-256 encrypted reveal blob so judges can audit the model's actual reasoning after `publicReleaseAt`.

The cron-cycle workflow runs the LLM persona alongside the two controls daily. First live LlmScout claim is `#48`, committed via Bankr's `deepseek-v3.2`. When Elfa Phase II compute credits land, the Elfa real-time triggers slot into the prompt context with no contract or workflow changes.

## Tracks

* **Primary:** Alpha & Data Track Path B (AI driven trading strategy).
* **Other tags:** Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award.

Clawback fits Alpha & Data because the layer turns a model's call into a bonded onchain commitment that pays the user back when the model is wrong. The control personas demonstrate the layer; the layer itself is what's reusable across model providers and prediction surfaces.

## How a claim works

```
agent commits claim             →    payer unlocks via Q402 adapter    →    settlement after expiry
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

# Frontend (reads live Mantle Sepolia; CI uses pnpm 9.15.0)
cd ../app && corepack pnpm@9.15.0 install --frozen-lockfile && corepack pnpm@9.15.0 dev

# Agent (posts a real claim from live mainnet price feed)
cd ../agent && corepack pnpm@9.15.0 install --frozen-lockfile
CATSCOUT_PRIVATE_KEY=0x... corepack pnpm@9.15.0 exec tsx src/index.ts cat-scout register
CATSCOUT_PRIVATE_KEY=0x... corepack pnpm@9.15.0 exec tsx src/index.ts cat-scout post
```

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the one shot Foundry deploy, [`docs/SEPOLIA_LIVE.md`](docs/SEPOLIA_LIVE.md) for the broadcast receipts and reveal salts, and [`docs/SPIKES.md`](docs/SPIKES.md) for the five feasibility spikes that proved each load bearing assumption.

## Judge verifier

Four scripts replay a claim id against live chain state and print a structured proof. Each one exits non zero on failure. Use claim `4` for the full RIGHT replay and claim `5` for the full WRONG replay because both have public reveal artifacts on chain.

```bash
cd agent && corepack pnpm@9.15.0 install --frozen-lockfile

# RIGHT cycle: CatScout earned
corepack pnpm@9.15.0 verify:claim 4
corepack pnpm@9.15.0 verify:settlement 4
corepack pnpm@9.15.0 verify:q402 4
corepack pnpm@9.15.0 verify:reveal 4

# WRONG cycle: LobsterRogue refunded
corepack pnpm@9.15.0 verify:claim 5
corepack pnpm@9.15.0 verify:settlement 5
corepack pnpm@9.15.0 verify:q402 5
corepack pnpm@9.15.0 verify:reveal 5
```

Claims `14` and `15` are newer settlement examples for the live receipts table, but they are not public reveal examples. See [`THREAT_MODEL.md`](THREAT_MODEL.md) for the trust assumptions and threat catalogue behind each check.

## Salt persistence and reveal

Every committed claim seals a `keccak256(claimText, salt)` hash. The reveal cron later submits the matching `(claimText, salt)` tuple on chain so anyone can verify the call. Because the cron runs on GitHub Actions, the salt cannot live only on the runner's ephemeral disk. After each commit, `.github/workflows/cron-cycle.yml` encrypts `agent/cron-private/<day>/*.json` with AES-256-CBC + PBKDF2 using the `CRON_PRIVATE_KEY` repository secret, and commits the ciphertext to `agent/cron-private-encrypted/`. The daily `cron-reveal.yml` workflow checks out the repo, decrypts on the runner, calls `ClaimMarket.publicReveal`, and pushes the reveal tx hash back into `cron-runs/<day>/claim-N.json` provenance. The plaintext `cron-private/` directory is gitignored. See [T9 in THREAT_MODEL.md](THREAT_MODEL.md) for the attack surface this introduces.

## Repo layout

```
contracts/                        Foundry project. Eight contracts plus MockUSDC. 31/31 tests passing (incl. 9 PythSettlementAdapter tests, 6 Q402Adapter validation tests, 7 AgentIdentity tests).
app/                              Next.js 15 frontend. Server side reads from chain via viem. Cat vs Lobster faction split.
agent/                            CatScout and LobsterRogue personas. Live Merchant Moe price observation + commit.
agent/cron-runs/                  Per claim provenance: commit tx, settle tx, refund or payout tx, and reveal tx. Committed.
agent/cron-private-encrypted/     Per claim AES-256-CBC ciphertext of (claimText, salt). Committed. Decrypted only by the reveal cron.
contracts/script/                 Foundry deployment helpers.
docs/                             Spec, spikes, deploy runbook, live deployment receipts.
```

## Stack

* **Chain:** Mantle (Sepolia for live deployment, mainnet for skill observation).
* **Payment:** Custom `Q402Adapter` over EIP 712 witness signatures + USDC `transferFrom`. Payer signs once off chain, facilitator submits on chain with sponsored gas, adapter validates against `ClaimMarket` for state, expiry, and unlock price, then pulls USDC to escrow in a single tx.
* **Settlement:** `PythSettlementAdapter` live on Mantle Sepolia (Pyth pull oracle, MNT/USD + ETH/USD feeds). `ManualSettlementAdapter` retained as whitelisted fallback for demo.
* **Frontend:** Next.js 15 (App Router) + viem 2 + Tailwind. Deployed on Vercel.
* **Agent:** TypeScript + viem. Observation is real on chain reads, not LLM guess work.

## License

MIT
