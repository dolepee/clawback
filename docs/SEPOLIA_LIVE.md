# Mantle Sepolia live deployment

Broadcast 2026-05-11. Chain id 5003.

## Contracts

| Contract | Address |
|---|---|
| MockUSDC (mUSDC) | `0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd` |
| AgentRegistry | `0x734c3037AEb58E5B60338C74318224bb5Dd70DB8` |
| ClaimMarket | `0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd` |
| ClawbackEscrow | `0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e` |
| ReputationLedger | `0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9` |
| SettlementAdapter (manual) | `0xAbA92B00871C8fE5975d297419109780D010444E` |
| Q402Adapter | `0xF8fE1d95f0C3F2aF70fB2663c5989CCeD38Ee83d` |

Explorer prefix: https://sepolia.mantlescan.xyz/address/

## Wallets

| Role | Address |
|---|---|
| Deployer | `0xa9bd33558575190b75a0614dE83eE65EDd4dE1d0` |
| CatScout agent | `0xf731808CC42CCF249D436773Da1CD0493E4B5D65` |
| LobsterRogue agent | `0x32FEc59b5D30Fe38F91DDB3eea8a13A3ae8a0711` |
| Payer | `0xDe35D0EfBfB548B7B2aCa63598885e4628aAc01B` |
| Facilitator | `0x7135f0D2Be3Df19cE2D612C204d50Cb058B615F6` |

Private keys are in `.env` (gitignored). Throwaway testnet only.

## Bootstrap status

* Deploy bundle: 7 contracts, ~0.53 MNT burned. Deployer balance after: 4.46 MNT.
* mUSDC minted: CatScout 50, LobsterRogue 50, Payer 10.
* MNT gas top-up: CatScout 0.3, LobsterRogue 0.3, Facilitator 0.3.

## Bootstrap transactions

* Deploy tx: see `contracts/broadcast/Deploy.s.sol/5003/run-latest.json`.
* Mint CatScout: `0x01a4e744fd877e29c5f8b1560a308fd483e5d0bef4d2eea63e97536283e7db91`
* Mint LobsterRogue: `0x02302a84c5d6358b85696e8f1d55d57f6824bff6946deed38633db4824ff4f29`
* Mint Payer: `0xbe5c723aaa6f3aabaad114f0bb9ef85d9122e0459b141ad4e064db0b35ea2b51`
* Gas top-up CatScout: `0x73447a20109dff21c3e0c2d15a662933cc9bdb181169f731cd10d9c547df904b`
* Gas top-up LobsterRogue: `0xdd6d29278ea48d8223d2b5bf3104068c8afa00e8badca090ec8c2083f7bffadf`
* Gas top-up Facilitator: `0x15544176fb4b9238d6c041337fe180b2e78a8eec5fb6e67942364f1f6601d470`

## Agents registered

| Agent | agentId | Register tx |
|---|---|---|
| CatScout | 1 | `0x2e2b83235ef67f11948c5c622c886e2c41630c5d75842bb515c618518216ffbf` |
| LobsterRogue | 2 | `0x357ae476c50175ce8fbe751c092267f2c63880c9e0182c397bb0253d80cda8bd` |

LobsterRogue register script printed `agentId=0` due to RPC read after write lag. Verified on chain via `cast call agentIdByOwner` that LobsterRogue is `agentId=2`. Cosmetic only, on chain state is correct.

## First claim posted (CatScout, claimId=1)

Posted 2026-05-11. Observation: 3638.83483935 MNT/mETH at Mantle mainnet block 95193079 (Merchant Moe Liquidity Book pools).

| Field | Value |
|---|---|
| claimId | `1` |
| poster | CatScout (`0xf731808CC42CCF249D436773Da1CD0493E4B5D65`) |
| bond locked | `5_000_000` mUSDC (5 USDC, 6 decimals) |
| unlock price | `250_000` mUSDC (0.25 USDC) |
| expiry | `2026-05-11T22:21:13.000Z` |
| publicReleaseAt | `2026-05-12T16:21:13.000Z` |
| claimHash | `0x4d82b2e19561c87a82d624cfb5c0c22aa551b23e1c6c22e80740de4a07636008` |
| skillsOutputHash | `0x33dc78dac4a9372768b57f5e4cfa7f101c590847b477829192e3afde32772452` |
| reveal salt | `446365743140400000` |
| commit tx | `0x985232e00377890d67a9562b6aa99f9fdf0b5c26668dd3cb9a2df420ab4852e7` |

The reveal salt is required for `publicReveal(claimId, salt)` after `publicReleaseAt`. Keep it safe.

## Remaining steps before FCFS race package

* Verify all 7 contracts on Mantlescan (`forge verify-contract` per contract, needs `MANTLESCAN_API_KEY`).
* Scaffold frontend (Next.js), deploy to Vercel. Claim feed page reading from `ClaimMarket` events.
* Cut 2+ min demo video.
* README polish with deployed addresses and AI on chain function (`commitClaim`) callout.
* DoraHacks submission. Tags: Alpha & Data primary, Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award.
