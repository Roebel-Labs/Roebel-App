// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title HomeTownVotingNFT
 * @dev Soulbound NFT with built-in voting power for DAO governance
 *
 * SECURITY FEATURES:
 * - Each citizen can only receive ONE NFT ever (soulbound + tracking)
 * - NFTs are non-transferable (soulbound) - can only be minted or revoked
 * - Only verified minters can issue NFTs to citizens
 * - Owner can revoke NFTs from invalid citizens
 *
 * GOVERNANCE:
 * - Each NFT = 1 vote in the DAO
 * - Holders must delegate their votes to activate voting power
 * - Deploy this contract first, then use its address when deploying the Governor
 */
contract HomeTownVotingNFT is ERC721, ERC721Votes, Ownable, AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint256 private _nextTokenId;

    // Track which addresses have ever received a citizen NFT
    mapping(address => bool) private _hasCitizenNFT;

    // Track which token IDs are currently active (not revoked)
    mapping(uint256 => bool) private _isActive;

    event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId);
    event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId);

    constructor()
        ERC721("HomeTown DAO NFT", "HTDAO")
        EIP712("HomeTown DAO NFT", "1")
    {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(VERIFIER_ROLE, msg.sender);
    }

    /**
     * @dev Mint a new citizen NFT to an address
     * Only addresses with VERIFIER_ROLE can mint
     * Each address can only receive ONE NFT ever
     */
    function safeMint(address to) public onlyRole(VERIFIER_ROLE) {
        require(to != address(0), "Cannot mint to zero address");
        require(!_hasCitizenNFT[to], "Address already has a citizen NFT");
        require(balanceOf(to) == 0, "Address already owns an NFT");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        _hasCitizenNFT[to] = true;
        _isActive[tokenId] = true;

        emit CitizenNFTMinted(to, tokenId);
    }

    /**
     * @dev Batch mint NFTs to multiple verified citizens
     * Each address can only receive one NFT
     */
    function batchMint(address[] calldata citizens) public onlyRole(VERIFIER_ROLE) {
        for (uint256 i = 0; i < citizens.length; i++) {
            address citizen = citizens[i];
            // Skip if already has NFT instead of reverting
            if (!_hasCitizenNFT[citizen] && balanceOf(citizen) == 0) {
                safeMint(citizen);
            }
        }
    }

    /**
     * @dev Revoke an NFT from an invalid citizen
     * Only owner can revoke
     * Burns the NFT and removes voting power
     */
    function revoke(uint256 tokenId) public onlyOwner {
        require(_isActive[tokenId], "Token is not active");
        address citizen = ownerOf(tokenId);

        _isActive[tokenId] = false;
        _burn(tokenId);

        emit CitizenNFTRevoked(citizen, tokenId);
    }

    /**
     * @dev Check if an address has ever received a citizen NFT
     */
    function hasCitizenNFT(address account) public view returns (bool) {
        return _hasCitizenNFT[account];
    }

    /**
     * @dev Check if a token ID is currently active
     */
    function isActive(uint256 tokenId) public view returns (bool) {
        return _isActive[tokenId];
    }

    /**
     * @dev Override transfer functions to make NFTs soulbound (non-transferable)
     * Only minting (from = address(0)) and burning (to = address(0)) are allowed
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        require(
            from == address(0) || to == address(0),
            "NFTs are soulbound and cannot be transferred"
        );
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    /**
     * @dev Overrides required for ERC721Votes (v4 uses _afterTokenTransfer)
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Votes) {
        super._afterTokenTransfer(from, to, tokenId, batchSize);
    }

    /**
     * @dev Override supportsInterface for AccessControl + ERC721
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
