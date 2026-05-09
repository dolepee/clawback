// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ClaimMarket} from "../src/ClaimMarket.sol";
import {ClawbackEscrow} from "../src/ClawbackEscrow.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {ManualSettlementAdapter} from "../src/SettlementAdapter.sol";
import {Q402Adapter} from "../src/Q402Adapter.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address usdc = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        if (usdc == address(0)) {
            MockUSDC mockUsdc = new MockUSDC();
            usdc = address(mockUsdc);
            console2.log("MockUSDC deployed:    ", usdc);
        }

        AgentRegistry registry = new AgentRegistry();
        ClaimMarket market = new ClaimMarket();
        ClawbackEscrow escrow = new ClawbackEscrow();
        ReputationLedger ledger = new ReputationLedger();
        ManualSettlementAdapter adapter = new ManualSettlementAdapter(deployer, address(escrow), address(market));
        Q402Adapter q402 = new Q402Adapter(usdc, address(escrow));

        registry.setEscrow(address(escrow));
        ledger.setEscrow(address(escrow));
        escrow.configure(address(market), address(ledger), address(adapter), address(registry), usdc, address(q402));
        market.configure(address(registry), address(escrow), address(adapter), address(q402));

        vm.stopBroadcast();

        console2.log("AgentRegistry:        ", address(registry));
        console2.log("ClaimMarket:          ", address(market));
        console2.log("ClawbackEscrow:       ", address(escrow));
        console2.log("ReputationLedger:     ", address(ledger));
        console2.log("SettlementAdapter:    ", address(adapter));
        console2.log("Q402Adapter:          ", address(q402));
        console2.log("USDC:                 ", usdc);
    }
}
