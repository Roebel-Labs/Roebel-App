// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IMACI
 * @notice Interface for MACI (Minimal Anti-Collusion Infrastructure) core contract
 * @dev Based on MACI v1.2.x specification
 */
interface IMACI {
    /// @notice Deploy a new poll
    /// @param _duration The duration of the poll in seconds
    /// @param _maxValues Maximum values for the poll (messages, vote options)
    /// @param _treeDepths Tree depths for the poll merkle trees
    /// @param _coordinatorPubKey Coordinator's public key for encryption
    /// @param _verifier Address of the verifier contract
    /// @param _vkRegistry Address of the VkRegistry contract
    /// @param _mode Voting mode (quadratic or non-quadratic)
    /// @return pollAddr Address of the deployed Poll contract
    function deployPoll(
        uint256 _duration,
        MaxValues memory _maxValues,
        TreeDepths memory _treeDepths,
        PubKey memory _coordinatorPubKey,
        address _verifier,
        address _vkRegistry,
        Mode _mode
    ) external returns (address pollAddr);

    /// @notice Struct for maximum values
    struct MaxValues {
        uint256 maxMessages;
        uint256 maxVoteOptions;
    }

    /// @notice Struct for tree depths
    struct TreeDepths {
        uint8 intStateTreeDepth;
        uint8 messageTreeSubDepth;
        uint8 messageTreeDepth;
        uint8 voteOptionTreeDepth;
    }

    /// @notice Public key struct (ECDH encryption)
    struct PubKey {
        uint256 x;
        uint256 y;
    }

    /// @notice Voting mode enum
    enum Mode {
        QV,      // Quadratic Voting
        NON_QV   // Non-Quadratic Voting (one token one vote)
    }
}
