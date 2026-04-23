// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AttesterNFT
 * @dev Soulbound NFT for culture committee members who can attest citizens
 *
 * FEATURES:
 * - Soulbound (non-transferable) NFTs for committee members
 * - Multi-signature attestation system (2 Attester signatures required)
 * - Multi-signature revocation system (2 Attester signatures required)
 * - Each wallet can only hold ONE Attester NFT
 * - Bootstrap: 3 founding attesters minted in constructor
 * - Emergency mint permanently disabled (prevents fraud)
 * - Evidence stored on IPFS (JSON with name, address, reason, date)
 * - Real-time approval tracking
 * - Requests can be approved or rejected
 * - Can re-request after rejection or revocation
 *
 * BOOTSTRAP:
 * 0. Constructor receives 3 founding attester addresses
 * 1. 3 Attester NFTs auto-minted to founding members at deployment
 * 2. System is immediately operational
 *
 * ATTESTATION FLOW:
 * 1. Requester creates attestation request with IPFS evidence
 * 2. Request appears in public list
 * 3. 2 different Attester NFT holders sign the request
 * 4. Once 2 signatures reached, NFT is auto-minted
 *
 * REVOCATION FLOW:
 * 1. Any Attester creates revocation request with evidence
 * 2. 2 different Attester NFT holders sign the revocation
 * 3. Once 2 signatures reached, NFT is burned
 */
contract AttesterNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    // Track which addresses currently hold an Attester NFT
    mapping(address => bool) public hasAttesterNFT;

    // Track which addresses have ever held an Attester NFT
    mapping(address => bool) public hasEverHeldAttesterNFT;

    // Request types
    enum RequestType { Attestation, Revocation }
    enum RequestStatus { Pending, Approved, Rejected, Executed }

    // Attestation/Revocation request structure
    struct Request {
        uint256 id;
        address requester;
        address target; // Address requesting NFT or being revoked
        RequestType requestType;
        RequestStatus status;
        string evidenceURI; // IPFS URI with JSON: {name, address, reason, date}
        uint256 signatureCount;
        uint256 createdAt;
    }

    // Storage
    mapping(uint256 => Request) public requests;
    uint256 public requestCount;

    // Separate mappings for approvals and rejections (cannot be in struct)
    mapping(uint256 => mapping(address => bool)) private _requestApprovals;
    mapping(uint256 => mapping(address => bool)) private _requestRejections;

    // Constants
    uint256 public constant REQUIRED_SIGNATURES = 2;

    // Events
    event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RequestApproved(uint256 indexed requestId, address indexed approver);
    event RequestRejected(uint256 indexed requestId, address indexed rejector);
    event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId);
    event AttesterNFTRevoked(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId);

    constructor(
        address initialOwner,
        string memory name,
        string memory symbol,
        address[3] memory foundingAttesters
    )
        ERC721(name, symbol)
        Ownable(initialOwner)
    {
        // Bootstrap: Mint to 3 founding attesters immediately
        for (uint256 i = 0; i < 3; i++) {
            require(foundingAttesters[i] != address(0), "Invalid founding attester address");
            require(foundingAttesters[i] != initialOwner, "Owner cannot be founding attester");

            uint256 tokenId = _nextTokenId++;
            _safeMint(foundingAttesters[i], tokenId);

            hasAttesterNFT[foundingAttesters[i]] = true;
            hasEverHeldAttesterNFT[foundingAttesters[i]] = true;

            emit AttesterNFTMinted(foundingAttesters[i], tokenId, 0); // requestId = 0 for bootstrap
        }
    }

    /**
     * @dev Create attestation request to receive Attester NFT
     * Anyone can create a request for themselves
     */
    function createAttestationRequest(string calldata evidenceURI) external returns (uint256) {
        require(!hasAttesterNFT[msg.sender], "Already has Attester NFT");
        require(balanceOf(msg.sender) == 0, "Already owns Attester NFT");

        uint256 requestId = requestCount++;
        Request storage req = requests[requestId];
        req.id = requestId;
        req.requester = msg.sender;
        req.target = msg.sender;
        req.requestType = RequestType.Attestation;
        req.status = RequestStatus.Pending;
        req.evidenceURI = evidenceURI;
        req.signatureCount = 0;
        req.createdAt = block.timestamp;

        emit AttestationRequestCreated(requestId, msg.sender, evidenceURI);
        return requestId;
    }

    /**
     * @dev Create revocation request to remove Attester NFT
     * Any Attester can create a revocation request
     */
    function createRevocationRequest(address target, string calldata evidenceURI) external {
        require(hasAttesterNFT[msg.sender], "Only Attesters can create revocation requests");
        require(hasAttesterNFT[target], "Target does not have Attester NFT");

        uint256 requestId = requestCount++;
        Request storage req = requests[requestId];
        req.id = requestId;
        req.requester = msg.sender;
        req.target = target;
        req.requestType = RequestType.Revocation;
        req.status = RequestStatus.Pending;
        req.evidenceURI = evidenceURI;
        req.signatureCount = 0;
        req.createdAt = block.timestamp;

        emit RevocationRequestCreated(requestId, target, evidenceURI);
    }

    /**
     * @dev Approve a request (attestation or revocation)
     * Only Attester NFT holders can approve
     * Auto-executes when REQUIRED_SIGNATURES reached
     */
    function approveRequest(uint256 requestId) external {
        require(hasAttesterNFT[msg.sender], "Only Attesters can approve");
        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(!_requestApprovals[requestId][msg.sender], "Already approved");
        require(!_requestRejections[requestId][msg.sender], "Already rejected");
        require(msg.sender != req.target, "Target cannot approve their own request");

        _requestApprovals[requestId][msg.sender] = true;
        req.signatureCount++;

        emit RequestApproved(requestId, msg.sender);

        // Auto-execute when threshold reached
        if (req.signatureCount >= REQUIRED_SIGNATURES) {
            _executeRequest(requestId);
        }
    }

    /**
     * @dev Reject a request
     * Only Attester NFT holders can reject
     */
    function rejectRequest(uint256 requestId) external {
        require(hasAttesterNFT[msg.sender], "Only Attesters can reject");
        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(!_requestApprovals[requestId][msg.sender], "Already approved");
        require(!_requestRejections[requestId][msg.sender], "Already rejected");

        _requestRejections[requestId][msg.sender] = true;
        req.status = RequestStatus.Rejected;

        emit RequestRejected(requestId, msg.sender);
    }

    /**
     * @dev Execute request when signatures threshold reached
     * Internal function called automatically
     */
    function _executeRequest(uint256 requestId) internal {
        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(req.signatureCount >= REQUIRED_SIGNATURES, "Not enough signatures");

        req.status = RequestStatus.Executed;

        if (req.requestType == RequestType.Attestation) {
            _mintAttesterNFT(req.target, requestId);
        } else {
            _revokeAttesterNFT(req.target, requestId);
        }
    }

    /**
     * @dev Mint Attester NFT to approved address
     */
    function _mintAttesterNFT(address to, uint256 requestId) internal {
        require(!hasAttesterNFT[to], "Already has Attester NFT");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        hasAttesterNFT[to] = true;
        hasEverHeldAttesterNFT[to] = true;

        emit AttesterNFTMinted(to, tokenId, requestId);
    }

    /**
     * @dev Revoke (burn) Attester NFT
     */
    function _revokeAttesterNFT(address target, uint256 requestId) internal {
        require(hasAttesterNFT[target], "Target does not have Attester NFT");

        uint256 tokenId = tokenOfOwnerByIndex(target, 0);
        _burn(tokenId);

        hasAttesterNFT[target] = false;

        emit AttesterNFTRevoked(target, tokenId, requestId);
    }

    /**
     * @dev Emergency mint is permanently disabled after bootstrap
     * All attesters must go through the decentralized multi-sig approval process (2 attester signatures)
     * This prevents centralization and fraud by removing owner's backdoor minting power
     */
    function emergencyMint(address /* to */) external pure {
        revert("Emergency minting permanently disabled. All attesters must go through multi-sig approval.");
    }

    /**
     * @dev Get request details
     */
    function getRequest(uint256 requestId) external view returns (
        address requester,
        address target,
        RequestType requestType,
        RequestStatus status,
        string memory evidenceURI,
        uint256 signatureCount,
        uint256 createdAt
    ) {
        Request storage req = requests[requestId];
        return (
            req.requester,
            req.target,
            req.requestType,
            req.status,
            req.evidenceURI,
            req.signatureCount,
            req.createdAt
        );
    }

    /**
     * @dev Check if address has approved a request
     */
    function hasApprovedRequest(uint256 requestId, address approver) external view returns (bool) {
        return _requestApprovals[requestId][approver];
    }

    /**
     * @dev Check if address has rejected a request
     */
    function hasRejectedRequest(uint256 requestId, address rejector) external view returns (bool) {
        return _requestRejections[requestId][rejector];
    }

    /**
     * @dev Override _update to make NFTs soulbound (OpenZeppelin v5)
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0)) and burning (to == address(0))
        // Reject all transfers
        require(
            from == address(0) || to == address(0),
            "Attester NFTs are soulbound and cannot be transferred"
        );

        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Helper function to get token ID by owner
     * Required since we removed ERC721Enumerable to save gas
     */
    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        require(index == 0, "Owner can only have 1 NFT");
        require(balanceOf(owner) > 0, "Owner has no NFTs");

        // Iterate through all tokens to find owner's token
        for (uint256 i = 0; i < _nextTokenId; i++) {
            if (_ownerOf(i) != address(0) && ownerOf(i) == owner) {
                return i;
            }
        }
        revert("Token not found");
    }
}
