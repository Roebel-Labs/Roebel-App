// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IInitialVoiceCreditProxy
 * @notice Interface for determining initial voice credits for voters
 * @dev Converts token balance to voting power (voice credits)
 */
interface IInitialVoiceCreditProxy {
    /// @notice Get the initial voice credit balance for a user
    /// @param _user The address of the user
    /// @param _data Additional data for calculation
    /// @return The number of voice credits
    function getVoiceCredits(address _user, bytes memory _data) external view returns (uint256);
}
