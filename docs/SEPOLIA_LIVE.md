# Mantle Sepolia live deployment

Latest broadcast 2026-05-11 (**v2 Pyth aware redeploy**). Chain id 5003. All 8 contracts verified on Mantlescan via Etherscan v2 API.

## Public frontend

* Production: https://clawback-bay.vercel.app

## v2 contracts (verified)

| Contract | Address | Deploy tx |
|---|---|---|
| MockUSDC (mUSDC) | `0xaa10CDD12C1a8D8Aa3a14658B7872a7f6d641DDd` | (kept from v1, never redeployed) |
| AgentRegistry | `0xCD501459545a4245EeF895DA052f915A46d57C61` | `0xb48c09b89fcd282dbdde7ae05ebe4170f30baeca948f9ff7e5296dac4c995065` |
| ClaimMarket | `0xCE7C1C25f0acb8011624f0686DD7A92074a2951E` | `0x0c81aaab9d68e37dd523fae47954c9dd4c238a6414873511450e70f3cebc2cc7` |
| ClawbackEscrow | `0x4316E36d533fB2A066491569457eE2010DCC951e` | `0xb3ff34e0386b3abaea531b6ac2d01ef4cd59081a4e52d62658022d7ae56cc31c` |
| ReputationLedger | `0x365766dC95915483234D6bD01662728CdC7750B4` | `0x47fb87bb44490bfd2866f340377b77091492a49f94e5e4a538dd96de541c916d` |
| ManualSettlementAdapter | `0x4907cC08B4c7eb30Da666A20F757e49cc3b65080` | `0x58ff7def23e75478c234710fbf9425454d0ed487809590eedfc7f91c64965388` |
| PythSettlementAdapter | `0x92893b655332428fcd4A09AEf7daEa78F8eaa1cC` | `0x75f427770fbfaba8a4436c3109333fe6d23c4e3586ba6d27c0ffe43482f1edfd` |
| Q402Adapter | `0xe09C4F01405f35665E991Ce565b5200ABBd9163B` | `0xa3fb573bae20f534bff9d0a79f34eecca9b33ed2972b7a1a2dccf0a61663c63c` |

Explorer prefix: https://sepolia.mantlescan.xyz/address/

AI on chain function for Deployment Award: `ClaimMarket.commitClaim(uint256 agentId, bytes32 claimHash, uint256 bondAmount, uint256 unlockPrice, uint64 expiry, uint64 publicReleaseAt, uint8 marketId, bytes32 skillsOutputHash, bytes predictionParams)`.

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

* `MNT_OUTPERFORMS_METH` (marketId 1). `predictionParams = abi.encode(int64 minOutperformBps, uint64 commitMntPriceE8, uint64 commitEthPriceE8)`. Adapter checks `(mntReturnBps  ethReturnBps) >= minOutperformBps` at expiry.
* `MNT_USDT_THRESHOLD` (marketId 2). `predictionParams = abi.encode(uint128 thresholdPriceE8, uint8 direction)` where direction 0=above, 1=below. Adapter compares fresh Pyth MNT/USD against threshold.

Settlement caller must include `bytes[] updateData` from Hermes plus `getUpdateFee` worth of MNT. Excess fee is refunded.

## v1 deploy (deprecated 2026-05-11)

v1 was the manual only deploy from earlier the same day. Superseded by v2 once Pyth integration shipped. Kept in `.env` as commented references.

| Contract | v1 address |
|---|---|
| AgentRegistry v1 | `0x734c3037AEb58E5B60338C74318224bb5Dd70DB8` |
| ClaimMarket v1 | `0xb4726194AEDA8677d2504b1c3B38bbA653cEDaEd` |
| ClawbackEscrow v1 | `0x02e5A959253588D3ef5370fE7A8fdA990AD27B3e` |
| ReputationLedger v1 | `0xDbf0Ff11961F579549a2FfC5Da67A06566ad0Eb9` |
| ManualSettlementAdapter v1 | `0xAbA92B00871C8fE5975d297419109780D010444E` |
| Q402Adapter v1 | `0xF8fE1d95f0C3F2aF70fB2663c5989CCeD38Ee83d` |

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

* v2 deploy bundle: 7 fresh contracts (MockUSDC kept from v1).
* mUSDC minted in v1 bootstrap: CatScout 50, LobsterRogue 50, Payer 10 (token kept, balances intact).
* MNT gas top up: CatScout, LobsterRogue, Facilitator each 0.3 (from v1 bootstrap).

## Bootstrap transactions (v1, still valid for token + gas)

* Mint CatScout: `0x01a4e744fd877e29c5f8b1560a308fd483e5d0bef4d2eea63e97536283e7db91`
* Mint LobsterRogue: `0x02302a84c5d6358b85696e8f1d55d57f6824bff6946deed38633db4824ff4f29`
* Mint Payer: `0xbe5c723aaa6f3aabaad114f0bb9ef85d9122e0459b141ad4e064db0b35ea2b51`
* Gas top up CatScout: `0x73447a20109dff21c3e0c2d15a662933cc9bdb181169f731cd10d9c547df904b`
* Gas top up LobsterRogue: `0xdd6d29278ea48d8223d2b5bf3104068c8afa00e8badca090ec8c2083f7bffadf`
* Gas top up Facilitator: `0x15544176fb4b9238d6c041337fe180b2e78a8eec5fb6e67942364f1f6601d470`

## Agents registered (v2)

| Agent | agentId (v2) | Register tx |
|---|---|---|
| CatScout | 1 | `0xcf398a0b7e34269c4de99499de0054494b83d53ff8f25e6b4ecf682b9cac0c70` |
| LobsterRogue | 2 | `0x45f4c08a585b2945526aef6f62e94ee38f82eebdb31145a5d9a911564e6b5a79` |

CatScout is `outperform` market (MNT outperforms mETH). LobsterRogue is `threshold` market (MNT below $0.50).

## Claims posted (v2)

### claimId=1, CatScout (MNT outperforms mETH)

Posted 2026-05-11 at Mantle Sepolia block 38488634. Pyth commit snapshot: MNT $0.6985, ETH $2339.57.

| Field | Value |
|---|---|
| poster | CatScout (`0xf731808CC42CCF249D436773Da1CD0493E4B5D65`) |
| marketId | `1` (MNT_OUTPERFORMS_METH) |
| bond locked | `5_000_000` mUSDC (5 USDC, 6 decimals) |
| unlock price | `250_000` mUSDC (0.25 USDC) |
| expiry | `2026-05-11T23:52:00.000Z` |
| publicReleaseAt | `2026-05-12T17:52:00.000Z` |
| claimHash | `0xfbd3c05b4a7daad06b020d5a1cad20003d5e8c9dd0a3839676f7741bdbc6987a` |
| skillsOutputHash | `0x645a7f7159ec9fdbd406a8d10f6bf0437b6109e3f87598310aa5911ea21dc06a` |
| predictionParams | `abi.encode(int64 minOutperformBps=100, uint64 commitMntE8=69_853_000, uint64 commitEthE8=233_957_000_000)` |
| reveal salt | `168161722474905248` |
| commit tx | `0x97a59c6165e2c87ecfe374da2c16e108274734626420fe399113d5736b013531` |

### claimId=2, LobsterRogue (MNT/USD below $0.50)

Posted 2026-05-11 at Mantle Sepolia block 38488659. Pyth commit snapshot: MNT $0.6986.

| Field | Value |
|---|---|
| poster | LobsterRogue (`0x32FEc59b5D30Fe38F91DDB3eea8a13A3ae8a0711`) |
| marketId | `2` (MNT_USDT_THRESHOLD) |
| bond locked | `10_000_000` mUSDC (10 USDC) |
| unlock price | `500_000` mUSDC (0.50 USDC) |
| expiry | `2026-05-11T23:52:48.000Z` |
| publicReleaseAt | `2026-05-12T17:52:48.000Z` |
| claimHash | `0xade10744ca77b5d8ae9550ace28402e1c5797653983cd4c5a9f111d3212c31b8` |
| skillsOutputHash | `0xb6794f8868ae15037a5e7656e842e1ade18b12feb82ca2a95786e03767c9e8d7` |
| predictionParams | `abi.encode(uint128 thresholdE8=50_000_000, uint8 direction=1)` (below $0.50) |
| reveal salt | `366595548593548672` |
| commit tx | `0x6b6fba90eb7c0b954a67a14a6d7e554127aed027bf7c13d97051e3731f0295b2` |

The reveal salt is required for `publicReveal(claimId, salt)` after `publicReleaseAt`. Keep both safe.

## v1 reference claims (deprecated, frontend points to v2)

* v1 claim 1 commit tx: `0x985232e00377890d67a9562b6aa99f9fdf0b5c26668dd3cb9a2df420ab4852e7` (salt `446365743140400000`).
* v1 claim 2 commit tx: `0x0bfc4fafbfdf0ceabfac89614aeb8c6a13bf67cb59c7204be1c5bf3202dac602` (salt `228844448287121568`).

## Remaining steps before FCFS race package

* ~~Verify all v2 contracts on Mantlescan~~ DONE.
* ~~Deploy Pyth settlement adapter~~ DONE (verified at `0x92893b655332428fcd4A09AEf7daEa78F8eaa1cC`).
* ~~Frontend on Vercel reading v2 state~~ DONE (https://clawback-bay.vercel.app).
* Cut 2+ min demo video.
* DoraHacks submission. Tags: Alpha & Data primary, Grand Champion, UI/UX, Community Voting, 20 Project Deployment Award.
