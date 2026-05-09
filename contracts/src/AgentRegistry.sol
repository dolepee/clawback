// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    enum Faction { Cat, Lobster }

    struct Agent {
        address owner;
        string handle;
        Faction faction;
        bytes32 metadataHash;
        uint256 bondedTotal;
        uint256 slashableBonded;
        bool registered;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => Agent) public agents;
    mapping(address => uint256) public agentIdByOwner;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string handle, Faction faction);
    event BondLocked(uint256 indexed agentId, uint256 amount);
    event BondReleased(uint256 indexed agentId, uint256 amount);
    event BondSlashed(uint256 indexed agentId, uint256 amount);

    error AlreadyRegistered();
    error NotRegistered();
    error InsufficientBond();

    function registerAgent(string calldata handle, Faction faction, bytes32 metadataHash)
        external
        returns (uint256 agentId)
    {
        revert("TODO: implement registerAgent");
    }

    function bondedBalance(uint256 agentId) external view returns (uint256) {
        return agents[agentId].bondedTotal;
    }

    function slashableBondedBalance(uint256 agentId) external view returns (uint256) {
        return agents[agentId].slashableBonded;
    }
}
