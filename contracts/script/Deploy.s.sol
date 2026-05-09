// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ClaimMarket} from "../src/ClaimMarket.sol";
import {ClawbackEscrow} from "../src/ClawbackEscrow.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {ManualSettlementAdapter} from "../src/SettlementAdapter.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        AgentRegistry registry = new AgentRegistry();
        ClaimMarket market = new ClaimMarket();
        ClawbackEscrow escrow = new ClawbackEscrow();
        ReputationLedger ledger = new ReputationLedger();
        ManualSettlementAdapter adapter = new ManualSettlementAdapter(deployer, address(escrow), address(market));

        vm.stopBroadcast();

        console2.log("AgentRegistry:        ", address(registry));
        console2.log("ClaimMarket:          ", address(market));
        console2.log("ClawbackEscrow:       ", address(escrow));
        console2.log("ReputationLedger:     ", address(ledger));
        console2.log("SettlementAdapter:    ", address(adapter));
    }
}
