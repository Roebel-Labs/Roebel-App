// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Force Hardhat to compile MACI v2 stock contracts that the deploy script
// instantiates by name (SignUpTokenGatekeeper, ConstantInitialVoiceCreditProxy,
// MACI core, factories, Verifier, VkRegistry, TimelockController).
//
// We don't subclass these — the deploy helpers in `maci-contracts` look them up
// via `hre.ethers.getContractFactory("Name")`, which reads the local artifact
// folder. Without this shim, our `paths.sources = "./contracts/verification-system"`
// scopes compilation away from node_modules, so the artifacts are never
// generated.

import "maci-contracts/contracts/gatekeepers/SignUpTokenGatekeeper.sol";
import "maci-contracts/contracts/initialVoiceCreditProxy/ConstantInitialVoiceCreditProxy.sol";
import "maci-contracts/contracts/MACI.sol";
import "maci-contracts/contracts/PollFactory.sol";
import "maci-contracts/contracts/MessageProcessorFactory.sol";
import "maci-contracts/contracts/TallyFactory.sol";
import "maci-contracts/contracts/VkRegistry.sol";
import "maci-contracts/contracts/crypto/Verifier.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";
