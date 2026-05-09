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

    address public escrow;
    address public owner;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string handle, Faction faction);
    event BondLocked(uint256 indexed agentId, uint256 amount);
    event BondReleased(uint256 indexed agentId, uint256 amount);
    event BondSlashed(uint256 indexed agentId, uint256 amount);

    error AlreadyRegistered();
    error NotRegistered();
    error UnauthorizedCaller();

    constructor() {
        owner = msg.sender;
    }

    function setEscrow(address _escrow) external {
        if (msg.sender != owner) revert UnauthorizedCaller();
        escrow = _escrow;
    }

    function registerAgent(string calldata handle, Faction faction, bytes32 metadataHash)
        external
        returns (uint256 agentId)
    {
        if (agentIdByOwner[msg.sender] != 0) revert AlreadyRegistered();
        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: msg.sender,
            handle: handle,
            faction: faction,
            metadataHash: metadataHash,
            bondedTotal: 0,
            slashableBonded: 0,
            registered: true
        });
        agentIdByOwner[msg.sender] = agentId;
        emit AgentRegistered(agentId, msg.sender, handle, faction);
    }

    function noteBondLocked(uint256 agentId, uint256 amount) external {
        if (msg.sender != escrow) revert UnauthorizedCaller();
        agents[agentId].bondedTotal += amount;
        agents[agentId].slashableBonded += amount;
        emit BondLocked(agentId, amount);
    }

    function noteBondReleased(uint256 agentId, uint256 amount) external {
        if (msg.sender != escrow) revert UnauthorizedCaller();
        agents[agentId].slashableBonded -= amount;
        emit BondReleased(agentId, amount);
    }

    function noteBondSlashed(uint256 agentId, uint256 amount) external {
        if (msg.sender != escrow) revert UnauthorizedCaller();
        agents[agentId].bondedTotal -= amount;
        agents[agentId].slashableBonded -= amount;
        emit BondSlashed(agentId, amount);
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return agents[agentId].owner;
    }

    function bondedBalance(uint256 agentId) external view returns (uint256) {
        return agents[agentId].bondedTotal;
    }

    function slashableBondedBalance(uint256 agentId) external view returns (uint256) {
        return agents[agentId].slashableBonded;
    }
}
