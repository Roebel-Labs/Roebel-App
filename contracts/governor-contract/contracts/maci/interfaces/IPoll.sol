// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IMACI.sol";

/**
 * @title IPoll
 * @notice Interface for MACI Poll contract where voting occurs
 * @dev Each proposal gets its own Poll instance
 */
interface IPoll {
    /// @notice Sign up to vote in this poll
    /// @param _pubKey The user's MACI public key
    /// @param _signUpGatekeeperData Data for the signup gatekeeper
    /// @param _initialVoiceCreditProxyData Data for initial voice credits
    function signUp(
        IMACI.PubKey memory _pubKey,
        bytes memory _signUpGatekeeperData,
        bytes memory _initialVoiceCreditProxyData
    ) external;

    /// @notice Publish an encrypted message (vote)
    /// @param _message The encrypted message
    /// @param _encPubKey The ephemeral public key for encryption
    function publishMessage(
        Message memory _message,
        IMACI.PubKey memory _encPubKey
    ) external;

    /// @notice Merge the message tree after voting ends
    /// @param _numSrQueueOps Number of operations to perform
    function mergeMessageAq(uint256 _numSrQueueOps) external;

    /// @notice Merge the message accumulator queue subtrees
    /// @param _pollId Poll ID
    function mergeMessageAqSubRoots(uint256 _pollId) external;

    /// @notice Get the poll end timestamp
    /// @return Poll end timestamp
    function getDeployTimeAndDuration() external view returns (uint256, uint256);

    /// @notice Check if merge is complete
    /// @return Whether merging is complete
    function stateAqMerged() external view returns (bool);

    /// @notice Get the number of signups
    /// @return Number of signups
    function numSignUps() external view returns (uint256);

    /// @notice Message struct for encrypted votes
    struct Message {
        uint256[10] data;
    }

    /// @notice Poll state
    function isStateAqMerged() external view returns (bool);
}
