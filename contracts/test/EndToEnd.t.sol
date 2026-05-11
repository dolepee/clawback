// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ClaimMarket} from "../src/ClaimMarket.sol";
import {ClawbackEscrow} from "../src/ClawbackEscrow.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {ManualSettlementAdapter} from "../src/SettlementAdapter.sol";
import {Q402Adapter} from "../src/Q402Adapter.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice S5: Minimal end-to-end happy + sad path.
///         Agent commits, two payers unlock via Q402, manual settlement,
///         right path -> agent earnings, wrong path -> payer refund + bonus.
contract EndToEndTest is Test {
    MockUSDC internal usdc;
    AgentRegistry internal registry;
    ClaimMarket internal market;
    ClawbackEscrow internal escrow;
    ReputationLedger internal ledger;
    ManualSettlementAdapter internal settlement;
    Q402Adapter internal q402;

    address internal admin = address(0xA0);
    uint256 internal agentKey = 0xA1;
    address internal agentOwner;
    uint256 internal alicePk = 0xA11CE;
    address internal alice;
    uint256 internal bobPk = 0xB0B;
    address internal bob;
    address internal facilitator = address(0xFAC);

    bytes32 internal constant WITNESS_TYPEHASH = keccak256(
        "Witness(address owner,uint256 claimId,uint256 amount,uint256 deadline,bytes32 paymentId,uint256 nonce)"
    );

    function setUp() public {
        agentOwner = vm.addr(agentKey);
        alice = vm.addr(alicePk);
        bob = vm.addr(bobPk);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new AgentRegistry();
        market = new ClaimMarket();
        escrow = new ClawbackEscrow();
        ledger = new ReputationLedger();
        settlement = new ManualSettlementAdapter(admin, address(escrow), address(market));
        q402 = new Q402Adapter(address(usdc), address(escrow), address(market));

        registry.setEscrow(address(escrow));
        ledger.setEscrow(address(escrow));
        escrow.configure(address(market), address(ledger), address(settlement), address(registry), address(usdc), address(q402));
        market.configure(address(registry), address(escrow), address(settlement), address(q402));
        vm.stopPrank();

        usdc.mint(agentOwner, 50_000_000);
        usdc.mint(alice, 10_000_000);
        usdc.mint(bob, 10_000_000);

        vm.prank(agentOwner);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(alice);
        usdc.approve(address(q402), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(q402), type(uint256).max);
    }

    function _commitClaim(uint256 bondAmount, uint256 unlockPrice) internal returns (uint256 agentId, uint256 claimId) {
        vm.prank(agentOwner);
        agentId = registry.registerAgent("CatScout", AgentRegistry.Faction.Cat, bytes32(0));

        bytes32 claimHash = keccak256(abi.encodePacked("MNT outperforms mETH next 6h", uint256(0xC0FFEE)));
        bytes32 skillsHash = keccak256("merchant_moe_lb_observation_v1");

        bytes memory predictionParams = abi.encode(int64(50), uint64(70_000_000), uint64(360_000_000_000));

        vm.prank(agentOwner);
        claimId = market.commitClaim(
            agentId,
            claimHash,
            bondAmount,
            unlockPrice,
            uint64(block.timestamp + 6 hours),
            uint64(block.timestamp + 24 hours),
            ClaimMarket.MarketId.MNT_OUTPERFORMS_METH,
            skillsHash,
            predictionParams
        );
    }

    function _signAndPay(uint256 payerKey, address payer, uint256 claimId, uint256 amount, uint256 nonce) internal {
        Q402Adapter.Witness memory w = Q402Adapter.Witness({
            owner: payer,
            claimId: claimId,
            amount: amount,
            deadline: block.timestamp + 600,
            paymentId: bytes32(nonce),
            nonce: nonce
        });
        bytes32 structHash = keccak256(
            abi.encode(WITNESS_TYPEHASH, w.owner, w.claimId, w.amount, w.deadline, w.paymentId, w.nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", q402.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(facilitator);
        q402.accept(w, sig);
    }

    function test_endToEnd_agentRight() public {
        (uint256 agentId, uint256 claimId) = _commitClaim(5_000_000, 250_000);

        assertEq(usdc.balanceOf(address(escrow)), 5_000_000, "bond locked");
        assertEq(registry.bondedBalance(agentId), 5_000_000, "registry tracks bond");
        assertEq(registry.slashableBondedBalance(agentId), 5_000_000);

        _signAndPay(alicePk, alice, claimId, 250_000, 1);
        _signAndPay(bobPk, bob, claimId, 250_000, 2);

        assertEq(usdc.balanceOf(address(escrow)), 5_500_000, "escrow holds bond + 2 payments");

        bytes memory proof = abi.encode(true, abi.encode("merchant_moe_settle:agent_right"));
        vm.prank(admin);
        settlement.resolve(claimId, proof);

        assertTrue(escrow.earningsClaimed(claimId) == false);

        uint256 ownerBefore = usdc.balanceOf(agentOwner);
        vm.prank(agentOwner);
        escrow.claimAgentEarnings(agentId, claimId);
        uint256 ownerAfter = usdc.balanceOf(agentOwner);
        assertEq(ownerAfter - ownerBefore, 5_000_000 + 500_000, "agent gets bond back + total paid");

        ReputationLedger.AgentScore memory score = ledger.agentScore(agentId);
        assertEq(score.wins, 1);
        assertEq(score.losses, 0);
        assertEq(score.accuracyBps, 10_000);

        assertEq(registry.slashableBondedBalance(agentId), 0, "bond released");

        vm.prank(alice);
        vm.expectRevert(ClawbackEscrow.NoRefundOwed.selector);
        escrow.claimRefund(claimId);
    }

    function test_endToEnd_agentWrong() public {
        (uint256 agentId, uint256 claimId) = _commitClaim(5_000_000, 250_000);

        _signAndPay(alicePk, alice, claimId, 250_000, 11);
        _signAndPay(bobPk, bob, claimId, 250_000, 12);

        bytes memory proof = abi.encode(false, abi.encode("merchant_moe_settle:agent_wrong"));
        vm.prank(admin);
        settlement.resolve(claimId, proof);

        ReputationLedger.AgentScore memory score = ledger.agentScore(agentId);
        assertEq(score.wins, 0);
        assertEq(score.losses, 1);
        assertEq(score.accuracyBps, 0);
        assertEq(registry.bondedBalance(agentId), 0, "bond removed after slash");

        (uint256 paidBackA, uint256 bonusA) = escrow.claimableRefund(alice, claimId);
        assertEq(paidBackA, 250_000);
        assertEq(bonusA, 125_000, "bonus capped at 5000 bps of paid (250k * 0.5)");

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.claimRefund(claimId);
        uint256 aliceAfter = usdc.balanceOf(alice);
        assertEq(aliceAfter - aliceBefore, 250_000 + 125_000);

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        escrow.claimRefund(claimId);
        uint256 bobAfter = usdc.balanceOf(bob);
        assertEq(bobAfter - bobBefore, 250_000 + 125_000);

        vm.prank(alice);
        vm.expectRevert(ClawbackEscrow.AlreadyClaimed.selector);
        escrow.claimRefund(claimId);

        vm.prank(agentOwner);
        vm.expectRevert(ClawbackEscrow.NoRefundOwed.selector);
        escrow.claimAgentEarnings(agentId, claimId);

        uint256 escrowBalAfter = usdc.balanceOf(address(escrow));
        assertEq(escrowBalAfter, 4_750_000, "leftover slashed bond beyond cap stays in escrow");
    }

    function test_endToEnd_singlePayer_bondPoolUncapped() public {
        (uint256 agentId, uint256 claimId) = _commitClaim(100_000, 1_000_000);

        _signAndPay(alicePk, alice, claimId, 1_000_000, 99);

        bytes memory proof = abi.encode(false, "");
        vm.prank(admin);
        settlement.resolve(claimId, proof);

        (uint256 paidBack, uint256 bonus) = escrow.claimableRefund(alice, claimId);
        assertEq(paidBack, 1_000_000);
        assertEq(bonus, 100_000, "small bond, full slashed pool to alice (under cap)");
        agentId;
    }

    function test_endToEnd_publicReveal() public {
        (, uint256 claimId) = _commitClaim(5_000_000, 250_000);
        bytes memory proof = abi.encode(true, abi.encode("settle"));
        vm.prank(admin);
        settlement.resolve(claimId, proof);

        market.publicReveal(claimId, "MNT outperforms mETH next 6h", uint256(0xC0FFEE));

        ClaimMarket.Claim memory c = market.getClaim(claimId);
        assertEq(uint8(c.state), uint8(ClaimMarket.ClaimState.PubliclyRevealed));
        assertEq(c.revealedClaimText, "MNT outperforms mETH next 6h");
    }

    function _signWitness(uint256 payerKey, address payer, uint256 claimId, uint256 amount, uint256 nonce)
        internal
        view
        returns (Q402Adapter.Witness memory w, bytes memory sig)
    {
        w = Q402Adapter.Witness({
            owner: payer,
            claimId: claimId,
            amount: amount,
            deadline: block.timestamp + 600,
            paymentId: bytes32(nonce),
            nonce: nonce
        });
        bytes32 structHash = keccak256(
            abi.encode(WITNESS_TYPEHASH, w.owner, w.claimId, w.amount, w.deadline, w.paymentId, w.nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", q402.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function test_paidUnlock_recorded_on_market() public {
        (, uint256 claimId) = _commitClaim(5_000_000, 250_000);
        assertFalse(market.paidUnlock(claimId, alice));
        _signAndPay(alicePk, alice, claimId, 250_000, 7);
        assertTrue(market.paidUnlock(claimId, alice), "Q402 should mark paidUnlock on market");
    }

    function test_unlock_revert_wrongAmount() public {
        (, uint256 claimId) = _commitClaim(5_000_000, 250_000);
        (Q402Adapter.Witness memory w, bytes memory sig) = _signWitness(alicePk, alice, claimId, 100_000, 21);
        vm.prank(facilitator);
        vm.expectRevert(abi.encodeWithSelector(ClaimMarket.WrongUnlockAmount.selector, 250_000, 100_000));
        q402.accept(w, sig);
        assertEq(usdc.balanceOf(address(escrow)), 5_000_000, "USDC must not move on revert");
    }

    function test_unlock_revert_afterExpiry() public {
        (, uint256 claimId) = _commitClaim(5_000_000, 250_000);
        vm.warp(block.timestamp + 6 hours + 1);
        (Q402Adapter.Witness memory w, bytes memory sig) = _signWitness(alicePk, alice, claimId, 250_000, 22);
        vm.prank(facilitator);
        vm.expectRevert(ClaimMarket.ClaimExpiredForUnlock.selector);
        q402.accept(w, sig);
    }

    function test_unlock_revert_afterSettlement() public {
        (, uint256 claimId) = _commitClaim(5_000_000, 250_000);
        bytes memory proof = abi.encode(true, "");
        vm.prank(admin);
        settlement.resolve(claimId, proof);
        (Q402Adapter.Witness memory w, bytes memory sig) = _signWitness(alicePk, alice, claimId, 250_000, 23);
        vm.prank(facilitator);
        vm.expectRevert(ClaimMarket.ClaimNotUnlockable.selector);
        q402.accept(w, sig);
    }

    function test_predictionParams_roundTrip() public {
        (, uint256 claimId) = _commitClaim(5_000_000, 250_000);
        ClaimMarket.Claim memory c = market.getClaim(claimId);
        (int64 minOutperformBps, uint64 commitMntPriceE8, uint64 commitEthPriceE8) =
            abi.decode(c.predictionParams, (int64, uint64, uint64));
        assertEq(minOutperformBps, int64(50), "minOutperformBps");
        assertEq(commitMntPriceE8, uint64(70_000_000), "commitMntPriceE8");
        assertEq(commitEthPriceE8, uint64(360_000_000_000), "commitEthPriceE8");
    }
}
