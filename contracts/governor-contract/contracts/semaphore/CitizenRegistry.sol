// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";
import "@semaphore-protocol/contracts/interfaces/ISemaphoreGroups.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CitizenRegistry
 * @notice Manages verified citizens using Semaphore for privacy-preserving identity
 * @dev Integrates with Semaphore v4 to create anonymous group membership for hometown citizens
 *
 * Flow:
 * 1. Admin verifies citizen off-chain (government ID, utility bill, etc.)
 * 2. Citizen generates Semaphore identity locally and shares commitment
 * 3. Admin calls addCitizen() to add identity commitment to Semaphore group
 * 4. Citizen can now prove citizenship anonymously via ZK proofs
 */
contract CitizenRegistry is Ownable {
    /// @notice The Semaphore contract instance
    ISemaphore public semaphore;

    /// @notice The SemaphoreGroups contract instance
    ISemaphoreGroups public semaphoreGroups;

    /// @notice The Semaphore group ID for verified citizens
    uint256 public citizenGroupId;

    /// @notice Mapping of identity commitments to registration status
    mapping(uint256 => bool) public registeredCitizens;

    /// @notice Mapping of Ethereum addresses to their identity commitments (for tracking)
    mapping(address => uint256) public addressToCommitment;

    /// @notice Total number of registered citizens
    uint256 public citizenCount;

    /// Events
    event CitizenAdded(uint256 indexed identityCommitment, address indexed registeredBy);
    event CitizenRemoved(uint256 indexed identityCommitment, address indexed removedBy);
    event SemaphoreAddressUpdated(address indexed oldAddress, address indexed newAddress);

    /**
     * @notice Constructor
     * @param _semaphore Address of the deployed Semaphore contract
     * @param _owner Address of the contract owner (town administrator)
     */
    constructor(address _semaphore, address _owner) {
        require(_semaphore != address(0), "Invalid Semaphore address");
        require(_owner != address(0), "Invalid owner address");

        semaphore = ISemaphore(_semaphore);
        semaphoreGroups = ISemaphoreGroups(_semaphore);
        _transferOwnership(_owner);

        // Create a new Semaphore group for citizens
        // Merkle tree duration of 1 hour (3600 seconds)
        citizenGroupId = semaphore.createGroup();

        emit SemaphoreAddressUpdated(address(0), _semaphore);
    }

    /**
     * @notice Add a verified citizen to the registry
     * @dev Only owner can call this after off-chain verification
     * @param identityCommitment The Semaphore identity commitment of the citizen
     * @param citizenAddress Optional: The Ethereum address of the citizen (for tracking)
     */
    function addCitizen(uint256 identityCommitment, address citizenAddress) external onlyOwner {
        require(!registeredCitizens[identityCommitment], "Citizen already registered");
        require(identityCommitment != 0, "Invalid identity commitment");

        // Add to Semaphore group
        semaphore.addMember(citizenGroupId, identityCommitment);

        // Update internal state
        registeredCitizens[identityCommitment] = true;

        if (citizenAddress != address(0)) {
            addressToCommitment[citizenAddress] = identityCommitment;
        }

        citizenCount++;

        emit CitizenAdded(identityCommitment, msg.sender);
    }

    /**
     * @notice Add multiple verified citizens in batch
     * @dev Gas-efficient way to onboard multiple citizens at once
     * @param identityCommitments Array of Semaphore identity commitments
     */
    function addCitizensBatch(uint256[] calldata identityCommitments) external onlyOwner {
        require(identityCommitments.length > 0, "Empty array");
        require(identityCommitments.length <= 100, "Batch too large"); // Prevent gas issues

        // Add all to Semaphore group in one call
        semaphore.addMembers(citizenGroupId, identityCommitments);

        // Update internal state
        for (uint256 i = 0; i < identityCommitments.length; i++) {
            require(!registeredCitizens[identityCommitments[i]], "Duplicate citizen in batch");
            require(identityCommitments[i] != 0, "Invalid identity commitment");

            registeredCitizens[identityCommitments[i]] = true;
            emit CitizenAdded(identityCommitments[i], msg.sender);
        }

        citizenCount += identityCommitments.length;
    }

    /**
     * @notice Remove a citizen from the registry
     * @dev Use with caution - requires merkle proof from Semaphore
     * @param identityCommitment The identity commitment to remove
     * @param proofSiblings Merkle proof siblings for removal
     */
    function removeCitizen(
        uint256 identityCommitment,
        uint256[] calldata proofSiblings
    ) external onlyOwner {
        require(registeredCitizens[identityCommitment], "Citizen not registered");

        // Remove from Semaphore group
        semaphore.removeMember(citizenGroupId, identityCommitment, proofSiblings);

        // Update internal state
        registeredCitizens[identityCommitment] = false;
        citizenCount--;

        emit CitizenRemoved(identityCommitment, msg.sender);
    }

    /**
     * @notice Check if an identity commitment is registered
     * @param identityCommitment The identity commitment to check
     * @return bool True if registered, false otherwise
     */
    function isCitizen(uint256 identityCommitment) external view returns (bool) {
        return registeredCitizens[identityCommitment];
    }

    /**
     * @notice Get the identity commitment for an address
     * @param citizenAddress The Ethereum address to look up
     * @return uint256 The identity commitment (0 if not found)
     */
    function getCommitmentByAddress(address citizenAddress) external view returns (uint256) {
        return addressToCommitment[citizenAddress];
    }

    /**
     * @notice Get the Semaphore group root
     * @return uint256 The current merkle tree root of the citizen group
     */
    function getGroupRoot() external view returns (uint256) {
        return semaphoreGroups.getMerkleTreeRoot(citizenGroupId);
    }

    /**
     * @notice Get the Semaphore group depth
     * @return uint256 The merkle tree depth
     */
    function getGroupDepth() external view returns (uint256) {
        return semaphoreGroups.getMerkleTreeDepth(citizenGroupId);
    }

    /**
     * @notice Update the Semaphore contract address (emergency use only)
     * @param _newSemaphore The new Semaphore contract address
     */
    function updateSemaphoreAddress(address _newSemaphore) external onlyOwner {
        require(_newSemaphore != address(0), "Invalid address");
        address oldAddress = address(semaphore);
        semaphore = ISemaphore(_newSemaphore);
        emit SemaphoreAddressUpdated(oldAddress, _newSemaphore);
    }
}
