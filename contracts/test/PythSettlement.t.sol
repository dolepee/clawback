// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ClaimMarket} from "../src/ClaimMarket.sol";
import {ClawbackEscrow} from "../src/ClawbackEscrow.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {Q402Adapter} from "../src/Q402Adapter.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IPyth, PythSettlementAdapter} from "../src/PythSettlementAdapter.sol";

contract MockPyth is IPyth {
    mapping(bytes32 => Price) public prices;
    uint256 public fee;

    function set(bytes32 id, int64 price, uint64 conf, int32 expo, uint256 publishTime) external {
        prices[id] = Price({price: price, conf: conf, expo: expo, publishTime: publishTime});
    }

    function setFee(uint256 _fee) external {
        fee = _fee;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {
        require(msg.value >= fee, "fee");
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return fee;
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory) {
        Price memory p = prices[id];
        require(p.publishTime != 0, "no price");
        require(block.timestamp <= p.publishTime + age, "stale");
        return p;
    }
}

contract PythSettlementTest is Test {
    MockUSDC internal usdc;
    AgentRegistry internal registry;
    ClaimMarket internal market;
    ClawbackEscrow internal escrow;
    ReputationLedger internal ledger;
    PythSettlementAdapter internal pythAdapter;
    Q402Adapter internal q402;
    MockPyth internal pyth;

    address internal admin = address(0xA0);
    uint256 internal agentKey = 0xA1;
    address internal agentOwner;

    bytes32 internal constant MNT_USD = bytes32(uint256(0xAAAA));
    bytes32 internal constant ETH_USD = bytes32(uint256(0xBBBB));

    function setUp() public {
        agentOwner = vm.addr(agentKey);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new AgentRegistry();
        market = new ClaimMarket();
        escrow = new ClawbackEscrow();
        ledger = new ReputationLedger();
        pyth = new MockPyth();
        pythAdapter = new PythSettlementAdapter(
            address(pyth),
            address(escrow),
            address(market),
            MNT_USD,
            ETH_USD,
            120
        );
        q402 = new Q402Adapter(address(usdc), address(escrow));

        registry.setEscrow(address(escrow));
        ledger.setEscrow(address(escrow));
        escrow.configure(address(market), address(ledger), address(pythAdapter), address(registry), address(usdc), address(q402));
        market.configure(address(registry), address(escrow), address(pythAdapter), address(q402));
        vm.stopPrank();

        usdc.mint(agentOwner, 50_000_000);
        vm.prank(agentOwner);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _commitOutperform(int64 minOutperformBps, uint64 commitMntE8, uint64 commitEthE8)
        internal
        returns (uint256 claimId)
    {
        vm.prank(agentOwner);
        uint256 agentId = registry.registerAgent("CatScout", AgentRegistry.Faction.Cat, bytes32(0));

        bytes32 claimHash = keccak256(abi.encodePacked("MNT outperforms mETH", uint256(1)));
        bytes32 skillsHash = keccak256("v1");
        bytes memory predictionParams = abi.encode(minOutperformBps, commitMntE8, commitEthE8);

        vm.prank(agentOwner);
        claimId = market.commitClaim(
            agentId,
            claimHash,
            5_000_000,
            250_000,
            uint64(block.timestamp + 6 hours),
            uint64(block.timestamp + 24 hours),
            ClaimMarket.MarketId.MNT_OUTPERFORMS_METH,
            skillsHash,
            predictionParams
        );
    }

    function _commitThreshold(uint128 thresholdE8, uint8 direction) internal returns (uint256 claimId) {
        vm.prank(agentOwner);
        uint256 agentId = registry.registerAgent("LobsterRogue", AgentRegistry.Faction.Lobster, bytes32(0));

        bytes32 claimHash = keccak256(abi.encodePacked("MNT threshold", uint256(2)));
        bytes32 skillsHash = keccak256("v1");
        bytes memory predictionParams = abi.encode(thresholdE8, direction);

        vm.prank(agentOwner);
        claimId = market.commitClaim(
            agentId,
            claimHash,
            5_000_000,
            250_000,
            uint64(block.timestamp + 6 hours),
            uint64(block.timestamp + 24 hours),
            ClaimMarket.MarketId.MNT_USDT_THRESHOLD,
            skillsHash,
            predictionParams
        );
    }

    function test_outperform_right() public {
        uint256 claimId = _commitOutperform(int64(50), uint64(70_000_000), uint64(360_000_000_000));

        vm.warp(block.timestamp + 7 hours);
        pyth.set(MNT_USD, int64(77_000_000), 0, -8, block.timestamp);
        pyth.set(ETH_USD, int64(360_000_000_000), 0, -8, block.timestamp);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        (bool agentRight, ) = pythAdapter.resolve(claimId, abi.encode(updateData));
        assertTrue(agentRight, "MNT outperformed mETH by 10%, well above 50bps min");
    }

    function test_outperform_wrong() public {
        uint256 claimId = _commitOutperform(int64(50), uint64(70_000_000), uint64(360_000_000_000));

        vm.warp(block.timestamp + 7 hours);
        pyth.set(MNT_USD, int64(70_000_000), 0, -8, block.timestamp);
        pyth.set(ETH_USD, int64(396_000_000_000), 0, -8, block.timestamp);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        (bool agentRight, ) = pythAdapter.resolve(claimId, abi.encode(updateData));
        assertFalse(agentRight, "MNT flat, ETH +10%, agent wrong");
    }

    function test_threshold_above_right() public {
        uint256 claimId = _commitThreshold(uint128(75_000_000), 0);

        vm.warp(block.timestamp + 7 hours);
        pyth.set(MNT_USD, int64(80_000_000), 0, -8, block.timestamp);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        (bool agentRight, ) = pythAdapter.resolve(claimId, abi.encode(updateData));
        assertTrue(agentRight);
    }

    function test_threshold_below_wrong() public {
        uint256 claimId = _commitThreshold(uint128(75_000_000), 0);

        vm.warp(block.timestamp + 7 hours);
        pyth.set(MNT_USD, int64(70_000_000), 0, -8, block.timestamp);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        (bool agentRight, ) = pythAdapter.resolve(claimId, abi.encode(updateData));
        assertFalse(agentRight);
    }

    function test_revertNotExpired() public {
        uint256 claimId = _commitOutperform(int64(50), uint64(70_000_000), uint64(360_000_000_000));

        pyth.set(MNT_USD, int64(80_000_000), 0, -8, block.timestamp);
        pyth.set(ETH_USD, int64(360_000_000_000), 0, -8, block.timestamp);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        vm.expectRevert(PythSettlementAdapter.NotExpired.selector);
        pythAdapter.resolve(claimId, abi.encode(updateData));
    }

    function test_revertAlreadyResolved() public {
        uint256 claimId = _commitOutperform(int64(50), uint64(70_000_000), uint64(360_000_000_000));

        vm.warp(block.timestamp + 7 hours);
        pyth.set(MNT_USD, int64(80_000_000), 0, -8, block.timestamp);
        pyth.set(ETH_USD, int64(360_000_000_000), 0, -8, block.timestamp);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        pythAdapter.resolve(claimId, abi.encode(updateData));

        vm.expectRevert(PythSettlementAdapter.AlreadyResolved.selector);
        pythAdapter.resolve(claimId, abi.encode(updateData));
    }

    function test_revertStalePrice() public {
        uint256 claimId = _commitOutperform(int64(50), uint64(70_000_000), uint64(360_000_000_000));

        uint256 priceTs = block.timestamp;
        pyth.set(MNT_USD, int64(80_000_000), 0, -8, priceTs);
        pyth.set(ETH_USD, int64(360_000_000_000), 0, -8, priceTs);

        vm.warp(priceTs + 10 hours);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        vm.expectRevert(bytes("stale"));
        pythAdapter.resolve(claimId, abi.encode(updateData));
    }

    function test_feeForwardedToPyth() public {
        uint256 claimId = _commitOutperform(int64(50), uint64(70_000_000), uint64(360_000_000_000));
        pyth.setFee(0.01 ether);

        vm.warp(block.timestamp + 7 hours);
        pyth.set(MNT_USD, int64(80_000_000), 0, -8, block.timestamp);
        pyth.set(ETH_USD, int64(360_000_000_000), 0, -8, block.timestamp);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");

        vm.expectRevert(abi.encodeWithSelector(PythSettlementAdapter.InsufficientFee.selector, 0.01 ether, 0));
        pythAdapter.resolve(claimId, abi.encode(updateData));

        vm.deal(address(this), 1 ether);
        pythAdapter.resolve{value: 0.02 ether}(claimId, abi.encode(updateData));
        assertEq(address(pyth).balance, 0.01 ether, "pyth got fee");
    }

    function test_outcomeProofEncodedInProof() public {
        uint256 claimId = _commitOutperform(int64(50), uint64(70_000_000), uint64(360_000_000_000));

        vm.warp(block.timestamp + 7 hours);
        uint256 publishTime = block.timestamp;
        pyth.set(MNT_USD, int64(80_000_000), 0, -8, publishTime);
        pyth.set(ETH_USD, int64(360_000_000_000), 0, -8, publishTime);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = bytes("");
        (bool agentRight, bytes memory proof) = pythAdapter.resolve(claimId, abi.encode(updateData));
        assertTrue(agentRight);
        (int64 mntPrice, int64 ethPrice, uint256 ts, uint8 marketId) =
            abi.decode(proof, (int64, int64, uint256, uint8));
        assertEq(mntPrice, int64(80_000_000));
        assertEq(ethPrice, int64(360_000_000_000));
        assertEq(ts, publishTime);
        assertEq(marketId, 0);
    }

    receive() external payable {}
}
