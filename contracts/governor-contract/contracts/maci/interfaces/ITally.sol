// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ITally
 * @notice Interface for MACI Tally contract that stores vote results
 * @dev Coordinator submits ZK-proven tallies here
 */
interface ITally {
    /// @notice Tally votes with a zk-SNARK proof
    /// @param _newTallyCommitment The new tally commitment
    /// @param _proof The zk-SNARK proof
    function tallyVotes(
        uint256 _newTallyCommitment,
        uint256[8] calldata _proof
    ) external;

    /// @notice Get the tally result for a specific vote option
    /// @param _voteOption The vote option index
    /// @return The number of votes for this option
    function results(uint256 _voteOption) external view returns (uint256);

    /// @notice Check if the tally has been verified
    /// @return Whether tally is complete and verified
    function isTallied() external view returns (bool);

    /// @notice Get the total number of spent voice credits
    /// @return Total voice credits spent
    function totalSpentVoiceCredits() external view returns (uint256);

    /// @notice Get all results
    /// @return Array of vote counts per option
    function getResults() external view returns (uint256[] memory);

    /// @notice Get the number of vote options
    /// @return Number of vote options
    function numVoteOptions() external view returns (uint256);
}
