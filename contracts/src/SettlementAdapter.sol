// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISettlementAdapter {
    function resolve(uint256 claimId, bytes calldata params)
        external
        payable
        returns (bool agentRight, bytes memory proof);
}

interface IClawbackEscrowSettle {
    function settle(uint256 claimId, bool agentRight, bytes calldata settlementProof) external;
}

interface IClaimMarketSettle {
    function markSettled(uint256 claimId, bool agentRight) external;
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

    constructor(address _admin, address _clawbackEscrow, address _claimMarket) {
        admin = _admin;
        clawbackEscrow = _clawbackEscrow;
        claimMarket = _claimMarket;
    }

    function resolve(uint256 claimId, bytes calldata params)
        external
        payable
        returns (bool agentRight, bytes memory proof)
    {
        if (msg.sender != admin) revert NotAdmin();
        (agentRight, proof) = abi.decode(params, (bool, bytes));
        IClawbackEscrowSettle(clawbackEscrow).settle(claimId, agentRight, proof);
        IClaimMarketSettle(claimMarket).markSettled(claimId, agentRight);
        emit ManualSettlement(claimId, agentRight, proof);
    }
}
