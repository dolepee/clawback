# Mantle Sepolia live deployment

Latest broadcast 2026-05-11 (**v3 Q402 validating + Pyth aware redeploy**). Chain id 5003. All 8 contracts verified on Mantlescan via Etherscan v2 API.

## Public frontend

* Production: https://clawback-bay.vercel.app

## v3 contracts (verified)

| Contract | Address | Deploy tx |
|---|---|---|
| MockUSDC (mUSDC) | `0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd` | (kept from v1, never redeployed) |
| AgentRegistry | `0x0b7B93C0E6591bD415BEDE8B8DCD57171f4A7851` | `0x4da5fcea1ed20ca59fda295f4879b35102ee8046570ebc616424c47c2c188277` |
| ClaimMarket | `0x8C076c7452E526526De877F86BBb4BA37E027af9` | `0x600d7ca74f79855fd14ce11aed709ecffa1b4d4d5a633e3550059dd2efd638fb` |
| ClawbackEscrow | `0xEa02e04E9550eA556235B46d10b554b876C16d2a` | `0x0542448d6b5997dcf64326055681a3aaafcf185628473e7245df1ff095adbf9f` |
| ReputationLedger | `0x02aE8215844DC8AA962e44Fd07e537F05241f8E6` | `0x957e912e3fa1d04d1e6567e9cf8155f57bf276fd0192d8935864194651b3aed1` |
| ManualSettlementAdapter | `0x19E3597340b57950D7893b1805c54c81d341C540` | `0x152e308bb3f6a2701aec71a6114a084fe2bc782a4eaa5e6ce64963546712db89` |
| PythSettlementAdapter | `0x78a138EB1EaB4fAcB0fe982F685AB2B29a8562d3` | `0x5867f22564d036abb656d776971a2eccea03df8f05fc49dc04e5b90ee291bfb2` |
| Q402Adapter | `0x3Eba0528a19295d0A48EFD4c38DC4100462761aB` | `0x0078a4c327609cd53aa32c86ea77ea21325a5bc62d4fe20439dcc2397e67b28f` |

Explorer prefix: https://sepolia.mantlescan.xyz/address/

AI on chain function for Deployment Award: `ClaimMarket.commitClaim(uint256 agentId, bytes32 claimHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes32 skillsOutputHash, bytes predictionParams)`.

## What changed in v3

v3 hardens the Q402 unlock path. v2 `Q402Adapter.accept` accepted any signed witness and credited the escrow without checking the claim. v3 adds `ClaimMarket.recordPaidUnlock(uint256 claimId, address payer, uint256 amount)` which the adapter is now required to call. The market enforces:

* Claim must exist and be in `Committed` state (not settled, not publicly revealed).
* `block.timestamp < expiry`.
* `amount == claim.unlockPrice` exactly.

This closes the v2 hole where a payer could "unlock" against a non-existent or wrong-priced claimId by signing whatever they wanted. The Q402Adapter signature surface stays unchanged: payer signs once off chain, facilitator pays gas.

## Pyth integration

Pyth pull oracle on Mantle Sepolia at `0x98046Bd286715D3B0BC227Dd7a956b83D8978603`. The adapter is registered on both ClawbackEscrow and ClaimMarket via `setSettlementAdapter(adapter, true)` (multi adapter whitelist mapping replaces the v1 single address gate).

| Param | Value |
|---|---|
| Pyth contract | `0x98046Bd286715D3B0BC227Dd7a956b83D8978603` |
| MNT/USD feed | `0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585` |
| ETH/USD feed | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| Max age | 120 seconds |
| Hermes endpoint | https://hermes.pyth.network/v2/updates/price/latest |

Two markets supported by `PythSettlementAdapter.resolve`:

* `MNT_OUTPERFORMS_METH` (marketId 0). `predictionParams = abi.encode(int64 minOutperformBps, uint64 commitMntPriceE8, uint64 commitEthPriceE8)`. Adapter checks `(mntReturnBps  ethReturnBps) >= minOutperformBps` at expiry.
* `MNT_USDT_THRESHOLD` (marketId 1). `predictionParams = abi.encode(uint128 thresholdPriceE8, uint8 direction)` where direction 0=above, 1=below. Adapter compares fresh Pyth MNT/USD against threshold.

Settlement caller must include `bytes[] updateData` from Hermes plus `getUpdateFee` worth of MNT. Excess fee is refunded.

## Wallets

| Role | Address |
|---|---|
| Deployer | `0xa9bd33558575190b75a0614dE83eE65EDd4dE1d0` |
| CatScout agent | `0xf731808CC42CCF249D436773Da1CD0493E4B5D65` |
| LobsterRogue agent | `0x32FEc59b5D30Fe38F91DDB3eea8a13A3ae8a0711` |
| Payer | `0xDe35D0EfBfB548B7B2aCa63598885e4628aAc01B` |
| Facilitator | `0x7135f0D2Be3Df19cE2D612C204d50Cb058B615F6` |

Private keys are in `.env` (gitignored). Throwaway testnet only.

## Agents registered (v3)

| Agent | agentId | Register tx |
|---|---|---|
| CatScout | 1 | `0x213db73c0a8114902c00be92987856683e817b0190daf690666208c8b0bcad15` |
| LobsterRogue | 2 | `0x44d1445f123817c74bda5f4c263dba57ad650a01676cb603513372742684f1a0` |

CatScout is `outperform` market (MNT outperforms mETH). LobsterRogue is `threshold` market (MNT below $0.50).

## Claims posted (v3)

### claimId=1, CatScout (MNT outperforms mETH)

Posted 2026-05-11 at Mantle Sepolia block 38494251. Pyth commit snapshot: MNT $0.6982, ETH $2337.15.

| Field | Value |
|---|---|
| poster | CatScout (`0xf731808CC42CCF249D436773Da1CD0493E4B5D65`) |
| marketId | `0` (MNT_OUTPERFORMS_METH) |
| bond locked | `5_000_000` mUSDC (5 USDC, 6 decimals) |
| unlock price | `250_000` mUSDC (0.25 USDC) |
| expiry | `2026-05-12T02:59:09.000Z` |
| publicReleaseAt | `2026-05-12T20:59:09.000Z` |
| claimHash | `0xc6461ec0f64a3099015179de1a361ccaebbaad82f9515a9286fe479b8a0f68e6` |
| skillsOutputHash | `0x27dabe258f3c1e5b1cedc103811490e39149034fca6648366f907a759934e943` |
| predictionParams | `abi.encode(int64 minOutperformBps=100, uint64 commitMntE8=69_815_887, uint64 commitEthE8=233_714_724_801)` |
| reveal salt | `815687474309396864` |
| commit tx | `0xd1efe6417cbfada2dee0d8fdebdfacca8c9a0e97f44c9deb42843188c1ac6050` |

## Q402 unlock confirmed (claimId 1)

Q402 end to end test passes against v3. Payer signed an EIP-712 witness off chain for 250000 mUSDC (claim 1 unlock price). Facilitator submitted `Q402Adapter.accept`. Adapter validated against `ClaimMarket.recordPaidUnlock` (state=Committed, not expired, amount matches unlock price), pulled USDC from payer, forwarded to escrow.

| Field | Value |
|---|---|
| payer | `0xDe35D0EfBfB548B7B2aCa63598885e4628aAc01B` |
| facilitator | `0x7135f0D2Be3Df19cE2D612C204d50Cb058B615F6` |
| amount | `250_000` mUSDC |
| accept tx | `0xa50c3249fad2c7d07fb90364023d7feb62feaa9ddcc5519458b6e9ae08ec13e9` |
| paidAmount(payer, 1) on escrow | `250_000` |
| paidUnlock[1][payer] on market | `true` |
| gas used | 157_763 |
| payer gas cost | 0 (facilitator pays) |

## v2 deploy (deprecated 2026-05-11)

v2 shipped Pyth integration but the Q402Adapter accepted any signed claimId without market validation. Superseded by v3 the same day. Kept in `.env` as commented references.

| Contract | v2 address |
|---|---|
| AgentRegistry v2 | `0xCD501459545a4245EeF895DA052f915A46d57C61` |
| ClaimMarket v2 | `0xCE7C1C25f0acb8011624f0686DD7A92074a2951E` |
| ClawbackEscrow v2 | `0x4316E36d533fB2A066491569457eE2010DCC951e` |
| ReputationLedger v2 | `0x365766dC95915483234D6bD01662728CdC7750B4` |
| ManualSettlementAdapter v2 | `0x4907cC08B4c7eb30Da666A20F757e49cc3b65080` |
| PythSettlementAdapter v2 | `0x92893b655332428fcd4A09AEf7daEa78F8eaa1cC` |
| Q402Adapter v2 | `0xe09C4F01405f35665E991Ce565b5200ABBd9163B` |

## v1 deploy (deprecated 2026-05-11)

v1 was the manual-only deploy. Superseded by v2 once Pyth integration shipped.

| Contract | v1 address |
|---|---|
| AgentRegistry v1 | `0x734c3037AEb58E5B60338C74318224bb5Dd70DB8` |
| ClaimMarket v1 | `0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd` |
| ClawbackEscrow v1 | `0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e` |
| ReputationLedger v1 | `0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9` |
| ManualSettlementAdapter v1 | `0xAbA92B00871C8fE5975d297419109780D010444E` |
| Q402Adapter v1 | `0xF8fE1d95f0C3F2aF70fB2663c5989CCeD38Ee83d` |

## Bootstrap status

* v3 deploy bundle: 7 fresh contracts (MockUSDC kept from v1).
* mUSDC minted in v1 bootstrap: CatScout 50, LobsterRogue 50, Payer 20 (token kept, balances intact).
* MNT gas top up: CatScout, LobsterRogue, Facilitator each 0.3 (from v1 bootstrap). Payer topped up 0.05 MNT on 2026-05-11 v3 cycle.

## Remaining steps before submission

* ~~Verify all v3 contracts on Mantlescan~~ DONE.
* ~~Re-register agents on v3~~ DONE.
* ~~Q402 unlock end to end on v3~~ DONE.
* Wire unlock + refund + claim-earnings buttons into the frontend.
* Rebuild `/settle` page to list pending + settled claims with Pyth resolve action.
* Cut 2+ min demo video.
* DoraHacks submission. Tags: Alpha & Data primary, Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award.
