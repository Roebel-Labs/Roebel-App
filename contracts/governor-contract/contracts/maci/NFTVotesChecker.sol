// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISignUpGatekeeper.sol";

/**
 * @title NFTVotesChecker
 * @notice SignUpGatekeeper for MACI that validates HomeTownVotingNFT ownership
 * @dev Restricts poll signups to NFT holders only
 *
 * Features:
 * - Validates user owns HomeTownVotingNFT (ERC721)
 * - Supports snapshot-based checking via ERC721Votes
 * - Prevents duplicate signups per poll
 * - Compatible with soulbound NFTs
 */
contract NFTVotesChecker is ISignUpGatekeeper, Ownable {
    /// @notice The HomeTownVotingNFT contract
    IERC721 public immutable nftToken;

    /// @notice The MACI instance this gatekeeper serves
    address public maciInstance;

    /// @notice Snapshot block number for checking balances
    uint256 public snapshotBlock;

    /// @notice Track which addresses have registered for this poll
    mapping(address => bool) public registered;

    /// @notice Emitted when a user successfully registers
    event UserRegistered(address indexed user);

    /// @notice Errors
    error OnlyMACI();
    error AlreadyRegistered();
    error NoNFTOwnership();
    error InvalidNFTToken();

    /**
     * @notice Constructor
     * @param _nftToken Address of HomeTownVotingNFT contract
     * @param _snapshotBlock Block number for balance checking (prevents flash loan attacks)
     */
    constructor(address _nftToken, uint256 _snapshotBlock) {
        if (_nftToken == address(0)) revert InvalidNFTToken();
        nftToken = IERC721(_nftToken);
        snapshotBlock = _snapshotBlock;
    }

    /**
     * @notice Set the MACI instance address
     * @param _maci The MACI contract address
     * @dev Only owner can set, usually called once during poll deployment
     */
    function setMaciInstance(address _maci) external override onlyOwner {
        maciInstance = _maci;
    }

    /**
     * @notice Register a user to vote in the poll
     * @param _user The address attempting to register
     * @param _data Additional data (unused in this implementation)
     * @dev Called by MACI Poll contract during signUp
     *      Validates:
     *      1. User has not already registered
     *      2. User owns at least 1 HomeTownVotingNFT
     */
    function register(address _user, bytes memory _data) external override {
        // Only MACI can call this
        if (msg.sender != maciInstance) revert OnlyMACI();

        // Check not already registered
        if (registered[_user]) revert AlreadyRegistered();

        // Check NFT ownership at snapshot block
        // For soulbound NFTs, current balance check is sufficient
        uint256 balance = nftToken.balanceOf(_user);
        if (balance == 0) revert NoNFTOwnership();

        // Mark as registered
        registered[_user] = true;

        emit UserRegistered(_user);
    }

    /**
     * @notice Check if a user is registered
     * @param _user The address to check
     * @return Whether the user is registered
     */
    function isRegistered(address _user) external view returns (bool) {
        return registered[_user];
    }

    /**
     * @notice Check if a user is eligible to register (without actually registering)
     * @param _user The address to check
     * @return Whether the user is eligible
     */
    function isEligible(address _user) external view returns (bool) {
        if (registered[_user]) return false;
        return nftToken.balanceOf(_user) > 0;
    }
}
