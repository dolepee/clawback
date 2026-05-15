// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentIdentity} from "../src/AgentIdentity.sol";

/// Deploys AgentIdentity and mints the two existing Clawback agents
/// (CatScout agentId=1 owner 0xf731808CC42CCF249D436773Da1CD0493E4B5D65,
///  LobsterRogue agentId=2 owner 0x32FEc59b5D30Fe38F91DDB3eea8a13A3ae8a0711).
/// Run with: forge script script/DeployAgentIdentity.s.sol --rpc-url $MANTLE_SEPOLIA_RPC_URL --broadcast
contract DeployAgentIdentity is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registry = vm.envAddress("AGENT_REGISTRY");
        address catOwner = vm.envOr("AGENT_OWNER_CATSCOUT", address(0xf731808CC42CCF249D436773Da1CD0493E4B5D65));
        address lobsterOwner = vm.envOr("AGENT_OWNER_LOBSTERROGUE", address(0x32FEc59b5D30Fe38F91DDB3eea8a13A3ae8a0711));
        string memory base = vm.envOr("AGENT_STATS_BASE_URL", string("https://clawback-bay.vercel.app/agent/"));

        vm.startBroadcast(deployerKey);

        AgentIdentity nft = new AgentIdentity(registry);

        nft.mint(
            1,
            catOwner,
            "CatScout",
            "Cat",
            string.concat(base, "1"),
            keccak256(abi.encodePacked("CatScout", uint256(1)))
        );
        nft.mint(
            2,
            lobsterOwner,
            "LobsterRogue",
            "Lobster",
            string.concat(base, "2"),
            keccak256(abi.encodePacked("LobsterRogue", uint256(2)))
        );

        vm.stopBroadcast();

        console2.log("AgentIdentity:         ", address(nft));
        console2.log("Minted agentId 1 to:   ", catOwner);
        console2.log("Minted agentId 2 to:   ", lobsterOwner);
    }
}
