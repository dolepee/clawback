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

    event ReputationUpdated(uint256 indexed agentId, bool agentRight, uint16 accuracyBpsBefore, uint16 accuracyBpsAfter);

    error UnauthorizedCaller();

    function recordOutcome(uint256 agentId, bool agentRight, uint256 bondAtRisk) external {
        revert("TODO: callable only by ClawbackEscrow");
    }

    function agentScore(uint256 agentId) external view returns (AgentScore memory) {
        return scores[agentId];
    }
}
