// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {ClaimMarket} from "../src/ClaimMarket.sol";
import {ClawbackEscrow} from "../src/ClawbackEscrow.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {ManualSettlementAdapter} from "../src/SettlementAdapter.sol";
import {PythSettlementAdapter} from "../src/PythSettlementAdapter.sol";
import {Q402Adapter} from "../src/Q402Adapter.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @dev v2 deploy. Wires Manual as the configured adapter, then registers
///      PythSettlementAdapter as an additional approved adapter when the
///      relevant Pyth env vars are set. Manual stays for demo-time forced
///      settlements; Pyth is the trustless production path.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        address pyth = vm.envOr("PYTH_CONTRACT", address(0));
        bytes32 mntUsdFeedId = vm.envOr("PYTH_MNT_USD_FEED_ID", bytes32(0));
        bytes32 ethUsdFeedId = vm.envOr("PYTH_ETH_USD_FEED_ID", bytes32(0));
        uint256 pythMaxAge = vm.envOr("PYTH_MAX_AGE_SECONDS", uint256(120));

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
        ManualSettlementAdapter manual = new ManualSettlementAdapter(deployer, address(escrow), address(market));
        Q402Adapter q402 = new Q402Adapter(usdc, address(escrow), address(market));

        registry.setEscrow(address(escrow));
        ledger.setEscrow(address(escrow));
        escrow.configure(address(market), address(ledger), address(manual), address(registry), usdc, address(q402));
        market.configure(address(registry), address(escrow), address(manual), address(q402));

        address pythAdapter;
        if (pyth != address(0) && mntUsdFeedId != bytes32(0) && ethUsdFeedId != bytes32(0)) {
            PythSettlementAdapter pa = new PythSettlementAdapter(
                pyth,
                address(escrow),
                address(market),
                mntUsdFeedId,
                ethUsdFeedId,
                pythMaxAge
            );
            pythAdapter = address(pa);
            escrow.setSettlementAdapter(pythAdapter, true);
            market.setSettlementAdapter(pythAdapter, true);
        }

        vm.stopBroadcast();

        console2.log("AgentRegistry:         ", address(registry));
        console2.log("ClaimMarket:           ", address(market));
        console2.log("ClawbackEscrow:        ", address(escrow));
        console2.log("ReputationLedger:      ", address(ledger));
        console2.log("ManualAdapter:         ", address(manual));
        console2.log("Q402Adapter:           ", address(q402));
        console2.log("USDC:                  ", usdc);
        if (pythAdapter != address(0)) {
            console2.log("PythAdapter:           ", pythAdapter);
        } else {
            console2.log("PythAdapter:           SKIPPED (missing PYTH_CONTRACT or feed ids)");
        }
    }
}
