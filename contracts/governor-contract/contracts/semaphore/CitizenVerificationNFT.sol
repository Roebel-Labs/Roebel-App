// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/**
 * @title CitizenVerificationNFT
 * @notice Soulbound NFT for verified hometown citizens with anonymous minting via Semaphore
 * @dev Uses zero-knowledge proofs to verify citizenship without revealing identity
 *
 * Key Features:
 * - Non-transferable (soulbound) once minted
 * - Anonymous minting: prove citizenship via ZK proof without revealing identity
 * - One NFT per citizen (enforced by nullifiers)
 * - Compatible with OpenZeppelin Governor for voting
 *
 * Flow:
 * 1. Citizen is verified and added to CitizenRegistry Semaphore group
 * 2. Citizen generates ZK proof of group membership
 * 3. Citizen calls mintWithProof() with anonymous proof
 * 4. NFT is minted to their address without revealing which citizen they are
 */
contract CitizenVerificationNFT is ERC721, Ownable {
    using Counters for Counters.Counter;

    /// @notice Token ID counter
    Counters.Counter private _tokenIdCounter;

    /// @notice Semaphore contract for proof verification
    ISemaphore public semaphore;

    /// @notice CitizenRegistry contract (contains the citizen group)
    address public citizenRegistry;

    /// @notice The Semaphore group ID for verified citizens
    uint256 public citizenGroupId;

    /// @notice Mapping of nullifiers to prevent double-minting
    mapping(uint256 => bool) public usedNullifiers;

    /// @notice Mapping to track if an address already has an NFT
    mapping(address => bool) public hasMinted;

    /// @notice External nullifier for minting (prevents reusing proofs)
    uint256 public constant MINT_EXTERNAL_NULLIFIER = 1;

    /// Events
    event NFTMintedAnonymously(address indexed to, uint256 indexed tokenId, uint256 nullifier);
    event SoulboundTransferBlocked(address indexed from, address indexed to, uint256 tokenId);

    /**
     * @notice Constructor
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _semaphore Address of the Semaphore contract
     * @param _citizenRegistry Address of the CitizenRegistry contract
     * @param _citizenGroupId The Semaphore group ID for citizens
     * @param _owner Contract owner address
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _semaphore,
        address _citizenRegistry,
        uint256 _citizenGroupId,
        address _owner
    ) ERC721(_name, _symbol) {
        require(_semaphore != address(0), "Invalid Semaphore address");
        require(_citizenRegistry != address(0), "Invalid CitizenRegistry address");
        require(_owner != address(0), "Invalid owner address");

        semaphore = ISemaphore(_semaphore);
        citizenRegistry = _citizenRegistry;
        citizenGroupId = _citizenGroupId;
        _transferOwnership(_owner);
    }

    /**
     * @notice Mint an NFT using a Semaphore proof of citizenship
     * @dev Allows anonymous minting - the contract can't link the NFT to a specific citizen identity
     * @param merkleTreeDepth The depth of the merkle tree proof
     * @param merkleTreeRoot The merkle tree root being proven against
     * @param nullifier The nullifier to prevent double-minting
     * @param message Hash of the recipient address (to bind proof to minter)
     * @param merkleTreeSiblings The merkle proof siblings
     * @param points The elliptic curve points for the proof
     */
    function mintWithProof(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 message,
        uint256[] calldata merkleTreeSiblings,
        uint256[8] calldata points
    ) external {
        require(!hasMinted[msg.sender], "Already minted NFT");
        require(!usedNullifiers[nullifier], "Nullifier already used");

        // Verify the message is the hash of the sender's address
        // This binds the proof to the specific minter
        uint256 expectedMessage = uint256(keccak256(abi.encodePacked(msg.sender))) %
            21888242871839275222246405745257275088548364400416034343698204186575808495617; // SNARK scalar field
        require(message == expectedMessage, "Message must be hash of sender address");

        // Construct the Semaphore proof struct
        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof({
            merkleTreeDepth: merkleTreeDepth,
            merkleTreeRoot: merkleTreeRoot,
            nullifier: nullifier,
            message: message,
            scope: citizenGroupId,
            points: points
        });

        // Verify the proof against the citizen group
        // This proves the minter is in the citizen group without revealing which citizen
        semaphore.validateProof(citizenGroupId, proof);

        // Mark nullifier as used
        usedNullifiers[nullifier] = true;

        // Mark address as having minted
        hasMinted[msg.sender] = true;

        // Mint the NFT
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(msg.sender, tokenId);

        emit NFTMintedAnonymously(msg.sender, tokenId, nullifier);
    }

    /**
     * @notice Owner can mint directly (for emergency or special cases)
     * @param to Address to mint to
     */
    function ownerMint(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(!hasMinted[to], "Already minted NFT");

        hasMinted[to] = true;

        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    /**
     * @notice Override transfer to make tokens soulbound (non-transferable)
     * @dev Tokens can only be minted, not transferred
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        // Allow minting (from == address(0)) and burning (to == address(0))
        // Block all other transfers
        if (from != address(0) && to != address(0)) {
            emit SoulboundTransferBlocked(from, to, tokenId);
            revert("Token is soulbound and non-transferable");
        }
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    /**
     * @notice Get total supply of minted tokens
     * @return uint256 The total number of tokens minted
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter.current();
    }

    /**
     * @notice Check if a nullifier has been used
     * @param nullifier The nullifier to check
     * @return bool True if used, false otherwise
     */
    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    /**
     * @notice Check if an address has minted an NFT
     * @param account The address to check
     * @return bool True if minted, false otherwise
     */
    function hasAlreadyMinted(address account) external view returns (bool) {
        return hasMinted[account];
    }

    /**
     * @notice Update the citizen group ID (in case registry is upgraded)
     * @param _newGroupId The new Semaphore group ID
     */
    function updateCitizenGroupId(uint256 _newGroupId) external onlyOwner {
        citizenGroupId = _newGroupId;
    }

    /**
     * @notice Update the CitizenRegistry address (in case of upgrade)
     * @param _newRegistry The new CitizenRegistry address
     */
    function updateCitizenRegistry(address _newRegistry) external onlyOwner {
        require(_newRegistry != address(0), "Invalid address");
        citizenRegistry = _newRegistry;
    }

    /**
     * @notice Burn token (allows citizens to revoke their NFT)
     * @param tokenId The token ID to burn
     */
    function burn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        hasMinted[msg.sender] = false;
        _burn(tokenId);
    }
}
