// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IInitialVoiceCreditProxy } from "@maci-protocol/contracts/contracts/interfaces/IInitialVoiceCreditProxy.sol";

interface IERC721BalanceVCP {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title CitizenNFTVoiceCreditsProxy
/// @notice Allocates voice credits to MACI voters based on CitizenNFT balance.
/// @dev Stateless and immutable. Safe to deploy once and reuse across every poll.
///      With soulbound 1-per-address CitizenNFTs, this returns 1 for citizens and 0 otherwise,
///      yielding a strict "1 citizen = 1 vote" semantic in non-QV mode.
contract CitizenNFTVoiceCreditsProxy is IInitialVoiceCreditProxy {
    IERC721BalanceVCP public immutable citizenNFT;
    uint256 public immutable creditsPerNFT;

    constructor(address _citizenNFT, uint256 _creditsPerNFT) {
        citizenNFT = IERC721BalanceVCP(_citizenNFT);
        creditsPerNFT = _creditsPerNFT;
    }

    /// @inheritdoc IInitialVoiceCreditProxy
    function getVoiceCredits(address _user, bytes memory) external view override returns (uint256) {
        return citizenNFT.balanceOf(_user) * creditsPerNFT;
    }
}
