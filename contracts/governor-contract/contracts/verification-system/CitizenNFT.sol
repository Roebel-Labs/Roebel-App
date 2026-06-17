// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IAttesterNFT {
    function hasAttesterNFT(address account) external view returns (bool);
}

/// @title CitizenNFT
/// @notice Soulbound ERC721Votes NFT for verified Roebel citizens.
///
/// Multi-signature attestation: requires `requiredAttesterSignatures` Attester sigs
/// AND `requiredCitizenSignatures` Citizen sigs. Multi-signature revocation: requires
/// `requiredRevocationAttesterSignatures` Attester sigs AND
/// `requiredRevocationCitizenSignatures` Citizen sigs. Default values are all 1 — a
/// revocation needs an Attester AND a Citizen to agree, mirroring attestation.
///
/// All four signature thresholds plus the two rejection thresholds are mutable by
/// `owner()` (intended: the Timelock after `transferOwnership`). Lowering a threshold
/// below 1 is forbidden so a single key can never act unilaterally.
contract CitizenNFT is ERC721, ERC721Votes, Ownable {
    IAttesterNFT public attesterNFT;
    uint256 private _nextTokenId;

    mapping(address => bool) public hasCitizenNFT;
    mapping(address => bool) public hasEverHeldCitizenNFT;

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
        uint256 attesterSignatures;
        uint256 citizenSignatures;
        uint256 attesterRejections;
        uint256 citizenRejections;
        mapping(address => bool) hasApproved;
        mapping(address => bool) hasRejected;
        uint256 createdAt;
    }

    mapping(uint256 => Request) private _requests;
    uint256 public requestCount;

    mapping(uint256 => address[]) private _requestApprovers;
    mapping(uint256 => address[]) private _requestRejectors;

    // Mutable signature thresholds (governance-tunable)
    uint256 public requiredAttesterSignatures;
    uint256 public requiredCitizenSignatures;
    uint256 public requiredRevocationAttesterSignatures;
    uint256 public requiredRevocationCitizenSignatures;

    // Mutable rejection thresholds (governance-tunable)
    uint256 public requiredAttesterRejections;
    uint256 public requiredCitizenRejections;

    event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RequestApproved(uint256 indexed requestId, address indexed approver, bool isAttester, bool isCitizen, bool signedAsAttester);
    event RequestRejected(uint256 indexed requestId, address indexed rejector, bool isAttester, bool isCitizen, bool signedAsAttester);
    event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId);
    event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId);

    event AttestationRequirementsChanged(uint256 oldAttester, uint256 newAttester, uint256 oldCitizen, uint256 newCitizen);
    event RevocationRequirementsChanged(uint256 oldAttester, uint256 newAttester, uint256 oldCitizen, uint256 newCitizen);
    event RejectionRequirementsChanged(uint256 oldAttester, uint256 newAttester, uint256 oldCitizen, uint256 newCitizen);

    constructor(
        address _attesterNFT,
        address initialOwner,
        address[3] memory foundingCitizens,
        uint256 _reqAttesterSignatures,
        uint256 _reqCitizenSignatures,
        uint256 _reqRevocationAttesterSignatures,
        uint256 _reqRevocationCitizenSignatures,
        uint256 _reqAttesterRejections,
        uint256 _reqCitizenRejections
    )
        ERC721("Roebel Citizen", "ROEBEL-CITIZEN")
        EIP712("Roebel Citizen", "1")
        Ownable(initialOwner)
    {
        require(_reqAttesterSignatures >= 1, "attester sigs >= 1");
        require(_reqCitizenSignatures >= 1, "citizen sigs >= 1");
        require(_reqRevocationAttesterSignatures >= 1, "revoke attester sigs >= 1");
        require(_reqRevocationCitizenSignatures >= 1, "revoke citizen sigs >= 1");
        require(_reqAttesterRejections >= 1, "attester rejections >= 1");
        require(_reqCitizenRejections >= 1, "citizen rejections >= 1");

        attesterNFT = IAttesterNFT(_attesterNFT);
        requiredAttesterSignatures = _reqAttesterSignatures;
        requiredCitizenSignatures = _reqCitizenSignatures;
        requiredRevocationAttesterSignatures = _reqRevocationAttesterSignatures;
        requiredRevocationCitizenSignatures = _reqRevocationCitizenSignatures;
        requiredAttesterRejections = _reqAttesterRejections;
        requiredCitizenRejections = _reqCitizenRejections;

        for (uint256 i = 0; i < 3; i++) {
            address founder = foundingCitizens[i];
            require(founder != address(0), "Invalid founding citizen address");
            for (uint256 j = i + 1; j < 3; j++) {
                require(founder != foundingCitizens[j], "Duplicate founding citizen");
            }

            uint256 tokenId = _nextTokenId++;
            _safeMint(founder, tokenId);
            _delegate(founder, founder);

            hasCitizenNFT[founder] = true;
            hasEverHeldCitizenNFT[founder] = true;
            _tokenIdByOwner[founder] = tokenId;

            emit CitizenNFTMinted(founder, tokenId, 0);
        }
    }

    // ---- One-time migration (cross-chain re-issue) ----

    bool public migrationFinalized;

    event MigrationMinted(address indexed citizen, uint256 indexed tokenId);
    event MigrationFinalized();

    /// @notice One-time, owner-only bulk re-issue used to migrate an existing
    /// citizen set onto a new chain. Idempotent (skips current holders) and
    /// permanently disabled by `finalizeMigration()`. Uses `_mint` (not
    /// `_safeMint`) so a smart-account citizen that doesn't implement
    /// onERC721Received cannot brick the batch; tokens are soulbound regardless.
    function migrationMint(address[] calldata citizens) external onlyOwner {
        require(!migrationFinalized, "Migration finalized");
        for (uint256 i = 0; i < citizens.length; i++) {
            address to = citizens[i];
            if (to == address(0) || hasCitizenNFT[to]) continue;
            uint256 tokenId = _nextTokenId++;
            _mint(to, tokenId);
            _delegate(to, to);
            hasCitizenNFT[to] = true;
            hasEverHeldCitizenNFT[to] = true;
            _tokenIdByOwner[to] = tokenId;
            emit CitizenNFTMinted(to, tokenId, 0);
            emit MigrationMinted(to, tokenId);
        }
    }

    /// @notice Permanently disables `migrationMint`. One-way: afterwards every
    /// new citizen must go through the multi-sig attestation flow.
    function finalizeMigration() external onlyOwner {
        migrationFinalized = true;
        emit MigrationFinalized();
    }

    // ---- Request lifecycle ----

    function createAttestationRequest(string calldata evidenceURI) external returns (uint256) {
        require(!hasCitizenNFT[msg.sender], "Already has Citizen NFT");
        require(balanceOf(msg.sender) == 0, "Already owns Citizen NFT");

        uint256 requestId = requestCount++;
        Request storage req = _requests[requestId];
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
        require(hasCitizenNFT[msg.sender], "Only Citizens can create revocation requests");
        require(hasCitizenNFT[target], "Target does not have Citizen NFT");

        uint256 requestId = requestCount++;
        Request storage req = _requests[requestId];
        req.id = requestId;
        req.requester = msg.sender;
        req.target = target;
        req.requestType = RequestType.Revocation;
        req.status = RequestStatus.Pending;
        req.evidenceURI = evidenceURI;
        req.createdAt = block.timestamp;

        emit RevocationRequestCreated(requestId, target, evidenceURI);
    }

    /// @notice Approve a request. Dual NFT holders pick which role they sign as via `signAsAttester`.
    function approveRequest(uint256 requestId, bool signAsAttester) external {
        Request storage req = _requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(!req.hasApproved[msg.sender], "Already approved");
        require(!req.hasRejected[msg.sender], "Already rejected");
        require(msg.sender != req.target, "Target cannot approve their own request");

        bool isAttester = attesterNFT.hasAttesterNFT(msg.sender);
        bool isCitizen = hasCitizenNFT[msg.sender];
        require(isAttester || isCitizen, "Must be Attester or Citizen to approve");

        req.hasApproved[msg.sender] = true;
        _requestApprovers[requestId].push(msg.sender);

        if (signAsAttester) {
            require(isAttester, "Must have Attester NFT to sign as Attester");
            req.attesterSignatures++;
        } else {
            require(isCitizen, "Must have Citizen NFT to sign as Citizen");
            req.citizenSignatures++;
        }

        emit RequestApproved(requestId, msg.sender, isAttester, isCitizen, signAsAttester);

        if (_hasRequiredSignatures(requestId)) {
            _executeRequest(requestId);
        }
    }

    /// @notice Reject a request. Status only flips to Rejected once BOTH attester and citizen
    ///         rejection thresholds are met, mirroring the approval pattern. A single rogue
    ///         signer cannot veto.
    function rejectRequest(uint256 requestId, bool signAsAttester) external {
        Request storage req = _requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(!req.hasApproved[msg.sender], "Already approved");
        require(!req.hasRejected[msg.sender], "Already rejected");
        require(msg.sender != req.target, "Target cannot reject their own request");

        bool isAttester = attesterNFT.hasAttesterNFT(msg.sender);
        bool isCitizen = hasCitizenNFT[msg.sender];
        require(isAttester || isCitizen, "Must be Attester or Citizen to reject");

        req.hasRejected[msg.sender] = true;
        _requestRejectors[requestId].push(msg.sender);

        if (signAsAttester) {
            require(isAttester, "Must have Attester NFT to sign as Attester");
            req.attesterRejections++;
        } else {
            require(isCitizen, "Must have Citizen NFT to sign as Citizen");
            req.citizenRejections++;
        }

        emit RequestRejected(requestId, msg.sender, isAttester, isCitizen, signAsAttester);

        if (
            req.attesterRejections >= requiredAttesterRejections &&
            req.citizenRejections >= requiredCitizenRejections
        ) {
            req.status = RequestStatus.Rejected;
        }
    }

    function _hasRequiredSignatures(uint256 requestId) internal view returns (bool) {
        Request storage req = _requests[requestId];
        if (req.requestType == RequestType.Attestation) {
            return req.attesterSignatures >= requiredAttesterSignatures
                && req.citizenSignatures  >= requiredCitizenSignatures;
        }
        return req.attesterSignatures >= requiredRevocationAttesterSignatures
            && req.citizenSignatures  >= requiredRevocationCitizenSignatures;
    }

    function _executeRequest(uint256 requestId) internal {
        Request storage req = _requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(_hasRequiredSignatures(requestId), "Not enough signatures");

        req.status = RequestStatus.Executed;

        if (req.requestType == RequestType.Attestation) {
            _mintCitizenNFT(req.target, requestId);
        } else {
            _revokeCitizenNFT(req.target, requestId);
        }
    }

    function _mintCitizenNFT(address to, uint256 requestId) internal {
        require(!hasCitizenNFT[to], "Already has Citizen NFT");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _delegate(to, to);

        hasCitizenNFT[to] = true;
        hasEverHeldCitizenNFT[to] = true;
        _tokenIdByOwner[to] = tokenId;

        emit CitizenNFTMinted(to, tokenId, requestId);
    }

    function _revokeCitizenNFT(address target, uint256 requestId) internal {
        require(hasCitizenNFT[target], "Target does not have Citizen NFT");

        uint256 tokenId = _tokenIdByOwner[target];
        delete _tokenIdByOwner[target];
        _burn(tokenId);

        hasCitizenNFT[target] = false;

        emit CitizenNFTRevoked(target, tokenId, requestId);
    }

    function emergencyMint(address) external pure {
        revert("Emergency minting permanently disabled. All citizens must go through multi-sig approval.");
    }

    // ---- Governance-tunable setters (Timelock = owner) ----

    function setAttestationRequirements(uint256 attReq, uint256 citReq) external onlyOwner {
        require(attReq >= 1, "attester sigs >= 1");
        require(citReq >= 1, "citizen sigs >= 1");
        emit AttestationRequirementsChanged(requiredAttesterSignatures, attReq, requiredCitizenSignatures, citReq);
        requiredAttesterSignatures = attReq;
        requiredCitizenSignatures = citReq;
    }

    function setRevocationRequirements(uint256 attReq, uint256 citReq) external onlyOwner {
        require(attReq >= 1, "revoke attester sigs >= 1");
        require(citReq >= 1, "revoke citizen sigs >= 1");
        emit RevocationRequirementsChanged(requiredRevocationAttesterSignatures, attReq, requiredRevocationCitizenSignatures, citReq);
        requiredRevocationAttesterSignatures = attReq;
        requiredRevocationCitizenSignatures = citReq;
    }

    function setRejectionRequirements(uint256 attReq, uint256 citReq) external onlyOwner {
        require(attReq >= 1, "attester rejections >= 1");
        require(citReq >= 1, "citizen rejections >= 1");
        emit RejectionRequirementsChanged(requiredAttesterRejections, attReq, requiredCitizenRejections, citReq);
        requiredAttesterRejections = attReq;
        requiredCitizenRejections = citReq;
    }

    // ---- Views (frontend-compatible) ----

    function getRequest(uint256 requestId) external view returns (
        address requester,
        address target,
        RequestType requestType,
        RequestStatus status,
        string memory evidenceURI,
        uint256 attesterSignatures,
        uint256 citizenSignatures,
        uint256 createdAt
    ) {
        Request storage req = _requests[requestId];
        return (
            req.requester,
            req.target,
            req.requestType,
            req.status,
            req.evidenceURI,
            req.attesterSignatures,
            req.citizenSignatures,
            req.createdAt
        );
    }

    function getRequestRejections(uint256 requestId) external view returns (uint256 attesterRejections, uint256 citizenRejections) {
        Request storage req = _requests[requestId];
        return (req.attesterRejections, req.citizenRejections);
    }

    function hasApprovedRequest(uint256 requestId, address approver) external view returns (bool) {
        return _requests[requestId].hasApproved[approver];
    }

    function hasRejectedRequest(uint256 requestId, address rejector) external view returns (bool) {
        return _requests[requestId].hasRejected[rejector];
    }

    function getApproverCount(uint256 requestId) external view returns (uint256) {
        return _requestApprovers[requestId].length;
    }

    function getApprovers(uint256 requestId) external view returns (address[] memory) {
        return _requestApprovers[requestId];
    }

    function getRejectors(uint256 requestId) external view returns (address[] memory) {
        return _requestRejectors[requestId];
    }

    // ---- ERC721 / soulbound plumbing ----

    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override(ERC721, ERC721Votes)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(
            from == address(0) || to == address(0),
            "Citizen NFTs are soulbound and cannot be transferred"
        );
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount)
        internal
        virtual
        override(ERC721, ERC721Votes)
    {
        super._increaseBalance(account, amount);
    }

    /// @dev O(1) lookup, backed by `_tokenIdByOwner`. Signature kept for ABI compatibility.
    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        require(index == 0, "Owner can only have 1 NFT");
        require(balanceOf(owner) > 0, "Owner has no NFTs");
        return _tokenIdByOwner[owner];
    }
}
