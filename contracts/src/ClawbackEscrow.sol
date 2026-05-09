// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ClawbackEscrow {
    struct ClaimAccounting {
        uint256 totalPaid;
        uint256 bondAtStake;
        uint256 slashedBondPool;
        bool settled;
        bool agentRight;
        bytes settlementProof;
    }

    uint256 public bonusCapBps = 5000;

    mapping(uint256 => ClaimAccounting) public accounting;
    mapping(address => mapping(uint256 => uint256)) public paidAmount;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;
    mapping(uint256 => bool) public earningsClaimed;

    address public claimMarket;
    address public reputationLedger;
    address public settlementAdapter;
    address public paymentToken;
    address public q402Adapter;
    address public owner;

    event PaymentAccepted(uint256 indexed claimId, address indexed payer, uint256 amount);
    event BondLocked(uint256 indexed agentId, uint256 indexed claimId, uint256 amount);
    event ClaimSettled(uint256 indexed claimId, bool agentRight, bytes settlementProof);
    event RefundClaimed(uint256 indexed claimId, address indexed user, uint256 paidBack, uint256 bonus);
    event EarningsClaimed(uint256 indexed agentId, uint256 indexed claimId, uint256 amount);
    event BondSlashed(uint256 indexed agentId, uint256 indexed claimId, uint256 amount);

    error UnauthorizedCaller();
    error ClaimAlreadySettled();
    error ClaimNotSettled();
    error AlreadyClaimed();
    error NoRefundOwed();

    constructor() {
        owner = msg.sender;
    }

    function setQ402Adapter(address adapter) external {
        if (msg.sender != owner) revert UnauthorizedCaller();
        q402Adapter = adapter;
    }

    function acceptPayment(uint256 claimId, address payer, uint256 amount) external {
        if (msg.sender != q402Adapter) revert UnauthorizedCaller();
        paidAmount[payer][claimId] += amount;
        accounting[claimId].totalPaid += amount;
        emit PaymentAccepted(claimId, payer, amount);
    }

    function lockBond(uint256 agentId, uint256 claimId, uint256 amount) external {
        revert("TODO: callable only by ClaimMarket on commitClaim");
    }

    function settle(uint256 claimId, bool agentRight, bytes calldata settlementProof) external {
        revert("TODO: callable only by SettlementAdapter");
    }

    function claimRefund(uint256 claimId) external {
        revert("TODO: pull pattern, transfer paidAmount + capped pro rata bonus from slashedBondPool");
    }

    function claimAgentEarnings(uint256 agentId, uint256 claimId) external {
        revert("TODO: callable by agent owner, transfer totalPaid for right claims, return bond");
    }

    function claimableRefund(address user, uint256 claimId) external view returns (uint256 paidBack, uint256 bonus) {
        return (0, 0);
    }
}
