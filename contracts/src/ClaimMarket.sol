// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
    }

    uint256 public nextClaimId = 1;
    mapping(uint256 => Claim) public claims;
    mapping(uint256 => mapping(address => bool)) public paidUnlock;

    event ClaimCommitted(
        uint256 indexed claimId,
        uint256 indexed agentId,
        bytes32 claimHash,
        bytes32 skillsOutputHash,
        uint256 bondAmount,
        uint256 unlockPrice,
        uint64 expiry,
        uint64 publicReleaseAt,
        MarketId marketId
    );
    event PaidUnlockRecorded(uint256 indexed claimId, address indexed payer);
    event ClaimSettled(uint256 indexed claimId, bool agentRight);
    event ClaimPubliclyRevealed(uint256 indexed claimId, string claimText);

    error InvalidExpiry();
    error InvalidPublicReleaseAt();
    error ClaimNotSettled();
    error AlreadyRevealed();
    error HashMismatch();
    error UnauthorizedCaller();

    function commitClaim(
        uint256 agentId,
        bytes32 claimHash,
        uint256 bondAmount,
        uint256 unlockPrice,
        uint64 expiry,
        uint64 publicReleaseAt,
        MarketId marketId,
        bytes32 skillsOutputHash
    ) external returns (uint256 claimId) {
        revert("TODO: implement commitClaim");
    }

    function recordPaidUnlock(uint256 claimId, address payer) external {
        revert("TODO: implement recordPaidUnlock (callable only by ClawbackEscrow)");
    }

    function publicReveal(uint256 claimId, string calldata claimText, uint256 salt) external {
        revert("TODO: implement publicReveal (verify hash match against claimHash)");
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }
}
