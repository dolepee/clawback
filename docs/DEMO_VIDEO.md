# Demo video shot list

**Target length:** 2 minutes 15 seconds. The DoraHacks 20 Project Deployment Award requires 2+ minutes. Anything shorter disqualifies. Anything past 3 minutes loses judges.

**Headline frame:** the WRONG refund vs RIGHT payout binary moment. Everything in the video must lead to that frame.

## Recording setup

* **Tool:** OBS Studio at 1920x1080, 30fps. Single scene with browser + terminal split. Audio: built in mic at 48kHz, monotone delivery. No music.
* **Browser:** Chrome incognito, zoom 100%, browser at https://clawback-bay.vercel.app.
* **Terminal:** dark theme, 14pt mono, full screen the relevant blocks only.
* **Wallet:** MetaMask sidebar showing the CatScout wallet (`0xf731808C`) and Payer wallet (`0xDe35D0E`) with mUSDC balances visible.
* **Mantlescan tab pre-loaded** to ClaimMarket contract page so we can swap to it without searching.

## Shot list (12 shots, each cued by a numbered card)

| # | Duration | Shot | Voice over |
|---|---|---|---|
| 1 | 0:00 to 0:08 | Title card "Clawback" on black, then fade to live homepage at clawback-bay.vercel.app | "Clawback. AI calls that pay you back when they are wrong." |
| 2 | 0:08 to 0:20 | Scroll the homepage. Linger on Cat faction claim #1 and Lobster faction claim #2. | "Two agents on Mantle Sepolia. CatScout, Lobster Rogue. Each one bonds USDC on a price call." |
| 3 | 0:20 to 0:32 | Click into claim #1. Show the sealed commit hash, bond locked, expires panel, "Outcome pending" banner. | "Pre unlock, the call is sealed. Only the commit hash is on chain. The bond is locked in escrow." |
| 4 | 0:32 to 0:42 | Cut to Mantlescan: ClaimMarket contract page, then `commitClaim` write function highlighted. | "The AI on chain function is `commitClaim`. Hash of the call, hash of the reasoning trace, bond, expiry. All committed in one transaction." |
| 5 | 0:42 to 0:55 | Cut to terminal: agent CLI running, agent reads Merchant Moe pools, prints observed price, hashes, commits. | "Every claim starts from live on chain market data. The agent reads Merchant Moe Liquidity Book pools, hashes the reasoning, signs the commit. No LLM guess work in settlement." |
| 6 | 0:55 to 1:10 | Cut to Q402 unlock flow: terminal showing payer signs once, facilitator submits, payment lands. Wallet update visible. | "Unlock costs a fraction of the bond. Payer signs once via Q402. Facilitator pays gas. USDC moves to escrow. Payer sees the call." |
| 7 | 1:10 to 1:25 | Cut to revealed claim detail page: full claim text visible, "Outcome pending" still shown. | "Payer now reads the actual call. Sealed until they paid. After expiry, the oracle settles." |
| 8 | 1:25 to 1:45 | **The WRONG path.** Trigger ManualSettlementAdapter.settle with agentRight=false. Cut to claim page now showing the red "WRONG → refund" banner. Wallet animation showing payer's mUSDC balance going up. | "If the agent was wrong, escrow refunds the payer. Original payment back, plus a bonus from the slashed bond. This is the Clawback." |
| 9 | 1:45 to 2:00 | **The RIGHT path.** Cut to a different claim where settlement=true. Green banner "RIGHT". Wallet of CatScout showing earnings claimed. | "If the agent was right, the agent keeps the payment and the bond. Reputation goes up on chain." |
| 10 | 2:00 to 2:10 | Leaderboard page: Cat vs Lobster faction tally, accuracy column visible. | "Public reputation. Anyone can see which agents are right more often. Anyone can bet on the right ones." |
| 11 | 2:10 to 2:15 | End card. Frontend URL, GitHub URL, hackathon tag (Mantle Turing Test, Alpha and Data Path B). | "Clawback. Live on Mantle Sepolia. github.com/dolepee/clawback." |

## What needs to exist before recording

* Both claim 1 and claim 2 still alive (or replaced by a fresh pair if expired). Current expiry: claim 1 at 22:21 UTC, claim 2 at 23:15 UTC on 2026-05-11.
* At least one settled WRONG claim and one settled RIGHT claim, ideally for the same agent so reputation moves visibly. Plan to settle claim 1 as WRONG after expiry, then post a third short expiry claim that resolves RIGHT before recording.
* A funded Payer wallet (`0xDe35D0E`) holding ~5 mUSDC and pre-approved to Q402Adapter. Already minted 10 mUSDC at bootstrap; verify approval before recording.
* The agent CLI capable of running in front of a camera without secrets leaking. Use a dummy PRIVATE_KEY env or screenshot the commit tx after the fact.

## Pre flight checklist (run within 30 minutes of recording)

* [ ] https://clawback-bay.vercel.app loads under 3s, claims visible, no Vercel auth wall.
* [ ] At least one claim in each of SETTLED RIGHT, SETTLED WRONG, COMMITTED states.
* [ ] Mantlescan contract tabs all show "Contract Source Code Verified" with green check.
* [ ] Payer wallet has mUSDC and Q402Adapter approval for at least 1 USDC.
* [ ] OBS scene composition tested. Audio level peaks around -12 dB.

## Notes

* Avoid the word "blockchain" in the voice over. Say "on chain" or "on Mantle" instead. Judges are saturated with the former.
* Keep voice over factual. The product is the punchline. No hype adjectives.
* Caption every dollar amount on screen. Movement should be readable without audio.
* Render at 1080p, upload to YouTube unlisted, link in DoraHacks submission.
