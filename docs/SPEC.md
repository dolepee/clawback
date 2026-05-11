# Clawback Spec

Performance guaranteed AI agent calls on Mantle. Agents publish price resolvable claims with a bonded commitment. Users pay via Q402 to unlock the call privately before public release. If the agent is wrong, escrow refunds the user from the slashed bond. If right, the agent keeps payment.

## 1. Hackathon target

* **Event:** Mantle Turing Test Hackathon 2026 (Phase 2 AI Awakening)
* **Submit:** June 15, 2026 (DoraHacks)
* **Demo Day:** July 2 to 3, 2026
* **Winners announced:** July 10, 2026
* **Primary track:** Alpha & Data Track Path B (AI driven trading strategy). Track shifted from Agentic Wallets & Economy on 2026-05-10 after DoraHacks requirements clarified that Agentic Economy needs load bearing Byreal / RealClaw integration. Byreal evaluation gate runs 2026-05-18 to 2026-05-22.
* **Other tags:** Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award (FCFS race posture).
* **Build window:** May 18 to June 14, 2026 (28 days solo). Spike work landed early (2026-05-10), so the schedule compressed in favor of FCFS Deployment Award.
* **Sponsors that must be load bearing:** Q402 by QuackAI, Mantle chain. Byreal Skills CLI is conditional, gated on the May 18 to 22 evaluation.

## 2. The one sentence

**"AI calls that pay you back when they are wrong."**

This sentence is the headline of the demo, the README, the X thread, and the submission writeup. Every design decision is stress tested against whether it strengthens or dilutes that sentence. If a feature does not strengthen it, the feature does not ship.

## 2.1 Non-negotiables

These rules are immutable for v1. Any pull to break one is a scope creep signal.

* Do not expand beyond price resolvable claims.
* Do not build per agent X accounts.
* Do not make Q402 responsible for refunds.
* Do not reveal paid claim details publicly before unlock window expires.
* Do not ship without one wrong call refund and one right call payout on Mantle.

## 3. Why Clawback wins this hackathon

* **Avoids the CreditGate pattern.** No cap, refuse, record substrate to pattern match. New primitive, new mental model.
* **Q402 is load bearing.** Gasless unlock, sign once authorization, escrow routing. Not a checkout button bolted on.
* **Mantle records the full trail.** Claim hash, bond lock, payment, settlement proof, refund or slash, reputation update. Every key decision and outcome on chain.
* **Byreal Skills earn their place.** Agent uses Skills to inspect pools, read prices, generate the thesis before posting the claim. The Skills output hash is committed with the claim so the reasoning is provably Mantle native.
* **Single emotional binary in the demo.** Right gets paid. Wrong pays back. No third state to explain.
* **Cat vs Lobster wraps for free.** Two factions, two seeded agents, no theme grafting cost.
* **Cultural fit with judge panel.** Animoca and Virtuals invest in agent narrative. Nansen and Allora invest in data accountability. Clawback hits both.

## 4. Claim lifecycle (the canonical flow)

This section is the source of truth. All contracts and pages obey it.

1. **Commit.** Agent computes claimHash from full claim text plus salt. Agent calls ClaimMarket.commitClaim with claimHash, bond amount, unlock price, expiry, publicReleaseAt, marketId, and the hash of its Byreal Skills reasoning output. Bond locks in escrow.
2. **Public teaser.** ClaimMarket emits the teaser (market name, expiry, bond, unlock price). Full claim text stays private. Anyone can see the teaser; nobody can see the call.
3. **Paid unlock.** User signs once via Q402 and pays unlock price into ClawbackEscrow. Escrow notifies ClaimMarket which records the user as authorized. The full claim text is delivered to the user privately (signed payload off chain or encrypted to user pubkey on chain). Other users still see only the teaser.
4. **Settlement.** At expiry, SettlementAdapter is triggered. Adapter reads the price observation, computes outcome (agent right or wrong), and writes settlement proof to ClawbackEscrow. Proof includes source identifier, observed price, timestamp, block number, formula version.
5. **Public reveal.** After settlement (or after publicReleaseAt if earlier), anyone calls ClaimMarket.publicReveal with the original claim text and salt. Contract verifies hash match and stores claim text on chain. Now everyone can see what the call was.
6. **Distribution.** ClawbackEscrow distributes funds based on outcome. Right: agent earnings claimable, bond returns. Wrong: paid users get claimable refund + pro rata share of slashed bond up to bonus cap.

## 5. Contract architecture

### 5.1 AgentRegistry.sol

* `registerAgent(string handle, uint8 faction, bytes32 metadataHash)` returns agentId
* `bondedBalance(agentId)` returns uint256
* `slashableBondedBalance(agentId)` returns uint256
* Faction enum: 0 = Cat, 1 = Lobster
* Emits `AgentRegistered(agentId, owner, handle, faction)`

### 5.2 ClaimMarket.sol

Commit, paid unlock, public reveal flow. The full claim text never appears on chain until step 5 of section 4.

* `commitClaim(uint256 agentId, bytes32 claimHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes32 skillsOutputHash)` returns claimId
* `recordPaidUnlock(uint256 claimId, address payer)` called by ClawbackEscrow after Q402 payment confirmation. Marks payer as authorized for private delivery. Off chain delivery happens via signed payload from the platform service to the payer.
* `publicReveal(uint256 claimId, string claimText, uint256 salt)` callable by anyone after settlement OR after publicReleaseAt, whichever is earlier. Verifies keccak256(claimText, salt) matches stored claimHash. Writes claim text to chain.
* `getClaim(uint256 claimId)` returns teaser, hash, bond, unlock price, expiry, publicReleaseAt, skillsOutputHash, settlement state, revealed claim text (empty until step 5).
* Markets enum v1:
  * marketId 0: MNT_OUTPERFORMS_METH (winner is asset with higher percent change at expiry)
  * marketId 1: MNT_USDT_THRESHOLD (claim asserts MNT above or below a price at expiry)
* Emits `ClaimCommitted, PaidUnlockRecorded, ClaimSettled, ClaimPubliclyRevealed`

### 5.3 ClawbackEscrow.sol

Holds Q402 payments and agent bonds. **Pull pattern for refunds and earnings.** No push payments at settlement.

* `acceptPayment(uint256 claimId, address payer, uint256 amount)` called by the Q402 settlement layer. Records `paidAmount[payer][claimId] += amount` and `totalPaid[claimId] += amount`.
* `lockBond(uint256 agentId, uint256 claimId, uint256 amount)` called by ClaimMarket when claim commits.
* `settle(uint256 claimId, bool agentRight, bytes settlementProof)` callable by SettlementAdapter only. Stores proof. On wrong, computes slashed bond pool and bonus cap.
* `claimRefund(uint256 claimId)` pull. Caller receives `paidAmount[msg.sender][claimId]` plus pro rata share of `slashedBondPool[claimId]` capped at `bonusCapBps` of paid amount. Zeroes paidAmount after withdrawal. ERC20 transfer to msg.sender.
* `claimAgentEarnings(uint256 agentId, uint256 claimId)` pull. Agent operator receives totalPaid[claimId] for right claims, plus bond returned.
* `claimableRefund(address user, uint256 claimId)` view helper for the UI.
* Storage: `paidAmount[user][claimId]`, `totalPaid[claimId]`, `bondAtStake[claimId]`, `slashedBondPool[claimId]`, `bonusCapBps` (e.g. 5000 = 50% bonus cap).
* On agent right: agent earnings claimable, bond returns. Paid users keep the call (which was correct), no refund.
* On agent wrong: all paidAmount become claimable refunds. Slashed bond pool distributes pro rata bonus to payers, capped per user at `bonusCapBps` of their paid amount. Any unclaimed slashed bond after a long claim window can be swept to a treasury or burnt (decision deferred).
* Emits `PaymentAccepted, BondLocked, ClaimSettled, RefundClaimed, EarningsClaimed, BondSlashed`

### 5.4 ReputationLedger.sol

* `recordOutcome(uint256 agentId, bool agentRight, uint256 bondAtRisk)` callable only by ClawbackEscrow.
* Tracks per agent: wins, losses, total bonded, total slashed, total earned, **accuracyBps** (basis points where 10000 = 100%).
* `agentScore(uint256 agentId)` returns the full struct.
* Emits `ReputationUpdated`

### 5.5 SettlementAdapter (interface + manual implementation)

* `interface ISettlementAdapter { function resolve(uint256 claimId, bytes calldata params) external returns (bool agentRight, bytes memory proof); }`
* **v1 implementation: ManualSettlementAdapter.** Admin triggers settlement after capturing a recorded price snapshot. Settlement proof MUST include: source identifier string (e.g. "fluxion_mnt_meth_pool_observation" or "manual_admin"), observed price, observed timestamp, block number at observation, formula version.
* **DEX TWAP fallback path.** If no oracle is available for the pair, the manual adapter records a TWAP snapshot read from Fluxion or Merchant Moe pool reserves at the observation block. Verifier replays the snapshot against the same pool state at the same block. This is honest and replayable.
* **Stretch v2 during polish week:** PythSettlementAdapter or ChainlinkSettlementAdapter swappable behind the same ISettlementAdapter interface, but **only after ramp confirms Mantle support for the relevant pair feeds**. Do not promise either oracle in the README until the ramp validates the integration. Manual adapter remains the v1 floor regardless.

### 5.6 Settlement honesty

The manual settlement is not hand waving. It is a documented v1 fallback with full proof recording. The verifier script (`npm run verify:claim`) replays the recorded source against on chain data (DEX pool reserves at the observed block, or oracle reading if available) and asserts the manual call matches. If the verifier shows a mismatch, the settlement is challengeable. Judges can run this script themselves.

### 5.7 Contract count flexibility

Five contracts is clean architecturally. If shipping speed demands it during build, AgentRegistry and ReputationLedger can merge into AgentLedger; ClaimMarket and ClawbackEscrow can merge into ClaimEscrow. Do not hold the project hostage to clean architecture if it costs days. Decision point: end of week 1 (May 30).

## 6. Q402 integration

Q402 is the gasless payment and unlock rail. **Q402 is not the refund rail.**

* User signs **once** via EIP 712 to authorize a Q402 spending allowance against ClawbackEscrow.
* No MNT in user wallet required. Gasless unlock.
* Each paid unlock decrements the allowance.
* Unused allowance expires per Q402 EIP 7702 delegated execution config.
* Payment routes to ClawbackEscrow.acceptPayment, not the agent. Agent only receives at settlement if right.

**Refunds are handled inside ClawbackEscrow.** User calls claimRefund(claimId) on the escrow contract and receives an ERC20 transfer of their paid amount plus pro rata bonus. This decouples the refund flow from any Q402 SDK assumption and makes the contract self contained. If Q402 later exposes a refund routing primitive, integration is a future enhancement, not a v1 dependency.

The Q402 sign once flow is the demo's UI/UX prize candidate. No popup spam, no gas fees, no chain switching prompts. Web2 user understands it.

## 7. Frontend pages

Built with Next.js, deployed to Vercel.

### `/` claim feed

Two columns. Left column: Cat agent claims. Right column: Lobster agent claims. Each card shows handle, faction crest, claim teaser ("MNT vs mETH, 6 hours"), bond amount, unlock price, expiry countdown. Hot claims at top. The full claim text is never visible here; only teaser metadata.

### `/claim/[id]` claim card

Pre unlock state: blurred reasoning placeholder, visible bond, countdown, single Q402 unlock button.
Post unlock state (only the paying user sees this): full claim reasoning delivered privately, position size guidance, settlement time, on chain unlock receipt link.
Post settlement state: outcome banner (RIGHT or WRONG), refund or earnings receipt, Claim Refund button if applicable, share to X button.
Post public reveal: full claim text becomes publicly visible to non payers as well.

### `/agent/[id]` reputation page

Agent handle and faction. Lifetime accuracyBps (rendered as percent for humans). Wins, losses, total bonded, total slashed. Recent claims list with outcomes. Trust score visualization. Share agent button.

### `/settle` settlement console

Public dashboard of pending and recently settled claims. After expiry, anyone can trigger the SettlementAdapter via a public method; admin can also trigger from this UI as the v1 fallback. Settlement proof displayed inline. Verifier link.

### `/leaderboard`

Top agents by accuracyBps. Bottom agents by losses. Cat faction vs Lobster faction tally.

## 8. Agent runtime

Built on Byreal Skills CLI. One agent runner script per persona.

* Cat and Lobster agents both run as Node processes against Byreal Skills.
* Skills used: `inspect_pools`, `quote_swap`, `read_price`, `analyze_volatility`.
* Agent decides claim direction based on Skills output plus a randomness seed for variety.
* **Agent commits the hash of its Skills output along with the claim hash.** This makes the reasoning provably Mantle native.
* Agent commits claim with bond from its operator address.
* Private claim delivery to paying users runs through a small platform service that signs payloads with the agent's key.
* Agent does not settle itself. Settlement is independent.

V1 has two seeded agents. CatScout (conservative, smaller bonds, more right calls) and LobsterRogue (aggressive, larger bonds, more wrong calls). Seeded history shows realistic distribution including both right and wrong outcomes.

## 9. X distribution

**One platform X account.** Not per agent.

The handle posts every claim with the agent's persona attribution: "LobsterRogue posted a call: MNT vs mETH, 6h. Bond 10 USDC. Unlock 0.50 USDC. <link>"

Settlement results auto post: "LobsterRogue was wrong. Refund pool open: 4.20 USDC paid, 7.50 USDC of slashed bond available pro rata. <link to receipt>"

The receipt cards (rendered server side as Open Graph images) are the viral atom.

## 10. Cat vs Lobster identity

* Cat faction: cautious, analytical, lower bonds, higher accuracy bias.
* Lobster faction: aggressive, contrarian, larger bonds, lower accuracy bias.
* Each agent registration picks one faction permanently.
* Faction crest appears on every claim card.
* Faction tally on leaderboard.
* The demo always shows a Cat right call and a Lobster wrong call. Cultural cleanness for free.

## 11. Demo script (60 seconds for video)

**0 to 8 seconds: hook.** Black screen, white text. "An AI sold me a call. It was wrong. Mantle paid me back."

**8 to 18 seconds: setup.** Show the LobsterRogue claim card. "MNT beats mETH in 6 hours. Bond 10 USDC."

**18 to 25 seconds: pay.** User clicks unlock, single Q402 sign, card opens. Show the reasoning. "Unlocked for 0.50 USDC. No gas needed."

**25 to 38 seconds: wrong outcome.** Time skip to settlement. Card flips to WRONG state. User clicks Claim Refund. 0.50 USDC returns plus 1.20 USDC bonus from slashed bond. Show on chain tx link.

**38 to 50 seconds: right counterexample.** CatScout's claim resolves right. Agent gets paid 0.50 USDC, reputation up.

**50 to 60 seconds: thesis.** Black screen. "Agents can sell calls. On Mantle, they must be accountable. Clawback. Live now."

## 12. Legal copy posture

The product is not investment advice. Public copy uses the language **"experimental agent signal,"** **"accountable market call,"** or **"agent prediction"** rather than "alpha" or "trading advice" wherever it touches user facing surfaces (landing page, share cards, X copy, README intro). The internal doc and demo script can use "alpha" colloquially because that is the cultural register, but the consumer surface stays clean. Agents are clearly labeled as experimental and not financial advisors. Refunds are an accountability mechanic, not a guarantee of outcomes.

## 13. Out of scope

These are explicitly **not** in v1:

* Narrative predictions (X engagement based)
* Per agent X bot accounts
* Broad prediction market with arbitrary claim types
* Multiple market pairs beyond MNT vs mETH and MNT vs USDT
* Plain ClawCard spending card primitive
* CALLER full caller network
* Mirage selective state visibility
* Cross chain settlement
* Mobile app
* Agent operator dashboard for tuning Skills (operator runs raw scripts in v1)
* Q402 refund routing dependency

## 14. Build calendar

### May 18 to 22 (5 days, ramp)
* Mantle Skills CLI hello world. Get a Skill running locally.
* Q402 hello world. Sign once, pay 1 cent USDC, observe escrow.
* **Confirm Mantle Pyth or Chainlink support for MNT vs mETH and MNT vs USDT.** If no support, lock DEX TWAP from Fluxion as the v1 settlement source.
* Sketch SettlementAdapter interface and manual implementation.
* Lock contract surface with stub implementations.

### May 23 to Jun 1 (10 days, contracts)
* AgentRegistry full impl + tests.
* ClaimMarket commit, paid unlock, public reveal + tests.
* ClawbackEscrow with claimable refund pull pattern + tests.
* ReputationLedger + tests.
* ManualSettlementAdapter + DEX TWAP fallback + tests.
* Deploy to Mantle testnet.
* Verifier script `npm run verify:claim` working end to end.

### Jun 2 to 8 (7 days, frontend + agent)
* Next.js scaffold, Vercel deploy.
* Claim feed, claim detail, agent page, settle console, leaderboard.
* Q402 sign once flow integrated and tested.
* Private delivery service for paid unlocks (server signed payload).
* CatScout and LobsterRogue agent runners on Byreal Skills.
* Platform X account integrated for auto posting.
* Open Graph receipt card image rendering.

### Jun 9 to 12 (4 days, polish)
* Cat vs Lobster visual identity locked.
* Seed five claims with mixed outcomes (3 right, 2 wrong).
* Demo dry run.
* README polished with judge replay instructions.
* THREAT_MODEL.md written.
* HACKQUEST_SUBMISSION.md drafted.
* Stretch: try Pyth or Chainlink integration if Mantle support confirmed during ramp.

### Jun 13 to 14 (2 days, ship)
* Demo video shot and edited.
* X launch thread written.
* DoraHacks submission with all sponsor prize tags (Mantle, QuackAI, Byreal).
* Final README pass.
* Submit before June 15 close.

## 15. Risk register

### R1: Settlement oracle integration blocks
* **Likelihood:** Medium
* **Impact:** High
* **Mitigation:** Manual settlement adapter ships day one as the v1 fallback. DEX TWAP from Fluxion or Merchant Moe is the no oracle path. Settlement proof recording is honest and replayable. Pyth or Chainlink integration is a stretch goal during Jun 9 to 12 polish week, swappable behind the SettlementAdapter interface. Do not promise either oracle in the README until ramp validates Mantle support.

### R2: Q402 SDK shape unknown until ramp
* **Likelihood:** Low
* **Impact:** Medium
* **Mitigation:** Q402 hello world is the first task on May 18. If SDK is unstable, fall back to a thin Q402 adapter contract that wraps the EIP 712 sign once flow manually. Refund flow does not depend on Q402 either way.

### R3: Looks like another prediction market
* **Likelihood:** Medium
* **Impact:** High
* **Mitigation:** Frame and demo lead with the refund moment, not the prediction. The product is "AI accountable calls," not "prediction market." README opens with the wrong call demo, not the architecture.

### R4: Two seeded agents feel artificial
* **Likelihood:** High
* **Impact:** Low
* **Mitigation:** Seed five real claims with mixed outcomes during polish week. Show real on chain settlement proofs in demo. Honesty about being a hackathon submission is fine; faking volume is not.

### R5: 28 days is tight for solo
* **Likelihood:** Medium
* **Impact:** High
* **Mitigation:** Strict scope lock (section 13). If any feature creeps, drop it. Core demo (one wrong, one right, on chain proof, claimRefund flow) is the minimum viable submission.

### R6: Q402 user education curve
* **Likelihood:** Medium
* **Impact:** Medium
* **Mitigation:** Sign once flow is the entire UX. No second prompt for unlocks until allowance expires. Onboarding tooltip on first unlock. UI copy emphasizes "no gas needed."

### R7: Slashed bond economics overpromise
* **Likelihood:** Low
* **Impact:** Medium
* **Mitigation:** bonusCapBps caps each user's bonus at a fixed percent of their paid amount. Pool can never overpromise. Any unclaimed slashed bond after a long window is decided by governance later, not v1.

### R8: Private delivery of paid unlocks complicates trust
* **Likelihood:** Medium
* **Impact:** Medium
* **Mitigation:** Platform service signs payloads with a key whose pubkey is registered on chain. User can verify the signed payload matches the on chain claim hash. After publicReleaseAt, the claim text goes on chain via publicReveal so anyone can verify the original delivery was honest.

## 16. Submission checklist

### Code
* [ ] All five contracts (or merged equivalent) deployed to Mantle (testnet acceptable, mainnet preferred if funded)
* [ ] Verifier scripts: `npm run verify:claim`, `npm run verify:settlement`, `npm run verify:q402`, `npm run verify:reveal`
* [ ] Agent runners committed with seeded history reproducible
* [ ] Private delivery service code public

### Repo
* [ ] README with one sentence headline, demo video link, judge replay instructions
* [ ] THREAT_MODEL.md
* [ ] HACKQUEST_SUBMISSION.md with sponsor prize tags
* [ ] LICENSE (MIT)

### Submission portal
* [ ] DoraHacks project page filled
* [ ] Sponsor prize boxes ticked: Alpha & Data Track Path B primary, Mantle Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award. Agentic Economy only if Byreal gate passes.
* [ ] Q402 called out explicitly in writeup. Byreal mentioned only if load bearing integration shipped.
* [ ] Live URL working
* [ ] GitHub repo public

### Marketing
* [ ] Demo video on YouTube, 2+ minutes (Deployment Award requirement, not 60 seconds)
* [ ] X launch thread, 5 to 7 tweets, leads with the wrong call refund moment
* [ ] Open Graph receipt cards verified on Twitter card validator
* [ ] One screenshot ready for Community Voting share moment

## 17. Verifier output template

The judge replay script must print this exact output for a settled wrong claim that has been refunded:

```
CLAWBACK_CLAIM_VALID
agent identity: registered (LobsterRogue, faction Lobster)
claim committed: yes (block N, hash 0x...)
skills output hash: recorded (0x...)
public teaser visible: yes (no claim text leaked)
user paid via Q402: yes (0.50 USDC, escrow received)
private delivery signed: yes (signature verifies against on chain pubkey)
agent bond locked: yes (10 USDC at commit)
settlement adapter: ManualSettlementAdapter
settlement proof: recorded (source fluxion_mnt_meth_pool_observation, price obs 0x..., timestamp T, block N+M, formula v1)
settlement outcome: agent wrong
public reveal: yes (claim text matches commit hash)
refund claimable: 0.50 USDC + 1.20 USDC bonus (pro rata, capped at bonusCapBps 5000)
refund withdrawn: yes (tx 0x..., user balance updated)
agent slashed: yes (8 USDC slashed from bond)
reputation updated: yes (LobsterRogue accuracyBps 4100 to 3800)
verdict: PERFORMANCE_GUARANTEED_AGENT_CALL_VALID
```

For a settled right claim, replace the wrong path with the right path receipts (agent pulled earnings via claimAgentEarnings, no refund, accuracyBps up).

## 18. Hackathon lessons applied

Mapping to the eight failure modes from prior losses:

1. **Named primitive not category:** Clawback. Not "agent platform." Not "prediction market."
2. **Demo binary moment:** WRONG card flip to refund. RIGHT card flip to payout. Single binary, no third state.
3. **Multi component sponsor stack:** Mantle chain + Q402 escrow + Mantle on chain market data (Merchant Moe Liquidity Book pools observed for ground truth pricing). Byreal Skills agent is conditional on the May 18 to 22 gate.
4. **Agent as protagonist:** CatScout and LobsterRogue have public reputations. Agents earn or lose based on their own claims. They are the subjects, not the tools.
5. **Track rubric obsession:** Alpha & Data Track Path B single primary track. Claims are AI driven trading strategy commitments generated from live on chain data, bonded, verifiably settled. Direct fit, no straddle.
6. **No fake volume:** Five seeded claims, real on chain settlement, honest about being a hackathon submission.
7. **Distribution craft:** X account posts every claim and settlement. Receipt cards designed for share. UI copy stress tested.
8. **One sentence test:** "AI calls that pay you back when they are wrong." Passes.

---

End of spec. v1 locked. Refinements during May 18 ramp can adjust contract surface details and Q402 integration shape, but the product thesis, claim lifecycle (section 4), scope, demo, and one sentence are immutable.
