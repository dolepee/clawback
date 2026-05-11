// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
}

interface IClawbackEscrow {
    function lockBond(uint256 agentId, uint256 claimId, uint256 amount) external;
}

contract ClaimMarket {
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

    uint256 public nextClaimId = 1;
    mapping(uint256 => Claim) public claims;
    mapping(uint256 => mapping(address => bool)) public paidUnlock;

    address public agentRegistry;
    address public escrow;
    address public settlementAdapter;
    mapping(address => bool) public isSettlementAdapter;
    address public q402Adapter;
    address public owner;

    event SettlementAdapterSet(address indexed adapter, bool allowed);

    event ClaimCommitted(
        uint256 indexed claimId,
        uint256 indexed agentId,
        bytes32 claimHash,
        bytes32 skillsOutputHash,
        uint256 bondAmount,
        uint256 unlockPrice,
        uint64 expiry,
        uint64 publicReleaseAt,
        MarketId marketId,
        bytes predictionParams
    );
    event PaidUnlockRecorded(uint256 indexed claimId, address indexed payer);
    event ClaimSettled(uint256 indexed claimId, bool agentRight);
    event ClaimPubliclyRevealed(uint256 indexed claimId, string claimText);

    error InvalidExpiry();
    error InvalidPublicReleaseAt();
    error InvalidBond();
    error InvalidUnlockPrice();
    error NotAgentOwner();
    error AlreadySettled();
    error AlreadyRevealed();
    error HashMismatch();
    error UnauthorizedCaller();
    error ClaimNotUnlockable();
    error ClaimExpiredForUnlock();
    error WrongUnlockAmount(uint256 expected, uint256 provided);

    constructor() {
        owner = msg.sender;
    }

    function configure(address _agentRegistry, address _escrow, address _settlementAdapter, address _q402Adapter) external {
        if (msg.sender != owner) revert UnauthorizedCaller();
        agentRegistry = _agentRegistry;
        escrow = _escrow;
        settlementAdapter = _settlementAdapter;
        isSettlementAdapter[_settlementAdapter] = true;
        q402Adapter = _q402Adapter;
        emit SettlementAdapterSet(_settlementAdapter, true);
    }

    function setSettlementAdapter(address adapter, bool allowed) external {
        if (msg.sender != owner) revert UnauthorizedCaller();
        isSettlementAdapter[adapter] = allowed;
        emit SettlementAdapterSet(adapter, allowed);
    }

    function commitClaim(
        uint256 agentId,
        bytes32 claimHash,
        uint256 bondAmount,
        uint256 unlockPrice,
        uint64 expiry,
        uint64 publicReleaseAt,
        MarketId marketId,
        bytes32 skillsOutputHash,
        bytes calldata predictionParams
    ) external returns (uint256 claimId) {
        if (IAgentRegistry(agentRegistry).ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (publicReleaseAt < expiry) revert InvalidPublicReleaseAt();
        if (bondAmount == 0) revert InvalidBond();
        if (unlockPrice == 0) revert InvalidUnlockPrice();

        claimId = nextClaimId++;
        claims[claimId] = Claim({
            agentId: agentId,
            claimHash: claimHash,
            skillsOutputHash: skillsOutputHash,
            bondAmount: bondAmount,
            unlockPrice: unlockPrice,
            expiry: expiry,
            publicReleaseAt: publicReleaseAt,
            marketId: marketId,
            state: ClaimState.Committed,
            revealedClaimText: "",
            predictionParams: predictionParams
        });

        IClawbackEscrow(escrow).lockBond(agentId, claimId, bondAmount);

        emit ClaimCommitted(claimId, agentId, claimHash, skillsOutputHash, bondAmount, unlockPrice, expiry, publicReleaseAt, marketId, predictionParams);
    }

    function recordPaidUnlock(uint256 claimId, address payer, uint256 amount) external {
        if (msg.sender != q402Adapter) revert UnauthorizedCaller();
        Claim storage c = claims[claimId];
        if (c.state != ClaimState.Committed) revert ClaimNotUnlockable();
        if (block.timestamp >= c.expiry) revert ClaimExpiredForUnlock();
        if (amount != c.unlockPrice) revert WrongUnlockAmount(c.unlockPrice, amount);
        paidUnlock[claimId][payer] = true;
        emit PaidUnlockRecorded(claimId, payer);
    }

    function markSettled(uint256 claimId, bool agentRight) external {
        if (msg.sender != escrow && !isSettlementAdapter[msg.sender]) revert UnauthorizedCaller();
        Claim storage c = claims[claimId];
        if (c.state != ClaimState.Committed) revert AlreadySettled();
        c.state = ClaimState.Settled;
        emit ClaimSettled(claimId, agentRight);
    }

    function publicReveal(uint256 claimId, string calldata claimText, uint256 salt) external {
        Claim storage c = claims[claimId];
        if (c.state == ClaimState.PubliclyRevealed) revert AlreadyRevealed();
        if (block.timestamp < c.publicReleaseAt && c.state != ClaimState.Settled) revert UnauthorizedCaller();
        bytes32 expected = keccak256(abi.encodePacked(claimText, salt));
        if (expected != c.claimHash) revert HashMismatch();
        c.revealedClaimText = claimText;
        c.state = ClaimState.PubliclyRevealed;
        emit ClaimPubliclyRevealed(claimId, claimText);
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }
}
