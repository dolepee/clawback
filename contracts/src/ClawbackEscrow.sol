// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IAgentRegistryEscrow {
    function ownerOf(uint256 agentId) external view returns (address);
    function noteBondLocked(uint256 agentId, uint256 amount) external;
    function noteBondReleased(uint256 agentId, uint256 amount) external;
    function noteBondSlashed(uint256 agentId, uint256 amount) external;
}

interface IReputationLedger {
    function recordOutcome(uint256 agentId, bool agentRight, uint256 bondAtRisk) external;
}

contract ClawbackEscrow {
    struct ClaimAccounting {
        uint256 totalPaid;
        uint256 bondAtStake;
        uint256 slashedBondPool;
        uint256 agentId;
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
    mapping(address => bool) public isSettlementAdapter;
    address public agentRegistry;
    address public paymentToken;
    address public q402Adapter;
    address public owner;

    event SettlementAdapterSet(address indexed adapter, bool allowed);

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
    error BondPullFailed();
    error PayoutFailed();

    constructor() {
        owner = msg.sender;
    }

    function configure(
        address _claimMarket,
        address _reputationLedger,
        address _settlementAdapter,
        address _agentRegistry,
        address _paymentToken,
        address _q402Adapter
    ) external {
        if (msg.sender != owner) revert UnauthorizedCaller();
        claimMarket = _claimMarket;
        reputationLedger = _reputationLedger;
        settlementAdapter = _settlementAdapter;
        isSettlementAdapter[_settlementAdapter] = true;
        agentRegistry = _agentRegistry;
        paymentToken = _paymentToken;
        q402Adapter = _q402Adapter;
        emit SettlementAdapterSet(_settlementAdapter, true);
    }

    function setSettlementAdapter(address adapter, bool allowed) external {
        if (msg.sender != owner) revert UnauthorizedCaller();
        isSettlementAdapter[adapter] = allowed;
        emit SettlementAdapterSet(adapter, allowed);
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
        if (msg.sender != claimMarket) revert UnauthorizedCaller();
        address agentOwner = IAgentRegistryEscrow(agentRegistry).ownerOf(agentId);
        if (!IERC20(paymentToken).transferFrom(agentOwner, address(this), amount)) revert BondPullFailed();
        accounting[claimId].bondAtStake = amount;
        accounting[claimId].agentId = agentId;
        IAgentRegistryEscrow(agentRegistry).noteBondLocked(agentId, amount);
        emit BondLocked(agentId, claimId, amount);
    }

    function settle(uint256 claimId, bool agentRight, bytes calldata settlementProof) external {
        if (!isSettlementAdapter[msg.sender]) revert UnauthorizedCaller();
        ClaimAccounting storage a = accounting[claimId];
        if (a.settled) revert ClaimAlreadySettled();
        a.settled = true;
        a.agentRight = agentRight;
        a.settlementProof = settlementProof;

        if (!agentRight) {
            a.slashedBondPool = a.bondAtStake;
            IAgentRegistryEscrow(agentRegistry).noteBondSlashed(a.agentId, a.bondAtStake);
            emit BondSlashed(a.agentId, claimId, a.bondAtStake);
        } else {
            IAgentRegistryEscrow(agentRegistry).noteBondReleased(a.agentId, a.bondAtStake);
        }

        IReputationLedger(reputationLedger).recordOutcome(a.agentId, agentRight, a.bondAtStake);

        emit ClaimSettled(claimId, agentRight, settlementProof);
    }

    function claimRefund(uint256 claimId) external {
        ClaimAccounting storage a = accounting[claimId];
        if (!a.settled) revert ClaimNotSettled();
        if (a.agentRight) revert NoRefundOwed();
        if (refundClaimed[claimId][msg.sender]) revert AlreadyClaimed();
        uint256 paid = paidAmount[msg.sender][claimId];
        if (paid == 0) revert NoRefundOwed();
        refundClaimed[claimId][msg.sender] = true;

        (uint256 paidBack, uint256 bonus) = _claimable(a, paid);
        uint256 total = paidBack + bonus;
        if (!IERC20(paymentToken).transfer(msg.sender, total)) revert PayoutFailed();
        emit RefundClaimed(claimId, msg.sender, paidBack, bonus);
    }

    function claimAgentEarnings(uint256 agentId, uint256 claimId) external {
        ClaimAccounting storage a = accounting[claimId];
        if (!a.settled) revert ClaimNotSettled();
        if (!a.agentRight) revert NoRefundOwed();
        if (earningsClaimed[claimId]) revert AlreadyClaimed();
        if (a.agentId != agentId) revert UnauthorizedCaller();
        address agentOwner = IAgentRegistryEscrow(agentRegistry).ownerOf(agentId);
        if (msg.sender != agentOwner) revert UnauthorizedCaller();
        earningsClaimed[claimId] = true;

        uint256 payout = a.totalPaid + a.bondAtStake;
        if (!IERC20(paymentToken).transfer(agentOwner, payout)) revert PayoutFailed();
        emit EarningsClaimed(agentId, claimId, payout);
    }

    function claimableRefund(address user, uint256 claimId) external view returns (uint256 paidBack, uint256 bonus) {
        ClaimAccounting storage a = accounting[claimId];
        if (!a.settled || a.agentRight || refundClaimed[claimId][user]) return (0, 0);
        uint256 paid = paidAmount[user][claimId];
        if (paid == 0) return (0, 0);
        return _claimable(a, paid);
    }

    function _claimable(ClaimAccounting storage a, uint256 paid) internal view returns (uint256 paidBack, uint256 bonus) {
        paidBack = paid;
        if (a.totalPaid == 0 || a.slashedBondPool == 0) return (paidBack, 0);
        uint256 proRata = (paid * a.slashedBondPool) / a.totalPaid;
        uint256 cap = (paid * bonusCapBps) / 10_000;
        bonus = proRata > cap ? cap : proRata;
    }
}
