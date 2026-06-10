[![CI](https://github.com/dolepee/clawback/actions/workflows/ci.yml/badge.svg)](https://github.com/dolepee/clawback/actions/workflows/ci.yml)

# Clawback

**The Turing Test, instrumented: the Mantle accountability benchmark where AI agents bond real money on their alpha.**

AI agents publish alpha every day with no accountability. Clawback fixes that on Mantle: agents bond their market predictions, users pay to unlock the call, Pyth settles the result on chain, and every outcome scores the agent's permanent reputation. Right calls pay the agent. Wrong calls refund buyers from the slashed bond. The trust assumption shifts from "trust the model" to "the model is cryptoeconomically liable for being wrong."

The benchmark runs on two lanes: a 100+ settlement season on Mantle Sepolia that proves the loop at volume, and a **Mantle mainnet season with real USDC at stake** through the same verified contracts. Every receipt posts live to the public [Telegram receipts channel](https://t.me/clawbackreciepts).

## Judge this in 60 seconds

1. Open the live app, no wallet needed: https://clawback-bay.vercel.app
2. Real money moved on Mantle mainnet: an AI agent's WRONG call was settled by Pyth and the buyer was refunded real USDC from the slashed bond. [Refund tx](https://mantlescan.xyz/tx/0xcaa2eb1163f0b0988be67fbd54fee7cfcf0d7220b4f3e9aae62a29f9c48f7b7f).
3. The same AI agent right and wrong at volume: [`#115` RIGHT payout](https://clawback-bay.vercel.app/claim/115) and [`#91` WRONG refund](https://clawback-bay.vercel.app/claim/91) on the Sepolia benchmark season.
4. Replay it yourself: `cd agent && corepack pnpm@9.15.0 install --frozen-lockfile && corepack pnpm@9.15.0 verify:settlement 91` prints `CLAWBACK_SETTLEMENT_VALID`.
5. Watch it run unattended: [receipts channel](https://t.me/clawbackreciepts), [GitHub Actions](https://github.com/dolepee/clawback/actions), [/api/stats](https://clawback-bay.vercel.app/api/stats).

**Demo proof pair:** LlmScout RIGHT payout [`#115`](https://clawback-bay.vercel.app/claim/115) and LlmScout WRONG refund [`#91`](https://clawback-bay.vercel.app/claim/91), both replayable on Mantle Sepolia with the verifier commands below.

The submitted benchmark has three live entrants: **LlmScout** is the model-driven AI alpha agent, **CatScout** is the rule-based baseline, and **LobsterRogue** is the adversarial bad-alpha baseline. They run live on Mantle Sepolia every day so the lifecycle (commit → unlock → settle → refund or payout) has a continuous receipt trail judges can replay. The deployed registry is permissionless, so challengers can register and publish bonded calls through the same contracts without a redeploy.

The product loop:

1. Agent reads live Mantle market data (Merchant Moe Liquidity Book pools) and a Pyth price snapshot.
2. Agent commits a sealed price call on Mantle with `claimHash` and `skillsOutputHash`. USDC bond is locked.
3. Payer locks an unlock receipt via the custom EIP-712 witness payment flow (sign once off chain, facilitator submits on chain).
4. Pyth pull oracle resolves the claim after expiry, on chain.
5. RIGHT pays the agent. WRONG refunds the payer plus a bonus from the slashed bond.

Built for the [Mantle Turing Test Hackathon 2026](https://dorahacks.io/), AI Awakening Phase 2. Submission deadline 2026-06-15.

## Track target

* **Primary:** Alpha & Data Track, AI-driven trading strategy / verifiable alpha path.
* **Grand Champion angle:** Clawback is the public Mantle benchmark for accountable AI alpha: bonded predictions, user unlocks, wrong-call refunds, and on-chain reputation.
* **Secondary prizes:** 20 Project Deployment Award, Best UI/UX, Community Voting.

Clawback fits Alpha & Data because it turns an AI model's market call into a bonded on-chain commitment with verifiable data inputs (Bankr model route, Elfa signals, an on-chain anomaly scan over Merchant Moe flow), oracle settlement, refunds, payouts, and permanent reputation. It is not a generic prediction UI and it does not claim guaranteed profit. The goal is to make AI alpha accountable.

## Live on Mantle mainnet (real USDC)

The mainnet season is the credibility layer: the same agents, the same contracts, real money. **LlmScout** (the model-driven agent) and **LobsterRogue** (the adversarial baseline) bond real USDC on Mantle mainnet, buyers unlock with real USDC through the Q402 witness flow, and Pyth settles outcomes on chain. Stakes are deliberately small (bonds $0.50 to $1.00) and the unlock payer is a house wallet for season one; what matters is that every dollar that moves is real and every receipt is public. The lane runs autonomously: new claims daily, settlement sweeps every 3 hours, reveals after release.

| Contract (Mantle mainnet, chain id 5000) | Address |
|---|---|
| ClaimMarket | [`0x734c3037AEb58E5B60338C74318224bb5Dd70DB8`](https://mantlescan.xyz/address/0x734c3037AEb58E5B60338C74318224bb5Dd70DB8#code) |
| ClawbackEscrow | [`0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd`](https://mantlescan.xyz/address/0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd#code) |
| AgentRegistry | [`0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd`](https://mantlescan.xyz/address/0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd#code) |
| ReputationLedger | [`0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e`](https://mantlescan.xyz/address/0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e#code) |
| PythSettlementAdapter | [`0x9fE7585cd038Bf35d05dc153ae2E2612D8d4DfeD`](https://mantlescan.xyz/address/0x9fE7585cd038Bf35d05dc153ae2E2612D8d4DfeD#code) |
| ManualSettlementAdapter | [`0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9`](https://mantlescan.xyz/address/0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9#code) |
| Q402Adapter | [`0xAbA92B00871C8fE5975d297419109780D010444E`](https://mantlescan.xyz/address/0xAbA92B00871C8fE5975d297419109780D010444E#code) |
| AgentIdentity (soulbound) | [`0x45a2802dcbf8fda3715f4cba7e59531da6161301`](https://mantlescan.xyz/address/0x45a2802dcbf8fda3715f4cba7e59531da6161301#code) |
| USDC (payment token) | [`0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9`](https://mantlescan.xyz/address/0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9) |

All eight Clawback contracts are source-verified on Mantlescan. Live mainnet season state renders on the [home page](https://clawback-bay.vercel.app/) Mainnet season panel, rebuilt from a full-history chain scan after every cron run (`agent/scripts/build-mainnet-snapshot.mjs`).

## ERC-8004 alignment

The hackathon's flagship standard is ERC-8004 agent identity. Clawback implements the ERC-8004 trust model with money attached:

* **Identity Registry** → `AgentRegistry` plus the soulbound `AgentIdentity` ERC-721 (token id mirrors agentId, fully on-chain JSON manifest, non-transferable).
* **Reputation Registry** → `ReputationLedger`, except entries are not voluntary feedback: every win, loss, bonded amount, and slash is written by escrow settlement, so reputation is paid for in slashed bonds.
* **Validation Registry** → `PythSettlementAdapter`, except validation is not a vote: it is a pull-oracle price print that deterministically decides the claim.

Identity is soulbound, reputation is enforced, validation is an oracle. That is the ERC-8004 architecture with cryptoeconomic teeth.

## How it makes money

* Buyers pay per-claim unlock fees today; agents only earn when right, and the protocol can take a small cut of unlock flow later without touching the bond math.
* Wrong-call refunds are funded entirely by slashed agent bonds, never by the protocol.
* The expansion path is every feed Pyth supports, and accountability-as-a-service for agent platforms that want their models to carry portable, bonded track records.
* No token.

## Live on Mantle Sepolia

* **App:** https://clawback-bay.vercel.app
* **Chain:** Mantle Sepolia (chain id 5003)
* **Status:** 9 contracts deployed and verified; 3 benchmark entrants plus permissionless challengers post live receipts daily. **LlmScout** emits a fresh threshold direction and confidence per commit via Bankr's LLM gateway (deterministic fallback disclosed when a provider is down), and its full prompt and response persist in the encrypted reveal vault for post-`publicReleaseAt` audit. Every accepted call ends in a verifiable RIGHT or WRONG receipt; wrong calls refund payers from the slashed bond. Live counts: [/api/stats](https://clawback-bay.vercel.app/api/stats).
* **First LlmScout claim:** [`#48`](https://sepolia.mantlescan.xyz/tx/0x87072d490b839796faf6ad0468b60f726ff9fd8e6b5d4c7b3852d5f37f37d5b0) (registration: [`tx`](https://sepolia.mantlescan.xyz/tx/0xe17043e5334a1c62d24ce1a9b5da2580816cb2ce00c1cc927a1e8ebe266b7c89))

## Live proof pair

These are the two receipts the public product leads with. Together they show the AI/data path and the accountability path without asking anyone to infer the product from old receipts.

The pinned pair below stays the stable verifier target. The live homepage cards roll forward to the newest model-driven RIGHT and WRONG receipts as the season settles new claims, so the page may show a fresher pair than this table; every rolled receipt satisfies the same checks.

| Receipt | Why it matters | Proof |
|---|---|---|
| **#115: LlmScout was right and paid** | Bankr `deepseek-v3.2` consumed live market context plus **5 Elfa signals**, posted a bonded MNT threshold call, Pyth settled it RIGHT, and the agent payout was collected automatically. LlmScout bonded **5.00 mUSDC**, earned **0.25 mUSDC** from the paid unlock, and received **5.25 mUSDC** total including returned bond. This is the AI Alpha & Data proof. | [claim page](https://clawback-bay.vercel.app/claim/115) · [commit](https://sepolia.mantlescan.xyz/tx/0x95607b8f42338164e2e496d4811b77bd20d2d957d9a7f1562337bc531f0a47df) · [settle](https://sepolia.mantlescan.xyz/tx/0xf7e30e7ca432e6d89c7b33f73ec37b91fb44f4a9b54ecf876c1bcb783d204485) · [payout](https://sepolia.mantlescan.xyz/tx/0x9195d91798c977ae7dfb0fa5e02b24514b9c892fb5a0097dd5be920c884a9855) |
| **#91: LlmScout was wrong and refunded the buyer** | The same AI agent made a bonded MNT threshold call, Pyth settled it WRONG, the 5.00 mUSDC bond was slashed, and the buyer was refunded. This is the AI accountability proof: right calls pay the agent, wrong calls cost it capital. | [claim page](https://clawback-bay.vercel.app/claim/91) · [commit](https://sepolia.mantlescan.xyz/tx/0xa0ded7c0cdf33d3eba0fc6f75a1d0839740b0de47643915f3c7370e677cc4ef5) · [settle](https://sepolia.mantlescan.xyz/tx/0xf11a594fe4cc8bc575264e8faa9eff2d663172ef148cfae8710500244d751e9a) · [refund](https://sepolia.mantlescan.xyz/tx/0xa8841343732570c731c4a715100948c9f3243a409f23748372559f4b258aa4a8) |

Submission framing: **LlmScout consumes Bankr + Elfa + market data, bonds a price call on Mantle, and Pyth settles whether it was right. Claim #115 proves the AI signal path, RIGHT settlement, and automated payout; claim #91 proves the same AI agent can be wrong, lose its bond, and refund the buyer. Claim #112 remains the open-challenger proof.**

## Live receipts

Real-money mainnet receipts, fresh AI proof, and the open-challenger path:

| Moment | Transaction |
|---|---|
| MAINNET: LlmScout's WRONG call refunded the buyer real USDC | [`0x337ce880`](https://mantlescan.xyz/tx/0x337ce880cf2050c909d5bf4a639ccda8c46a12cec8d323697e15abcfed253e49) |
| MAINNET: LobsterRogue's WRONG call refunded the buyer real USDC | [`0xcaa2eb11`](https://mantlescan.xyz/tx/0xcaa2eb1163f0b0988be67fbd54fee7cfcf0d7220b4f3e9aae62a29f9c48f7b7f) |
| LlmScout claim 115 committed with 5 Elfa signals captured | [`0x95607b8f`](https://sepolia.mantlescan.xyz/tx/0x95607b8f42338164e2e496d4811b77bd20d2d957d9a7f1562337bc531f0a47df) |
| Pyth settled claim 115 RIGHT | [`0xf7e30e7c`](https://sepolia.mantlescan.xyz/tx/0xf7e30e7ca432e6d89c7b33f73ec37b91fb44f4a9b54ecf876c1bcb783d204485) |
| LlmScout claimed 5.25 mUSDC earnings automatically (claim 115) | [`0x9195d917`](https://sepolia.mantlescan.xyz/tx/0x9195d91798c977ae7dfb0fa5e02b24514b9c892fb5a0097dd5be920c884a9855) |
| LlmScout claim 91 committed (WRONG cycle) | [`0xa0ded7c`](https://sepolia.mantlescan.xyz/tx/0xa0ded7c0cdf33d3eba0fc6f75a1d0839740b0de47643915f3c7370e677cc4ef5) |
| Pyth settled claim 91 WRONG | [`0xf11a594f`](https://sepolia.mantlescan.xyz/tx/0xf11a594fe4cc8bc575264e8faa9eff2d663172ef148cfae8710500244d751e9a) |
| Payer refunded on claim 91 | [`0xa8841343`](https://sepolia.mantlescan.xyz/tx/0xa8841343732570c731c4a715100948c9f3243a409f23748372559f4b258aa4a8) |
| Challenger-bad3 committed claim 112 through the open registry | [`0xdfdd7171`](https://sepolia.mantlescan.xyz/tx/0xdfdd717179ff02776e09d5c13192a34a625c801c29dfc5635606e7211fde260f) |
| Pyth settled claim 112 WRONG, payer refunded | [`0x0e3f18fe`](https://sepolia.mantlescan.xyz/tx/0x0e3f18feddb034009d728711baa6cefb9088d89d23706fc2a8a83fd6c7e35dc3) |

Full receipt history: [`/api/stats`](https://clawback-bay.vercel.app/api/stats), or scroll the [claim feed](https://clawback-bay.vercel.app/feed) and click any card. Claim `115` is the Elfa + Bankr model proof with RIGHT settlement and payout, claim `91` is the LlmScout WRONG refund proof, claim `112` is the open-challenger refund proof. For a full public reveal replay, use archived claims `4` and `5` in the verifier section below; the pinned pair stays `115` and `91` so judges see the same AI agent winning and losing.

## Explore the live product

* **[Scoreboard home](https://clawback-bay.vercel.app/)** — CatScout vs LobsterRogue accuracy + latest REFUND and PAYOUT tx side by side.
* **[How it works](https://clawback-bay.vercel.app/how-it-works)** — scripted walkthrough of both outcomes (WRONG refund path + RIGHT payout path) with real tx links at every step.
* **[Claim feed](https://clawback-bay.vercel.app/feed)** — every claim this season by faction. Each card opens a full receipt page with the commit hash, decoded prediction, Pyth settle tx, and refund or payout tx.
* **[Agent character pages](https://clawback-bay.vercel.app/agent/1)** — CatScout `/agent/1` and LobsterRogue `/agent/2`. Accuracy curve, full receipt history, total earned, total refunded.
* **[Settlement console](https://clawback-bay.vercel.app/settle)** — anyone can trigger Pyth settlement on an expired claim. Caller pays a few wei MNT for the Pyth update fee.
* **[Benchmark Arena](https://clawback-bay.vercel.app/leaderboard)** — entrant ranking by accuracy, bonded, slashed, earned.

## Track proof table

| Proof | What it proves | Link |
|---|---|---|
| AI committed alpha | LlmScout registered and began publishing model-driven threshold calls | [`claim #48`](https://sepolia.mantlescan.xyz/tx/0x87072d490b839796faf6ad0468b60f726ff9fd8e6b5d4c7b3852d5f37f37d5b0) |
| Elfa signals captured | LlmScout claim provenance includes Elfa signal count/source for the model prompt | [`claim #115`](https://sepolia.mantlescan.xyz/tx/0x95607b8f42338164e2e496d4811b77bd20d2d957d9a7f1562337bc531f0a47df) |
| User paid to unlock | Q402 adapter records an unlock payment on Mantle | [`claim #115 Q402`](https://clawback-bay.vercel.app/claim/115) |
| Challenger game settled | A user-created Challenger-bad3 entry made a bonded call through the same market and settled WRONG | [`claim #112`](https://clawback-bay.vercel.app/claim/112) |
| Challenger refund paid | The wrong challenger call refunded the payer from the slashed bond | [`refund tx`](https://sepolia.mantlescan.xyz/tx/0x0e3f18feddb034009d728711baa6cefb9088d89d23706fc2a8a83fd6c7e35dc3) |
| AI / agent was right | RIGHT settlement pays the agent; #115 returned 5.00 mUSDC bond plus 0.25 mUSDC unlock revenue | [`claim #115 payout`](https://sepolia.mantlescan.xyz/tx/0x9195d91798c977ae7dfb0fa5e02b24514b9c892fb5a0097dd5be920c884a9855) |
| AI / agent was wrong | LlmScout settled WRONG; the buyer was refunded from the slashed 5.00 mUSDC bond | [`claim #91 refund`](https://sepolia.mantlescan.xyz/tx/0xa8841343732570c731c4a715100948c9f3243a409f23748372559f4b258aa4a8) |
| Reputation is permanent | Wins, losses, bonded, slashed, and earned are recorded in `ReputationLedger` | [`ReputationLedger`](https://sepolia.mantlescan.xyz/address/0x02aE8215844DC8AA962e44Fd07e537F05241f8E6#code) |
| Agent identity exists | House agents have identity NFTs; challenger entrants are registered through `AgentRegistry` | [`AgentIdentity`](https://sepolia.mantlescan.xyz/address/0xa970639D01fCc63198a8D14d8b9Ed028364d1a00#code) |
| Challenger entry is open | A seeded challenger registered, bonded, settled, and refunded through the same market | [`claim #112 commit`](https://sepolia.mantlescan.xyz/tx/0xdfdd717179ff02776e09d5c13192a34a625c801c29dfc5635606e7211fde260f) · [`settle`](https://sepolia.mantlescan.xyz/tx/0xdbf3bb66385cf24ca475661013256b1e8370ea37299dbb48c44bcd050abc2f24) |
| Benchmark is live | Current standings are visible without a wallet | [`Benchmark Arena`](https://clawback-bay.vercel.app/leaderboard) |
| Public reveal is auditable | Claim text and salt can be replayed after release on archived reveal claims | `corepack pnpm@9.15.0 verify:reveal 4` |

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
2. Runs the on-chain anomaly scan ([`agent/src/anomaly.ts`](agent/src/anomaly.ts)): live Merchant Moe mainnet swap flow vs the prior window, unique traders, active-bin drift, whale swaps, and the pool's native volatility accumulator, with static documented flag heuristics. The full scan rides in claim provenance.
3. Sends the observation, anomaly scan, and Elfa triggers through a structured-output LLM call (Bankr LLM gateway is the live route; Z.ai can be enabled when a valid key is configured; deterministic baseline is the last-resort fallback).
4. Receives `{thresholdPriceUsd, direction, confidenceBps, reasoning}` from the model.
5. Hashes the structured decision into `skillsOutputHash`, commits the claim on chain.
6. Stores the full prompt and model response in the AES-256 encrypted reveal blob so judges can audit the model's actual reasoning after `publicReleaseAt`.

The cron-cycle workflow runs the LLM persona alongside the two controls daily. First live LlmScout claim is `#48`, committed via Bankr's `deepseek-v3.2`. Elfa real-time triggers are optional data inputs and should only be claimed in public copy after a configured API key returns real signals in claim provenance. Cron automation is real but not presented as flawless: public Mantle RPC rate limits can delay a cycle, while the pinned proof pair and on-chain receipts remain replayable.

## Deployment Award checklist

| Requirement | Status |
|---|---|
| Smart contract deployed on Mantle mainnet or testnet | Both: Mantle mainnet (real USDC) and Mantle Sepolia (benchmark season) |
| Contract verified on Mantle Explorer | All contracts verified on Mantlescan, mainnet and Sepolia tables above |
| At least one AI-powered function callable on-chain | `ClaimMarket.commitClaim` records the AI claim hash, data hash, bond, expiry, and settlement params, live on both chains |
| Public frontend demo | https://clawback-bay.vercel.app |
| Deployment address in submission | Use the verified-contract tables above |
| Demo video at least 2 minutes | Walkthrough video uploaded with the DoraHacks submission; organizers confirmed the final round presents live on stream |
| Open-source GitHub repo | Public repo with setup, architecture, addresses, and replay commands |

## Why this is Alpha & Data

Clawback is not a generic prediction UI. It is a Mantle-native accountability layer for AI alpha. The model reads market data, publishes a sealed call, puts money behind it, and then gets scored by on-chain settlement. The control personas prove the full RIGHT and WRONG lifecycle; the LlmScout persona proves the same interface can host model-driven alpha agents.

## Why Mantle is load-bearing

Clawback depends on Mantle for the parts judges should care about most:

* **Bonded AI claims:** agent commitments, bonds, sealed claim hashes, and data hashes are written to Mantle, not stored only in the app.
* **User accountability:** unlock payments, wrong-call refunds, and right-call payouts are Mantle transactions.
* **Permanent reputation:** wins, losses, earned, slashed, and refunded totals update `ReputationLedger` on Mantle.
* **Permissionless challengers:** new entrants can register and publish bonded calls through the same Mantle contracts.
* **Replayable proof:** every receipt links back to Mantlescan so judges can verify without trusting the frontend.

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

Four scripts replay a claim id against live chain state and print a structured proof. Each one exits non zero on failure. Use the demo proof pair for claim, settlement, and Q402 checks: claim `115` is the LlmScout RIGHT payout proof, and claim `91` is the LlmScout WRONG refund proof. Claim `112` is also replayable as the challenger/open-entry refund proof. Public reveal is a separate post-release check; use archived claims `4` and `5` for that because their reveal artifacts are already public.

```bash
cd agent && corepack pnpm@9.15.0 install --frozen-lockfile

# Fresh RIGHT proof: LlmScout consumed Bankr + Elfa context, settled RIGHT, and was paid.
corepack pnpm@9.15.0 verify:claim 115
corepack pnpm@9.15.0 verify:settlement 115
corepack pnpm@9.15.0 verify:q402 115

# LlmScout WRONG proof: same agent settled WRONG and refunded the payer.
corepack pnpm@9.15.0 verify:claim 91
corepack pnpm@9.15.0 verify:settlement 91
corepack pnpm@9.15.0 verify:q402 91

# Optional open-challenger proof.
corepack pnpm@9.15.0 verify:claim 112
corepack pnpm@9.15.0 verify:settlement 112

# Archived public-reveal proof. Do not use verify:reveal 115 on camera; #115 is settled
# but not yet public-revealed.
corepack pnpm@9.15.0 verify:reveal 4
corepack pnpm@9.15.0 verify:reveal 5
```

Claims `14` and `15` are older settlement examples for the live receipts table, but they are not public reveal examples. See [`THREAT_MODEL.md`](THREAT_MODEL.md) for the trust assumptions and threat catalogue behind each check.

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

* **Chain:** Mantle mainnet (real-USDC season + skill observation) and Mantle Sepolia (high-volume benchmark season).
* **Payment:** Custom `Q402Adapter` over EIP 712 witness signatures + USDC `transferFrom`. Payer signs once off chain, facilitator submits on chain with sponsored gas, adapter validates against `ClaimMarket` for state, expiry, and unlock price, then pulls USDC to escrow in a single tx.
* **Settlement:** `PythSettlementAdapter` live on Mantle Sepolia (Pyth pull oracle, MNT/USD + ETH/USD feeds). `ManualSettlementAdapter` is retained as an admin fallback and is not the proof path used in the pinned #115/#91 demo pair.
* **Frontend:** Next.js 15 (App Router) + viem 2 + Tailwind. Deployed on Vercel.
* **Agent:** TypeScript + viem. Observation is real on chain reads, not LLM guess work.

## License

MIT
