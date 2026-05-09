// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Q402Adapter} from "../src/Q402Adapter.sol";
import {ClawbackEscrow} from "../src/ClawbackEscrow.sol";

contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "MockUSDC: insufficient");
        require(allowance[from][msg.sender] >= amount, "MockUSDC: not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract Q402AdapterTest is Test {
    Q402Adapter internal q402;
    ClawbackEscrow internal escrow;
    MockUSDC internal usdc;

    uint256 internal payerKey = 0xA11CE;
    address internal payer;
    address internal facilitator = address(0xFAC);

    bytes32 internal constant WITNESS_TYPEHASH = keccak256(
        "Witness(address owner,uint256 claimId,uint256 amount,uint256 deadline,bytes32 paymentId,uint256 nonce)"
    );

    function setUp() public {
        payer = vm.addr(payerKey);

        escrow = new ClawbackEscrow();
        usdc = new MockUSDC();
        q402 = new Q402Adapter(address(usdc), address(escrow));
        escrow.setQ402Adapter(address(q402));

        usdc.mint(payer, 100_000_000);

        vm.prank(payer);
        usdc.approve(address(q402), type(uint256).max);
    }

    function _signWitness(Q402Adapter.Witness memory w) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(WITNESS_TYPEHASH, w.owner, w.claimId, w.amount, w.deadline, w.paymentId, w.nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", q402.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_accept_singlePayment() public {
        Q402Adapter.Witness memory w = Q402Adapter.Witness({
            owner: payer,
            claimId: 42,
            amount: 250_000,
            deadline: block.timestamp + 600,
            paymentId: bytes32(uint256(0xBEEF)),
            nonce: 1
        });
        bytes memory sig = _signWitness(w);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClawbackEscrow.PaymentAccepted(42, payer, 250_000);

        vm.prank(facilitator);
        q402.accept(w, sig);

        assertEq(usdc.balanceOf(address(escrow)), 250_000);
        assertEq(escrow.paidAmount(payer, 42), 250_000);
        assertTrue(q402.nonceUsed(payer, 1));
    }

    function test_accept_revertOnReplay() public {
        Q402Adapter.Witness memory w = Q402Adapter.Witness({
            owner: payer,
            claimId: 1,
            amount: 100_000,
            deadline: block.timestamp + 600,
            paymentId: bytes32(uint256(1)),
            nonce: 7
        });
        bytes memory sig = _signWitness(w);

        vm.prank(facilitator);
        q402.accept(w, sig);

        vm.prank(facilitator);
        vm.expectRevert(Q402Adapter.WitnessNonceUsed.selector);
        q402.accept(w, sig);
    }

    function test_accept_revertOnExpired() public {
        Q402Adapter.Witness memory w = Q402Adapter.Witness({
            owner: payer,
            claimId: 1,
            amount: 100_000,
            deadline: block.timestamp + 1,
            paymentId: bytes32(uint256(1)),
            nonce: 8
        });
        bytes memory sig = _signWitness(w);

        vm.warp(block.timestamp + 2);

        vm.prank(facilitator);
        vm.expectRevert(Q402Adapter.WitnessExpired.selector);
        q402.accept(w, sig);
    }

    function test_accept_revertOnBadSignature() public {
        Q402Adapter.Witness memory w = Q402Adapter.Witness({
            owner: payer,
            claimId: 1,
            amount: 100_000,
            deadline: block.timestamp + 600,
            paymentId: bytes32(uint256(1)),
            nonce: 9
        });
        bytes memory sig = _signWitness(w);

        w.amount = 200_000;

        vm.prank(facilitator);
        vm.expectRevert(Q402Adapter.WitnessBadSignature.selector);
        q402.accept(w, sig);
    }

    function test_accept_signOnce_paySeparateClaims() public {
        Q402Adapter.Witness memory a = Q402Adapter.Witness({
            owner: payer,
            claimId: 100,
            amount: 250_000,
            deadline: block.timestamp + 600,
            paymentId: bytes32(uint256(0xA)),
            nonce: 11
        });
        Q402Adapter.Witness memory b = Q402Adapter.Witness({
            owner: payer,
            claimId: 200,
            amount: 500_000,
            deadline: block.timestamp + 600,
            paymentId: bytes32(uint256(0xB)),
            nonce: 12
        });

        bytes memory sigA = _signWitness(a);
        bytes memory sigB = _signWitness(b);

        vm.startPrank(facilitator);
        q402.accept(a, sigA);
        q402.accept(b, sigB);
        vm.stopPrank();

        assertEq(escrow.paidAmount(payer, 100), 250_000);
        assertEq(escrow.paidAmount(payer, 200), 500_000);
        assertEq(usdc.balanceOf(address(escrow)), 750_000);
    }

    function test_acceptPayment_revertWhenNotAdapter() public {
        vm.prank(facilitator);
        vm.expectRevert(ClawbackEscrow.UnauthorizedCaller.selector);
        escrow.acceptPayment(1, payer, 100);
    }
}
