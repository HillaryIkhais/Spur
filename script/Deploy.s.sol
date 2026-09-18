// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ClearSettlement} from "../contracts/ClearSettlement.sol";
import {ClearObligations} from "../contracts/ClearObligations.sol";

/// @notice SPUR legacy deployment (v1 escrow + v2 obligations).
/// @dev Secrets discipline:
///      - Deployer key NEVER lives in .env. Pass via `--account <keystore>`
///        or `--ledger`. The script only reads ADDRESSES from the environment.
///      - SPUR_VERIFIER must be a dedicated verifier EOA, independent of the
///        deployer and of every agent wallet (see README "Key ceremony").
contract Deploy is Script {
    function run() external {
        address verifier = vm.envAddress("SPUR_VERIFIER");
        address deployer = vm.envAddress("DEPLOYER");
        require(verifier != address(0), "SPUR_VERIFIER not set");
        require(deployer != address(0), "DEPLOYER not set");
        require(verifier != deployer, "verifier must be independent of deployer");

        vm.startBroadcast();
        ClearSettlement v1 = new ClearSettlement(verifier);
        ClearObligations v2 = new ClearObligations(verifier);
        vm.stopBroadcast();

        console.log("ClearSettlement:", address(v1));
        console.log("ClearObligations:", address(v2));
        console.log("verifier:", verifier);

        vm.createDir("deployments", true);
        vm.writeFile(
            string.concat("deployments/", vm.toString(block.chainid), ".json"),
            string.concat(
                '{"chainId":',
                vm.toString(block.chainid),
                ',"verifier":"',
                vm.toString(verifier),
                '","clearSettlement":"',
                vm.toString(address(v1)),
                '","clearObligations":"',
                vm.toString(address(v2)),
                '"}'
            )
        );
    }
}
