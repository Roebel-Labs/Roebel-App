// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AttesterNFT
/// @notice Soulbound NFT for Roebel culture-committee members.
///
/// Multi-signature attestation: `requiredSignatures` distinct Attesters must sign.
/// Multi-signature revocation: same threshold. `requiredRejections` distinct
/// Attesters are needed to veto a request — a single rogue Attester cannot kill it.
///
/// `requiredSignatures` and `requiredRejections` are mutable by `owner()`
/// (intended: the Timelock after `transferOwnership`).
contract AttesterNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    mapping(address => bool) public hasAttesterNFT;
    mapping(address => bool) public hasEverHeldAttesterNFT;

    /// @dev O(1) replacement for the previous O(N) `tokenOfOwnerByIndex` scan.
    mapping(address => uint256) private _tokenIdByOwner;

    enum RequestType { Attestation, Revocation }
    enum RequestStatus { Pending, Approved, Rejected, Executed }

    struct Request {
        uint256 id;
        address requester;
        address target;
        RequestType requestType;
        RequestStatus status;
        string evidenceURI;
        uint256 signatureCount;
        uint256 rejectionCount;
        uint256 createdAt;
    }

    mapping(uint256 => Request) public requests;
    uint256 public requestCount;

    mapping(uint256 => mapping(address => bool)) private _requestApprovals;
    mapping(uint256 => mapping(address => bool)) private _requestRejections;

    uint256 public requiredSignatures;
    uint256 public requiredRejections;

    event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RequestApproved(uint256 indexed requestId, address indexed approver);
    event RequestRejected(uint256 indexed requestId, address indexed rejector);
    event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId);
    event AttesterNFTRevoked(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId);

    event RequiredSignaturesChanged(uint256 oldValue, uint256 newValue);
    event RequiredRejectionsChanged(uint256 oldValue, uint256 newValue);

    constructor(
        address initialOwner,
        string memory name,
        string memory symbol,
        address[3] memory foundingAttesters,
        uint256 _requiredSignatures,
        uint256 _requiredRejections
    )
        ERC721(name, symbol)
        Ownable(initialOwner)
    {
        require(_requiredSignatures >= 1, "signatures >= 1");
        require(_requiredRejections >= 1, "rejections >= 1");

        requiredSignatures = _requiredSignatures;
        requiredRejections = _requiredRejections;

        for (uint256 i = 0; i < 3; i++) {
            address founder = foundingAttesters[i];
            require(founder != address(0), "Invalid founding attester address");
            require(founder != initialOwner, "Owner cannot be founding attester");
            for (uint256 j = i + 1; j < 3; j++) {
                require(founder != foundingAttesters[j], "Duplicate founding attester");
            }

            uint256 tokenId = _nextTokenId++;
            _safeMint(founder, tokenId);

            hasAttesterNFT[founder] = true;
            hasEverHeldAttesterNFT[founder] = true;
            _tokenIdByOwner[founder] = tokenId;

            emit AttesterNFTMinted(founder, tokenId, 0);
        }
    }

    // ---- One-time migration (cross-chain re-issue) ----

    bool public migrationFinalized;

    event MigrationMinted(address indexed attester, uint256 indexed tokenId);
    event MigrationFinalized();

    /// @notice One-time, owner-only bulk re-issue used to migrate an existing
    /// attester set onto a new chain. Idempotent (skips current holders) and
    /// permanently disabled by `finalizeMigration()`. Uses `_mint` so a
    /// smart-account attester that doesn't implement onERC721Received cannot
    /// brick the batch; tokens are soulbound regardless.
    function migrationMint(address[] calldata attesters) external onlyOwner {
        require(!migrationFinalized, "Migration finalized");
        for (uint256 i = 0; i < attesters.length; i++) {
            address to = attesters[i];
            if (to == address(0) || hasAttesterNFT[to]) continue;
            uint256 tokenId = _nextTokenId++;
            _mint(to, tokenId);
            hasAttesterNFT[to] = true;
            hasEverHeldAttesterNFT[to] = true;
            _tokenIdByOwner[to] = tokenId;
            emit AttesterNFTMinted(to, tokenId, 0);
            emit MigrationMinted(to, tokenId);
        }
    }

    /// @notice Permanently disables `migrationMint`. One-way: afterwards every
    /// new attester must go through the multi-sig attestation flow.
    function finalizeMigration() external onlyOwner {
        migrationFinalized = true;
        emit MigrationFinalized();
    }

    // ---- Request lifecycle ----

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
        req.createdAt = block.timestamp;

        emit AttestationRequestCreated(requestId, msg.sender, evidenceURI);
        return requestId;
    }

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
        req.createdAt = block.timestamp;

        emit RevocationRequestCreated(requestId, target, evidenceURI);
    }

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

        if (req.signatureCount >= requiredSignatures) {
            _executeRequest(requestId);
        }
    }

    /// @notice Reject a request. Status only flips to Rejected once `requiredRejections`
    ///         distinct Attesters have rejected. A single rogue Attester cannot veto.
    function rejectRequest(uint256 requestId) external {
        require(hasAttesterNFT[msg.sender], "Only Attesters can reject");
        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(!_requestApprovals[requestId][msg.sender], "Already approved");
        require(!_requestRejections[requestId][msg.sender], "Already rejected");
        require(msg.sender != req.target, "Target cannot reject their own request");

        _requestRejections[requestId][msg.sender] = true;
        req.rejectionCount++;

        emit RequestRejected(requestId, msg.sender);

        if (req.rejectionCount >= requiredRejections) {
            req.status = RequestStatus.Rejected;
        }
    }

    function _executeRequest(uint256 requestId) internal {
        Request storage req = requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(req.signatureCount >= requiredSignatures, "Not enough signatures");

        req.status = RequestStatus.Executed;

        if (req.requestType == RequestType.Attestation) {
            _mintAttesterNFT(req.target, requestId);
        } else {
            _revokeAttesterNFT(req.target, requestId);
        }
    }

    function _mintAttesterNFT(address to, uint256 requestId) internal {
        require(!hasAttesterNFT[to], "Already has Attester NFT");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        hasAttesterNFT[to] = true;
        hasEverHeldAttesterNFT[to] = true;
        _tokenIdByOwner[to] = tokenId;

        emit AttesterNFTMinted(to, tokenId, requestId);
    }

    function _revokeAttesterNFT(address target, uint256 requestId) internal {
        require(hasAttesterNFT[target], "Target does not have Attester NFT");

        uint256 tokenId = _tokenIdByOwner[target];
        delete _tokenIdByOwner[target];
        _burn(tokenId);

        hasAttesterNFT[target] = false;

        emit AttesterNFTRevoked(target, tokenId, requestId);
    }

    function emergencyMint(address) external pure {
        revert("Emergency minting permanently disabled. All attesters must go through multi-sig approval.");
    }

    // ---- Governance-tunable setters (Timelock = owner) ----

    function setRequiredSignatures(uint256 newValue) external onlyOwner {
        require(newValue >= 1, "signatures >= 1");
        emit RequiredSignaturesChanged(requiredSignatures, newValue);
        requiredSignatures = newValue;
    }

    function setRequiredRejections(uint256 newValue) external onlyOwner {
        require(newValue >= 1, "rejections >= 1");
        emit RequiredRejectionsChanged(requiredRejections, newValue);
        requiredRejections = newValue;
    }

    // ---- Views ----

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

    function getRequestRejections(uint256 requestId) external view returns (uint256) {
        return requests[requestId].rejectionCount;
    }

    function hasApprovedRequest(uint256 requestId, address approver) external view returns (bool) {
        return _requestApprovals[requestId][approver];
    }

    function hasRejectedRequest(uint256 requestId, address rejector) external view returns (bool) {
        return _requestRejections[requestId][rejector];
    }

    // ---- ERC721 / soulbound plumbing ----

    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(
            from == address(0) || to == address(0),
            "Attester NFTs are soulbound and cannot be transferred"
        );
        return super._update(to, tokenId, auth);
    }

    /// @dev O(1) lookup, backed by `_tokenIdByOwner`. Signature kept for ABI compatibility.
    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        require(index == 0, "Owner can only have 1 NFT");
        require(balanceOf(owner) > 0, "Owner has no NFTs");
        return _tokenIdByOwner[owner];
    }
}
