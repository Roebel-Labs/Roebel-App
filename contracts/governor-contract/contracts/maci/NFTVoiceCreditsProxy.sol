// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/IInitialVoiceCreditProxy.sol";

/**
 * @title NFTVoiceCreditsProxy
 * @notice Allocates voice credits based on HomeTownVotingNFT ownership
 * @dev Each NFT = 1 voice credit (supports non-quadratic voting)
 *
 * Voice Credits Model:
 * - 1 NFT = 1 voice credit = 1 vote
 * - Soulbound design ensures consistent voting power
 * - No token transfers = no gaming via NFT accumulation
 */
contract NFTVoiceCreditsProxy is IInitialVoiceCreditProxy {
    /// @notice The HomeTownVotingNFT contract
    IERC721 public immutable nftToken;

    /// @notice Voice credits per NFT (default: 1)
    uint256 public immutable creditsPerNFT;

    /// @notice Errors
    error InvalidNFTToken();

    /**
     * @notice Constructor
     * @param _nftToken Address of HomeTownVotingNFT contract
     * @param _creditsPerNFT Voice credits to allocate per NFT (typically 1)
     */
    constructor(address _nftToken, uint256 _creditsPerNFT) {
        if (_nftToken == address(0)) revert InvalidNFTToken();
        nftToken = IERC721(_nftToken);
        creditsPerNFT = _creditsPerNFT;
    }

    /**
     * @notice Get initial voice credits for a user
     * @param _user The address of the user
     * @param _data Additional data (unused)
     * @return Voice credits for the user
     * @dev Called by MACI Poll during signup
     *      Returns: (NFT balance) * creditsPerNFT
     *      For soulbound NFTs, balance is always 0 or 1
     */
    function getVoiceCredits(
        address _user,
        bytes memory _data
    ) external view override returns (uint256) {
        uint256 balance = nftToken.balanceOf(_user);
        return balance * creditsPerNFT;
    }
}
