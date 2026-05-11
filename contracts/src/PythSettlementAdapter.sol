// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementAdapter, IClawbackEscrowSettle, IClaimMarketSettle} from "./SettlementAdapter.sol";

/// @dev Subset of the Pyth pull-oracle interface used by this adapter.
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function updatePriceFeeds(bytes[] calldata updateData) external payable;
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 feeAmount);
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory);
}

interface IClaimMarketRead {
    enum MarketId { MNT_OUTPERFORMS_METH, MNT_USDT_THRESHOLD }
    enum ClaimState { Committed, Settled, PubliclyRevealed }

    struct Claim {
        uint256 agentId;
        bytes32 claimHash;
        bytes32 skillsOutputHash;
        uint256 bondAmount;
        uint256 unlockPrice;
        uint64 expiry;
        uint64 publicReleaseAt;
        MarketId marketId;
        ClaimState state;
        string revealedClaimText;
        bytes predictionParams;
    }

    function getClaim(uint256 claimId) external view returns (Claim memory);
}

/// @notice Settlement adapter that resolves claims using Pyth pull-oracle prices.
/// @dev `resolve(claimId, params)` expects `params = abi.encode(bytes[] updateData)`.
///      The caller funds the Pyth update fee by forwarding native MNT in msg.value.
contract PythSettlementAdapter is ISettlementAdapter {
    IPyth public immutable pyth;
    address public immutable clawbackEscrow;
    address public immutable claimMarket;
    bytes32 public immutable mntUsdFeedId;
    bytes32 public immutable ethUsdFeedId;
    uint256 public immutable priceMaxAge;

    event PythSettlement(
        uint256 indexed claimId,
        bool agentRight,
        int64 mntPrice,
        int64 ethPrice,
        uint256 publishTime
    );

    error NotExpired();
    error AlreadyResolved();
    error UnsupportedMarket();
    error InvalidPrice();
    error InsufficientFee(uint256 required, uint256 provided);
    error PythUpdateFailed();

    constructor(
        address _pyth,
        address _clawbackEscrow,
        address _claimMarket,
        bytes32 _mntUsdFeedId,
        bytes32 _ethUsdFeedId,
        uint256 _priceMaxAge
    ) {
        pyth = IPyth(_pyth);
        clawbackEscrow = _clawbackEscrow;
        claimMarket = _claimMarket;
        mntUsdFeedId = _mntUsdFeedId;
        ethUsdFeedId = _ethUsdFeedId;
        priceMaxAge = _priceMaxAge;
    }

    function resolve(uint256 claimId, bytes calldata params)
        external
        payable
        returns (bool agentRight, bytes memory proof)
    {
        IClaimMarketRead.Claim memory c = IClaimMarketRead(claimMarket).getClaim(claimId);
        if (block.timestamp < c.expiry) revert NotExpired();
        if (c.state != IClaimMarketRead.ClaimState.Committed) revert AlreadyResolved();

        bytes[] memory updateData = abi.decode(params, (bytes[]));
        uint256 fee = pyth.getUpdateFee(updateData);
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        pyth.updatePriceFeeds{value: fee}(updateData);

        int64 mntPrice;
        int64 ethPrice;
        uint256 publishTime;

        if (c.marketId == IClaimMarketRead.MarketId.MNT_OUTPERFORMS_METH) {
            (agentRight, mntPrice, ethPrice, publishTime) = _resolveOutperform(c.predictionParams);
        } else if (c.marketId == IClaimMarketRead.MarketId.MNT_USDT_THRESHOLD) {
            (agentRight, mntPrice, publishTime) = _resolveThreshold(c.predictionParams);
        } else {
            revert UnsupportedMarket();
        }

        proof = abi.encode(mntPrice, ethPrice, publishTime, uint8(c.marketId));

        IClawbackEscrowSettle(clawbackEscrow).settle(claimId, agentRight, proof);
        IClaimMarketSettle(claimMarket).markSettled(claimId, agentRight);

        emit PythSettlement(claimId, agentRight, mntPrice, ethPrice, publishTime);

        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert PythUpdateFailed();
        }
    }

    /// @dev predictionParams = abi.encode(int64 minOutperformBps, uint64 commitMntPriceE8, uint64 commitEthPriceE8).
    ///      Prices are interpreted as expo=-8 fixed point. Return >= minOutperformBps wins.
    function _resolveOutperform(bytes memory predictionParams)
        internal
        view
        returns (bool agentRight, int64 mntPrice, int64 ethPrice, uint256 publishTime)
    {
        (int64 minOutperformBps, uint64 commitMntPriceE8, uint64 commitEthPriceE8) =
            abi.decode(predictionParams, (int64, uint64, uint64));

        IPyth.Price memory mnt = pyth.getPriceNoOlderThan(mntUsdFeedId, priceMaxAge);
        IPyth.Price memory eth = pyth.getPriceNoOlderThan(ethUsdFeedId, priceMaxAge);
        if (mnt.price <= 0 || eth.price <= 0) revert InvalidPrice();

        uint256 mntNow = _toE8(mnt);
        uint256 ethNow = _toE8(eth);

        int256 mntReturnBps = int256((mntNow * 10_000) / commitMntPriceE8) - 10_000;
        int256 ethReturnBps = int256((ethNow * 10_000) / commitEthPriceE8) - 10_000;
        int256 outperformBps = mntReturnBps - ethReturnBps;

        agentRight = outperformBps >= int256(minOutperformBps);
        mntPrice = mnt.price;
        ethPrice = eth.price;
        publishTime = mnt.publishTime < eth.publishTime ? mnt.publishTime : eth.publishTime;
    }

    /// @dev predictionParams = abi.encode(uint128 thresholdPriceE8, uint8 direction).
    ///      direction 0 = MNT/USD price must be >= threshold to win, 1 = must be <= threshold.
    function _resolveThreshold(bytes memory predictionParams)
        internal
        view
        returns (bool agentRight, int64 mntPrice, uint256 publishTime)
    {
        (uint128 thresholdPriceE8, uint8 direction) = abi.decode(predictionParams, (uint128, uint8));

        IPyth.Price memory mnt = pyth.getPriceNoOlderThan(mntUsdFeedId, priceMaxAge);
        if (mnt.price <= 0) revert InvalidPrice();

        uint256 mntNow = _toE8(mnt);
        if (direction == 0) {
            agentRight = mntNow >= uint256(thresholdPriceE8);
        } else {
            agentRight = mntNow <= uint256(thresholdPriceE8);
        }
        mntPrice = mnt.price;
        publishTime = mnt.publishTime;
    }

    /// @dev Normalise Pyth price (expo can vary, usually -8) into 1e8 fixed point.
    function _toE8(IPyth.Price memory p) internal pure returns (uint256) {
        uint256 raw = uint256(uint64(p.price));
        if (p.expo == -8) return raw;
        if (p.expo < -8) {
            return raw / (10 ** uint32(-8 - p.expo));
        }
        return raw * (10 ** uint32(p.expo + 8));
    }
}
