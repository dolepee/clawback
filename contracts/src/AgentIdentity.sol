// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// ERC-8004 inspired soulbound agent identity NFT for Clawback.
/// Token id mirrors AgentRegistry.agentId so the NFT is the public face of an
/// already accountable on chain agent. Non transferable. Owner is the agent's
/// signing wallet. tokenURI returns a fully on chain JSON manifest.
contract AgentIdentity is ERC721 {
    struct Identity {
        string handle;
        string faction;
        string statsURI;
        bytes32 metadataHash;
        uint64 mintedAt;
    }

    address public immutable admin;
    address public immutable agentRegistry;

    mapping(uint256 => Identity) private _identity;

    error NotAdmin();
    error AlreadyMinted();
    error Soulbound();
    error UnknownToken();

    event IdentityMinted(uint256 indexed agentId, address indexed owner, string handle, string faction);
    event StatsURIUpdated(uint256 indexed agentId, string statsURI);

    constructor(address _agentRegistry) ERC721("Clawback Agent Identity", "CBA") {
        admin = msg.sender;
        agentRegistry = _agentRegistry;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function mint(
        uint256 agentId,
        address to,
        string calldata handle,
        string calldata faction,
        string calldata statsURI,
        bytes32 metadataHash
    ) external onlyAdmin {
        if (_ownerOf(agentId) != address(0)) revert AlreadyMinted();
        _identity[agentId] = Identity({
            handle: handle,
            faction: faction,
            statsURI: statsURI,
            metadataHash: metadataHash,
            mintedAt: uint64(block.timestamp)
        });
        _mint(to, agentId);
        emit IdentityMinted(agentId, to, handle, faction);
    }

    function setStatsURI(uint256 agentId, string calldata statsURI) external onlyAdmin {
        if (_ownerOf(agentId) == address(0)) revert UnknownToken();
        _identity[agentId].statsURI = statsURI;
        emit StatsURIUpdated(agentId, statsURI);
    }

    function identity(uint256 agentId) external view returns (Identity memory) {
        if (_ownerOf(agentId) == address(0)) revert UnknownToken();
        return _identity[agentId];
    }

    function tokenURI(uint256 agentId) public view override returns (string memory) {
        if (_ownerOf(agentId) == address(0)) revert UnknownToken();
        Identity memory id = _identity[agentId];
        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                id.handle,
                ' (',
                id.faction,
                ')","description":"Clawback bonded agent identity. Token id mirrors AgentRegistry.agentId. Soulbound.","attributes":[{"trait_type":"agentId","value":',
                Strings.toString(agentId),
                '},{"trait_type":"faction","value":"',
                id.faction,
                '"},{"trait_type":"metadataHash","value":"',
                Strings.toHexString(uint256(id.metadataHash), 32),
                '"},{"trait_type":"mintedAt","value":',
                Strings.toString(id.mintedAt),
                "}],",
                '"external_url":"',
                id.statsURI,
                '"}'
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
