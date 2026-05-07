// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IBasePolicy } from "@excubiae/contracts/contracts/interfaces/IBasePolicy.sol";
import { IPolicy } from "@excubiae/contracts/contracts/interfaces/IPolicy.sol";

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title CitizenNFTPolicy
/// @notice MACI sign-up policy that gates participation by CitizenNFT ownership.
/// @dev Implements IBasePolicy directly without the Excubiae Clone/Factory machinery,
///      so it can be deployed via Remix with a plain constructor. Used both as MACI's
///      global sign-up policy (one instance, target = MACI core) and as the per-poll
///      policy (one instance per proposal, target = the deployed Poll).
contract CitizenNFTPolicy is IBasePolicy {
    IERC721Balance public immutable citizenNFT;

    /// @notice The contract permitted to call `enforce` (MACI core or a Poll).
    address public guarded;

    /// @notice Owner that may call `setTarget` once.
    address public owner;

    error NotOwner();
    error NoCitizenNFT();
    error TargetIsZero();

    constructor(address _citizenNFT) {
        citizenNFT = IERC721Balance(_citizenNFT);
        owner = msg.sender;
    }

    /// @inheritdoc IPolicy
    function trait() external pure override returns (string memory) {
        return "CitizenNFT";
    }

    /// @inheritdoc IPolicy
    /// @dev For the MACI sign-up policy, the target is the MACI core address.
    ///      For a per-poll policy, the target is the Poll address, set after
    ///      `MACI.deployPoll` returns.
    function setTarget(address _guarded) external override {
        if (msg.sender != owner) revert NotOwner();
        if (_guarded == address(0)) revert TargetIsZero();
        if (guarded != address(0)) revert TargetAlreadySet();
        guarded = _guarded;
        emit TargetSet(_guarded);
    }

    /// @inheritdoc IBasePolicy
    /// @dev MACI/Poll calls `enforce(msg.sender, _signUpPolicyData)`. We accept any data
    ///      and only require the subject (the actual voter) to hold a CitizenNFT.
    function enforce(address subject, bytes calldata evidence) external override {
        if (msg.sender != guarded) revert TargetOnly();
        if (citizenNFT.balanceOf(subject) == 0) revert NoCitizenNFT();
        emit Enforced(subject, guarded, evidence);
    }
}
