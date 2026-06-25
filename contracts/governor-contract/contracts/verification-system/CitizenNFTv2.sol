// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./ThresholdBands.sol";

interface IAttesterNFT {
    function hasAttesterNFT(address account) external view returns (bool);
    function attesterCount() external view returns (uint256);
}

/// @title CitizenNFTv2
/// @notice Soulbound ERC721Votes civic ID with **scale-aware, percentage-band** thresholds.
///
/// Design (frozen 2026-06-24, see docs/superpowers/plans/2026-06-24-gnosis-consolidation-...):
///  - **Join** = `attestationAttester` band (e.g. 30%, floor 2, cap 7) of the attester set
///    + fixed `attestationCitizen` co-sign (e.g. 1). Onboarding cost stays ~constant as the
///    citizen population grows (the citizen co-sign is fixed), only the small/capped attester
///    count scales — so adoption never slows.
///  - **Revoke** = `revocationAttester` band (e.g. 67%, floor 3, no cap) + fixed citizen co-sign.
///    The attester supermajority is what makes "two people can't revoke everyone" structural.
///  - **No-double-sign invariant**: one approval per wallet, single role via `signAsAttester`,
///    so a dual Attester+Citizen holder (the norm here) can never satisfy both halves alone.
///  - Each request **snapshots** its required counts at creation (no moving goalposts).
///  - **Re-attestation**: `validUntil` dormancy (NOT a burn). `renewSelf` / `renewByVouch` are
///    cheap so renewal never requires the full multi-sig at scale. Enforcement of dormancy lives
///    in the gates that read `isActive` (Circles membership condition + MACI signup gatekeeper).
///  - **attestationSource** reserves the Phase-2 Self.xyz personhood path (no PII on-chain).
contract CitizenNFTv2 is ERC721, ERC721Votes, Ownable {
    using ThresholdBands for ThresholdBands.Band;

    IAttesterNFT public attesterNFT;
    uint256 private _nextTokenId;

    mapping(address => bool) public hasCitizenNFT;
    mapping(address => bool) public hasEverHeldCitizenNFT;
    mapping(address => uint256) private _tokenIdByOwner;

    /// @notice Live citizen count (denominator for citizen-side percentage bands).
    uint256 public citizenCount;

    /// @notice Re-attestation: NFT goes dormant (not burned) after `validUntil`.
    /// 0 == no expiry for that holder. `attestationValidityPeriod == 0` disables expiry globally.
    mapping(address => uint64) public validUntil;
    uint64 public attestationValidityPeriod;

    enum AttestationSource { AttesterMultisig, SelfPersonhood }
    mapping(address => AttestationSource) public attestationSource;

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
        // snapshots taken at creation
        uint256 requiredAttesterApprovals;
        uint256 requiredCitizenApprovals;
        uint256 requiredAttesterRejections;
        uint256 requiredCitizenRejections;
        mapping(address => bool) hasApproved;
        mapping(address => bool) hasRejected;
        uint256 createdAt;
    }

    mapping(uint256 => Request) private _requests;
    uint256 public requestCount;

    // Threshold bands
    ThresholdBands.Band public attestationAttesterBand;
    ThresholdBands.Band public attestationCitizenBand;
    ThresholdBands.Band public revocationAttesterBand;
    ThresholdBands.Band public revocationCitizenBand;
    ThresholdBands.Band public rejectionAttesterBand;
    ThresholdBands.Band public rejectionCitizenBand;

    struct CitizenThresholds {
        ThresholdBands.Band attestationAttester;
        ThresholdBands.Band attestationCitizen;
        ThresholdBands.Band revocationAttester;
        ThresholdBands.Band revocationCitizen;
        ThresholdBands.Band rejectionAttester;
        ThresholdBands.Band rejectionCitizen;
    }

    event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RequestApproved(uint256 indexed requestId, address indexed approver, bool signedAsAttester);
    event RequestRejected(uint256 indexed requestId, address indexed rejector, bool signedAsAttester);
    event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId);
    event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId);
    event CitizenRenewed(address indexed citizen, uint64 validUntil);
    event AttestationBandsChanged();
    event RevocationBandsChanged();
    event RejectionBandsChanged();
    event ValidityPeriodChanged(uint64 oldPeriod, uint64 newPeriod);

    constructor(
        address _attesterNFT,
        address initialOwner,
        address[3] memory foundingCitizens,
        CitizenThresholds memory t,
        uint64 _validityPeriod
    )
        ERC721("Roebel Citizen", "ROEBEL-CITIZEN")
        EIP712("Roebel Citizen", "1")
        Ownable(initialOwner)
    {
        t.attestationAttester.validate();
        t.attestationCitizen.validate();
        t.revocationAttester.validate();
        t.revocationCitizen.validate();
        t.rejectionAttester.validate();
        t.rejectionCitizen.validate();

        attesterNFT = IAttesterNFT(_attesterNFT);
        attestationAttesterBand = t.attestationAttester;
        attestationCitizenBand = t.attestationCitizen;
        revocationAttesterBand = t.revocationAttester;
        revocationCitizenBand = t.revocationCitizen;
        rejectionAttesterBand = t.rejectionAttester;
        rejectionCitizenBand = t.rejectionCitizen;
        attestationValidityPeriod = _validityPeriod;

        for (uint256 i = 0; i < 3; i++) {
            address founder = foundingCitizens[i];
            require(founder != address(0), "Invalid founding citizen address");
            for (uint256 j = i + 1; j < 3; j++) {
                require(founder != foundingCitizens[j], "Duplicate founding citizen");
            }
            _mintCitizen(founder, 0, true);
        }
    }

    // ---- One-time migration (cross-chain re-issue) ----

    bool public migrationFinalized;
    event MigrationMinted(address indexed citizen, uint256 indexed tokenId);
    event MigrationFinalized();

    function migrationMint(address[] calldata citizens) external onlyOwner {
        require(!migrationFinalized, "Migration finalized");
        for (uint256 i = 0; i < citizens.length; i++) {
            address to = citizens[i];
            if (to == address(0) || hasCitizenNFT[to]) continue;
            uint256 tokenId = _mintCitizen(to, 0, false);
            emit MigrationMinted(to, tokenId);
        }
    }

    function finalizeMigration() external onlyOwner {
        migrationFinalized = true;
        emit MigrationFinalized();
    }

    // ---- Request lifecycle ----

    function createAttestationRequest(string calldata evidenceURI) external returns (uint256) {
        require(!hasCitizenNFT[msg.sender], "Already has Citizen NFT");
        require(balanceOf(msg.sender) == 0, "Already owns Citizen NFT");
        return _createRequest(msg.sender, RequestType.Attestation, evidenceURI);
    }

    function createRevocationRequest(address target, string calldata evidenceURI) external returns (uint256) {
        require(hasCitizenNFT[msg.sender], "Only Citizens can create revocation requests");
        require(hasCitizenNFT[target], "Target does not have Citizen NFT");
        return _createRequest(target, RequestType.Revocation, evidenceURI);
    }

    function _createRequest(address target, RequestType reqType, string calldata evidenceURI) internal returns (uint256) {
        uint256 requestId = requestCount++;
        Request storage req = _requests[requestId];
        req.id = requestId;
        req.requester = msg.sender;
        req.target = target;
        req.requestType = reqType;
        req.status = RequestStatus.Pending;
        req.evidenceURI = evidenceURI;
        req.createdAt = block.timestamp;

        uint256 attSize = attesterNFT.attesterCount();
        if (reqType == RequestType.Attestation) {
            req.requiredAttesterApprovals = attestationAttesterBand.required(attSize);
            req.requiredCitizenApprovals = attestationCitizenBand.required(citizenCount);
            emit AttestationRequestCreated(requestId, target, evidenceURI);
        } else {
            req.requiredAttesterApprovals = revocationAttesterBand.required(attSize);
            req.requiredCitizenApprovals = revocationCitizenBand.required(citizenCount);
            emit RevocationRequestCreated(requestId, target, evidenceURI);
        }
        req.requiredAttesterRejections = rejectionAttesterBand.required(attSize);
        req.requiredCitizenRejections = rejectionCitizenBand.required(citizenCount);
        return requestId;
    }

    /// @notice Approve a request. Dual NFT holders pick which role they sign as via `signAsAttester`.
    /// One approval per wallet (enforced) → a dual holder counts toward exactly one role.
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
        if (signAsAttester) {
            require(isAttester, "Must have Attester NFT to sign as Attester");
            req.attesterSignatures++;
        } else {
            require(isCitizen, "Must have Citizen NFT to sign as Citizen");
            req.citizenSignatures++;
        }

        emit RequestApproved(requestId, msg.sender, signAsAttester);

        if (_hasRequiredSignatures(req)) {
            _executeRequest(requestId);
        }
    }

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
        if (signAsAttester) {
            require(isAttester, "Must have Attester NFT to sign as Attester");
            req.attesterRejections++;
        } else {
            require(isCitizen, "Must have Citizen NFT to sign as Citizen");
            req.citizenRejections++;
        }

        emit RequestRejected(requestId, msg.sender, signAsAttester);

        if (
            req.attesterRejections >= req.requiredAttesterRejections &&
            req.citizenRejections >= req.requiredCitizenRejections
        ) {
            req.status = RequestStatus.Rejected;
        }
    }

    function _hasRequiredSignatures(Request storage req) internal view returns (bool) {
        return req.attesterSignatures >= req.requiredAttesterApprovals
            && req.citizenSignatures >= req.requiredCitizenApprovals;
    }

    function _executeRequest(uint256 requestId) internal {
        Request storage req = _requests[requestId];
        require(req.status == RequestStatus.Pending, "Request not pending");
        require(_hasRequiredSignatures(req), "Not enough signatures");
        req.status = RequestStatus.Executed;
        if (req.requestType == RequestType.Attestation) {
            _mintCitizen(req.target, requestId, true);
        } else {
            _revokeCitizen(req.target, requestId);
        }
    }

    /// @param useSafe true for founder/attestation mints (`_safeMint`); false for migration
    /// (`_mint`, so one non-receiver smart account can't brick a bulk batch). Soulbound either way.
    function _mintCitizen(address to, uint256 requestId, bool useSafe) internal returns (uint256 tokenId) {
        require(!hasCitizenNFT[to], "Already has Citizen NFT");
        tokenId = _nextTokenId++;
        if (useSafe) {
            _safeMint(to, tokenId);
        } else {
            _mint(to, tokenId);
        }
        _delegate(to, to);

        hasCitizenNFT[to] = true;
        hasEverHeldCitizenNFT[to] = true;
        _tokenIdByOwner[to] = tokenId;
        citizenCount++;
        validUntil[to] = _freshValidUntil();
        attestationSource[to] = AttestationSource.AttesterMultisig;

        emit CitizenNFTMinted(to, tokenId, requestId);
    }

    function _revokeCitizen(address target, uint256 requestId) internal {
        require(hasCitizenNFT[target], "Target does not have Citizen NFT");
        uint256 tokenId = _tokenIdByOwner[target];
        delete _tokenIdByOwner[target];
        _burn(tokenId);
        hasCitizenNFT[target] = false;
        citizenCount--;
        emit CitizenNFTRevoked(target, tokenId, requestId);
    }

    function emergencyMint(address) external pure {
        revert("Emergency minting permanently disabled. All citizens must go through multi-sig approval.");
    }

    // ---- Re-attestation / dormancy ----

    function _freshValidUntil() internal view returns (uint64) {
        if (attestationValidityPeriod == 0) return 0;
        return uint64(block.timestamp) + attestationValidityPeriod;
    }

    /// @notice A live citizen whose attestation has not lapsed.
    function isActive(address account) public view returns (bool) {
        if (!hasCitizenNFT[account]) return false;
        uint64 vu = validUntil[account];
        return vu == 0 || block.timestamp <= vu;
    }

    /// @notice Cheap liveness renewal by the citizen themselves.
    function renewSelf() external {
        require(hasCitizenNFT[msg.sender], "Not a Citizen");
        validUntil[msg.sender] = _freshValidUntil();
        emit CitizenRenewed(msg.sender, validUntil[msg.sender]);
    }

    /// @notice One other citizen vouches to renew an offline citizen (no full multi-sig).
    function renewByVouch(address citizen) external {
        require(hasCitizenNFT[msg.sender], "Only Citizens can vouch");
        require(msg.sender != citizen, "Cannot vouch for self");
        require(hasCitizenNFT[citizen], "Target not a Citizen");
        validUntil[citizen] = _freshValidUntil();
        emit CitizenRenewed(citizen, validUntil[citizen]);
    }

    // ---- Governance-tunable setters (Safe/Timelock = owner) ----

    function setAttestationBands(ThresholdBands.Band calldata attester, ThresholdBands.Band calldata citizen) external onlyOwner {
        attester.validate();
        citizen.validate();
        attestationAttesterBand = attester;
        attestationCitizenBand = citizen;
        emit AttestationBandsChanged();
    }

    function setRevocationBands(ThresholdBands.Band calldata attester, ThresholdBands.Band calldata citizen) external onlyOwner {
        attester.validate();
        citizen.validate();
        revocationAttesterBand = attester;
        revocationCitizenBand = citizen;
        emit RevocationBandsChanged();
    }

    function setRejectionBands(ThresholdBands.Band calldata attester, ThresholdBands.Band calldata citizen) external onlyOwner {
        attester.validate();
        citizen.validate();
        rejectionAttesterBand = attester;
        rejectionCitizenBand = citizen;
        emit RejectionBandsChanged();
    }

    function setValidityPeriod(uint64 newPeriod) external onlyOwner {
        emit ValidityPeriodChanged(attestationValidityPeriod, newPeriod);
        attestationValidityPeriod = newPeriod;
    }

    // ---- Views ----

    function requiredAttesterApprovalsFor(uint256 requestId) external view returns (uint256) {
        return _requests[requestId].requiredAttesterApprovals;
    }

    function requiredCitizenApprovalsFor(uint256 requestId) external view returns (uint256) {
        return _requests[requestId].requiredCitizenApprovals;
    }

    function requiredAttesterRejectionsFor(uint256 requestId) external view returns (uint256) {
        return _requests[requestId].requiredAttesterRejections;
    }

    function requiredCitizenRejectionsFor(uint256 requestId) external view returns (uint256) {
        return _requests[requestId].requiredCitizenRejections;
    }

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
            req.requester, req.target, req.requestType, req.status,
            req.evidenceURI, req.attesterSignatures, req.citizenSignatures, req.createdAt
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

    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        require(index == 0, "Owner can only have 1 NFT");
        require(balanceOf(owner) > 0, "Owner has no NFTs");
        return _tokenIdByOwner[owner];
    }
}
