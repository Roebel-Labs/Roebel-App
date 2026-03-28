// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ISignUpGatekeeper
 * @notice Interface for MACI SignUpGatekeeper contracts
 * @dev Controls who can sign up to vote in a MACI poll
 */
interface ISignUpGatekeeper {
    /// @notice Register a user for voting
    /// @param _user The address of the user
    /// @param _data Additional data for validation
    /// @dev Should revert if user is not eligible
    function register(address _user, bytes memory _data) external;

    /// @notice Set the MACI instance
    /// @param _maci The MACI contract address
    function setMaciInstance(address _maci) external;
}
