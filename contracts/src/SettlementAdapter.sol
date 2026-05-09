// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISettlementAdapter {
    function resolve(uint256 claimId, bytes calldata params)
        external
        returns (bool agentRight, bytes memory proof);
}

contract ManualSettlementAdapter is ISettlementAdapter {
    address public admin;
    address public clawbackEscrow;
    address public claimMarket;

    struct SettlementProof {
        bytes32 sourceId;
        uint256 observedPrice;
        uint64 observedTimestamp;
        uint64 observedBlock;
        uint8 formulaVersion;
        bytes extra;
    }

    event ManualSettlement(uint256 indexed claimId, bool agentRight, bytes proof);

    error NotAdmin();
    error AlreadySettled();

    constructor(address _admin, address _clawbackEscrow, address _claimMarket) {
        admin = _admin;
        clawbackEscrow = _clawbackEscrow;
        claimMarket = _claimMarket;
    }

    function resolve(uint256 claimId, bytes calldata params)
        external
        returns (bool agentRight, bytes memory proof)
    {
        revert("TODO: admin only, parse params, write proof, call ClawbackEscrow.settle, call ClaimMarket settle hook");
    }
}
