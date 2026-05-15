// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentIdentity} from "../src/AgentIdentity.sol";

contract AgentIdentityTest is Test {
    AgentIdentity internal identity;
    address internal admin = address(this);
    address internal catScout = address(0xCA7);
    address internal lobster = address(0xB0B);

    function setUp() public {
        identity = new AgentIdentity(address(0xBEEF));
    }

    function test_admin_can_mint() public {
        identity.mint(1, catScout, "CatScout", "Cat", "https://clawback-bay.vercel.app/agent/1", bytes32(uint256(0xCA1)));
        assertEq(identity.ownerOf(1), catScout);
        AgentIdentity.Identity memory rec = identity.identity(1);
        assertEq(rec.handle, "CatScout");
        assertEq(rec.faction, "Cat");
    }

    function test_non_admin_cannot_mint() public {
        vm.prank(catScout);
        vm.expectRevert(AgentIdentity.NotAdmin.selector);
        identity.mint(1, catScout, "x", "y", "z", bytes32(0));
    }

    function test_cannot_mint_same_id_twice() public {
        identity.mint(1, catScout, "CatScout", "Cat", "u", bytes32(0));
        vm.expectRevert(AgentIdentity.AlreadyMinted.selector);
        identity.mint(1, lobster, "Other", "Lobster", "u", bytes32(0));
    }

    function test_token_is_soulbound() public {
        identity.mint(1, catScout, "CatScout", "Cat", "u", bytes32(0));
        vm.prank(catScout);
        vm.expectRevert(AgentIdentity.Soulbound.selector);
        identity.transferFrom(catScout, lobster, 1);
    }

    function test_tokenURI_renders_base64_json() public {
        identity.mint(7, catScout, "CatScout", "Cat", "https://clawback-bay.vercel.app/agent/7", bytes32(uint256(0x42)));
        string memory uri = identity.tokenURI(7);
        bytes memory uriBytes = bytes(uri);
        bytes memory prefix = bytes("data:application/json;base64,");
        assertGt(uriBytes.length, prefix.length);
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(uriBytes[i], prefix[i]);
        }
    }

    function test_unknown_token_reverts() public {
        vm.expectRevert(AgentIdentity.UnknownToken.selector);
        identity.tokenURI(42);
    }

    function test_admin_can_update_stats_uri() public {
        identity.mint(1, catScout, "CatScout", "Cat", "old", bytes32(0));
        identity.setStatsURI(1, "new");
        AgentIdentity.Identity memory rec = identity.identity(1);
        assertEq(rec.statsURI, "new");
    }
}
