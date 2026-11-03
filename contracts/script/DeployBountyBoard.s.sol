// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {BountyBoard} from "../BountyBoard.sol";

/// @notice Deploys BountyBoard with the platform treasury wired in as the fee recipient.
///
/// Env vars:
///   USDC_ADDRESS      - ERC-20 USDC (Arc Testnet: 0x3600000000000000000000000000000000000000)
///   TREASURY_ADDRESS  - wallet that receives every platform fee
///
/// Usage (import the deployer key into a Foundry keystore once; never pass raw keys):
///   cast wallet import deployer --interactive
///   forge script contracts/script/DeployBountyBoard.s.sol:DeployBountyBoard \
///     --rpc-url https://rpc.testnet.arc.io --account deployer --broadcast
contract DeployBountyBoard is Script {
    function run() external returns (BountyBoard board) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast();
        board = new BountyBoard(usdc, treasury);
        vm.stopBroadcast();

        console2.log("BountyBoard:", address(board));
        console2.log("Treasury:   ", board.treasury());
        console2.log("Deploy block:", block.number);
    }
}
