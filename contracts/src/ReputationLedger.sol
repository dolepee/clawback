// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReputationLedger {
    struct AgentScore {
        uint64 wins;
        uint64 losses;
        uint256 totalBonded;
        uint256 totalSlashed;
        uint256 totalEarned;
        uint16 accuracyBps;
    }

    mapping(uint256 => AgentScore) public scores;
    address public clawbackEscrow;
    address public owner;

    event ReputationUpdated(uint256 indexed agentId, bool agentRight, uint16 accuracyBpsBefore, uint16 accuracyBpsAfter);

    error UnauthorizedCaller();

    constructor() {
        owner = msg.sender;
    }

    function setEscrow(address _clawbackEscrow) external {
        if (msg.sender != owner) revert UnauthorizedCaller();
        clawbackEscrow = _clawbackEscrow;
    }

    function recordOutcome(uint256 agentId, bool agentRight, uint256 bondAtRisk) external {
        if (msg.sender != clawbackEscrow) revert UnauthorizedCaller();
        AgentScore storage s = scores[agentId];
        uint16 before = s.accuracyBps;
        if (agentRight) {
            s.wins += 1;
            s.totalEarned += bondAtRisk;
        } else {
            s.losses += 1;
            s.totalSlashed += bondAtRisk;
        }
        s.totalBonded += bondAtRisk;
        uint64 total = s.wins + s.losses;
        s.accuracyBps = total == 0 ? 0 : uint16((uint256(s.wins) * 10_000) / total);
        emit ReputationUpdated(agentId, agentRight, before, s.accuracyBps);
    }

    function agentScore(uint256 agentId) external view returns (AgentScore memory) {
        return scores[agentId];
    }
}
