// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Votes.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./ThresholdBands.sol";
import "./V3Migration.sol";

/// @notice What CitizenNFTv3 reads from AttesterNFTv3.
interface IAttesterNFTv3 {
    function hasAttesterNFT(address account) external view returns (bool);
    function attesterCount() external view returns (uint256);
    function originOf(address account) external view returns (address);
}

/// @notice What bootstrap reads from CitizenNFTv2.
interface ICitizenNFTv2Source {
    function hasCitizenNFT(address account) external view returns (bool);
    function attestationSource(address account) external view returns (uint8);
}

/// @title CitizenNFTv3
/// @notice Soulbound ERC721Votes civic ID. Same semantics as CitizenNFTv2 (percentage-band
///         thresholds with request snapshots, dual-holder no-double-sign invariant, attestation /
///         revocation / rejection flows, self-delegation, `attestationSource`), plus the v2 → v3
///         migration (see V3Migration for the full design):
///  - **Ownable2Step**: owner (the new Attester Safe) set in the constructor; handovers must
///    be accepted.
///  - **No founders**: seeded by `bootstrapFromV2` from CitizenNFTv2 holders (checked on-chain),
///    then `finalizeBootstrap()` closes owner minting forever.
///  - **`moveTo`**: a holder moves its token (same id, same `attestationSource`, votes follow)
///    to an account its legacy account has made admin. `citizenCount` never changes on a move.
///  - Thresholds read `attesterCount` from **AttesterNFTv3** (given in the constructor).
///
/// **Deliberate change from v2: no re-attestation.** v2's `validUntil` dormancy,
/// `attestationValidityPeriod`, `setValidityPeriod`, `isActive`, `renewSelf` and `renewByVouch`
/// are removed (decided 2026-09-26). Citizenship is valid until revoked. Nothing in the app or
/// the contracts read `isActive()` (verified 2026-09-05 and again 2026-09-26).
///
/// **No-double-sign across moves.** Votes on a request are keyed by identity origin, and a
/// voter is keyed by BOTH its citizen origin and its attester origin (AttesterNFTv3.originOf).
/// So a dual holder who moved only one of its two tokens (two addresses, one role each) still
/// counts for only one role per request, exactly like an unmoved dual holder.
///
/// Owner powers: bootstrap (until finalized), the band setters, closing the move window and
/// ownership handover. The owner cannot burn, and cannot mint after bootstrap finalization.
contract CitizenNFTv3 is ERC721, ERC721Votes, Ownable2Step, V3Migration {
    using ThresholdBands for ThresholdBands.Band;

    error AlreadyCitizen(address account);
    error OnlyCitizens();
    error TargetNotCitizen(address target);
    error RequestNotPending(uint256 requestId);
    error AlreadyVoted(uint256 requestId);
    error TargetCannotVote(uint256 requestId);
    error NotAttesterOrCitizen();
    error NotAttester();
    error NotCitizen();
    error Soulbound();
    error EmergencyMintDisabled();
    error OnlyOneTokenPerOwner();
    error NoToken(address owner);

    IAttesterNFTv3 public immutable attesterNFT;
    /// @notice The v2 contract bootstrap reads holders from (immutable).
    ICitizenNFTv2Source public immutable citizenNFTv2;

    uint256 private _nextTokenId;

    mapping(address => bool) public hasCitizenNFT;
    mapping(address => bool) public hasEverHeldCitizenNFT;
    mapping(address => uint256) private _tokenIdByOwner;

    /// @notice Live citizen count (denominator for citizen-side bands). Constant under moves.
    uint256 public citizenCount;

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
        uint256 requiredAttesterApprovals;
        uint256 requiredCitizenApprovals;
        uint256 requiredAttesterRejections;
        uint256 requiredCitizenRejections;
        /// @dev keyed by identity origin (citizen origin AND attester origin of the voter)
        mapping(address => bool) hasApproved;
        mapping(address => bool) hasRejected;
        uint256 createdAt;
    }

    mapping(uint256 => Request) private _requests;
    uint256 public requestCount;

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
    event AttestationBandsChanged();
    event RevocationBandsChanged();
    event RejectionBandsChanged();

    constructor(
        address _attesterNFT,
        address _citizenNFTv2,
        address initialOwner,
        CitizenThresholds memory t
    )
        ERC721("Roebel Citizen", "ROEBEL-CITIZEN")
        EIP712("Roebel Citizen", "3")
        Ownable(initialOwner)
    {
        if (_attesterNFT == address(0) || _citizenNFTv2 == address(0)) revert ZeroAddress();
        t.attestationAttester.validate();
        t.attestationCitizen.validate();
        t.revocationAttester.validate();
        t.revocationCitizen.validate();
        t.rejectionAttester.validate();
        t.rejectionCitizen.validate();

        attesterNFT = IAttesterNFTv3(_attesterNFT);
        citizenNFTv2 = ICitizenNFTv2Source(_citizenNFTv2);
        attestationAttesterBand = t.attestationAttester;
        attestationCitizenBand = t.attestationCitizen;
        revocationAttesterBand = t.revocationAttester;
        revocationCitizenBand = t.revocationCitizen;
        rejectionAttesterBand = t.rejectionAttester;
        rejectionCitizenBand = t.rejectionCitizen;
    }

    // ---- Migration phase 1: bootstrap from v2 (one-way) ----

    /// @notice Re-issue a v3 token to each CitizenNFTv2 holder at the SAME address, copying its
    /// v2 `attestationSource`. Skips addresses that hold or ever held a v3 token (re-running a
    /// batch is safe; a v3 revocation or move can never be undone by bootstrap). Reverts on any
    /// address that is not a v2 holder.
    function bootstrapFromV2(address[] calldata holders) external onlyOwner {
        if (bootstrapFinalized) revert BootstrapAlreadyFinalized();
        for (uint256 i = 0; i < holders.length; i++) {
            address h = holders[i];
            if (!citizenNFTv2.hasCitizenNFT(h)) revert NotV2Holder(h);
            if (hasEverHeldCitizenNFT[h] || movedTo[h] != address(0)) continue;
            AttestationSource src = AttestationSource(citizenNFTv2.attestationSource(h));
            uint256 tokenId = _mintCitizen(h, 0, src);
            emit BootstrapMinted(h, tokenId);
        }
    }

    /// @notice One-way: after this the owner can never mint again.
    function finalizeBootstrap() external onlyOwner {
        bootstrapFinalized = true;
        emit BootstrapFinalized();
    }

    // ---- Migration phase 2: self-serve move (one-way window) ----

    /// @notice Move the caller's citizen token to `newAccount`. Called through the legacy
    /// account (`legacy.execute(this, 0, moveTo(safe))`), so `msg.sender` is the legacy account
    /// and `ILegacyAccount(msg.sender).isAdmin(newAccount)` proves the link.
    ///
    ///  - Same token id, burned at the old address and re-minted at `newAccount` atomically.
    ///    Keeping the id matters for MACI: SignUpTokenGatekeeper registers token ids, so a
    ///    moved citizen cannot sign up a second time with a "new" token.
    ///  - `attestationSource` is copied; `citizenCount` is unchanged; `newAccount`
    ///    self-delegates, so the old address ends with 0 votes and the new one with 1.
    ///  - Open requests: approvals/rejections already cast stay counted and keyed to the origin
    ///    (the mover cannot vote again from `newAccount`); a pending revocation of the mover
    ///    executes against `newAccount`; nothing can mint to or revoke the old address.
    function moveTo(address newAccount) external {
        if (moveWindowClosed) revert MoveWindowAlreadyClosed();
        address from = msg.sender;
        if (!hasCitizenNFT[from]) revert NotHolder(from);
        if (newAccount == address(0)) revert ZeroAddress();
        if (hasCitizenNFT[newAccount] || hasEverHeldCitizenNFT[newAccount] || movedTo[newAccount] != address(0)) {
            revert DestinationAlreadyUsed(newAccount);
        }
        _requireAdminLink(from, newAccount);

        uint256 tokenId = _tokenIdByOwner[from];
        AttestationSource src = attestationSource[from];
        delete _tokenIdByOwner[from];
        hasCitizenNFT[from] = false;
        _burn(tokenId); // the old address's delegate loses the voting unit

        hasCitizenNFT[newAccount] = true;
        hasEverHeldCitizenNFT[newAccount] = true;
        _tokenIdByOwner[newAccount] = tokenId;
        attestationSource[newAccount] = src;
        _recordMove(from, newAccount);
        _delegate(newAccount, newAccount);

        emit Moved(from, newAccount, tokenId, tokenId);
        _safeMint(newAccount, tokenId); // receiver callback last (checks-effects-interactions)
    }

    /// @notice One-way: after this no holder can move.
    function closeMoveWindow() external onlyOwner {
        moveWindowClosed = true;
        emit MoveWindowClosed();
    }

    // ---- Request lifecycle ----

    function createAttestationRequest(string calldata evidenceURI) external returns (uint256) {
        if (hasCitizenNFT[msg.sender] || balanceOf(msg.sender) != 0) revert AlreadyCitizen(msg.sender);
        if (movedTo[msg.sender] != address(0)) revert AccountMovedAway(msg.sender);
        return _createRequest(msg.sender, RequestType.Attestation, evidenceURI);
    }

    function createRevocationRequest(address target, string calldata evidenceURI) external returns (uint256) {
        if (!hasCitizenNFT[msg.sender]) revert OnlyCitizens();
        if (!hasCitizenNFT[target]) revert TargetNotCitizen(target);
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

    /// @dev Shared checks for approve/reject. Returns the voter's two identity keys (citizen
    /// origin, attester origin); both get marked so neither address of a split dual holder
    /// can vote again on this request.
    function _checkVoter(uint256 requestId, bool signAsAttester)
        internal
        view
        returns (Request storage req, address citizenKey, address attesterKey)
    {
        req = _requests[requestId];
        if (req.status != RequestStatus.Pending) revert RequestNotPending(requestId);

        bool isAttester = attesterNFT.hasAttesterNFT(msg.sender);
        bool isCitizen = hasCitizenNFT[msg.sender];
        if (!isAttester && !isCitizen) revert NotAttesterOrCitizen();
        if (signAsAttester) {
            if (!isAttester) revert NotAttester();
        } else {
            if (!isCitizen) revert NotCitizen();
        }

        citizenKey = originOf(msg.sender);
        attesterKey = attesterNFT.originOf(msg.sender);
        if (
            req.hasApproved[citizenKey] || req.hasRejected[citizenKey] ||
            req.hasApproved[attesterKey] || req.hasRejected[attesterKey]
        ) revert AlreadyVoted(requestId);

        address targetKey = originOf(req.target);
        if (msg.sender == req.target || citizenKey == targetKey || attesterKey == targetKey) {
            revert TargetCannotVote(requestId);
        }
    }

    /// @notice Approve a request. Dual NFT holders pick which role they sign as via `signAsAttester`.
    /// One vote per identity → a dual holder counts toward exactly one role.
    function approveRequest(uint256 requestId, bool signAsAttester) external {
        (Request storage req, address citizenKey, address attesterKey) = _checkVoter(requestId, signAsAttester);
        req.hasApproved[citizenKey] = true;
        req.hasApproved[attesterKey] = true;
        if (signAsAttester) req.attesterSignatures++;
        else req.citizenSignatures++;

        emit RequestApproved(requestId, msg.sender, signAsAttester);

        if (req.attesterSignatures >= req.requiredAttesterApprovals
            && req.citizenSignatures >= req.requiredCitizenApprovals) {
            _executeRequest(requestId);
        }
    }

    function rejectRequest(uint256 requestId, bool signAsAttester) external {
        (Request storage req, address citizenKey, address attesterKey) = _checkVoter(requestId, signAsAttester);
        req.hasRejected[citizenKey] = true;
        req.hasRejected[attesterKey] = true;
        if (signAsAttester) req.attesterRejections++;
        else req.citizenRejections++;

        emit RequestRejected(requestId, msg.sender, signAsAttester);

        if (
            req.attesterRejections >= req.requiredAttesterRejections &&
            req.citizenRejections >= req.requiredCitizenRejections
        ) {
            req.status = RequestStatus.Rejected;
        }
    }

    function _executeRequest(uint256 requestId) internal {
        Request storage req = _requests[requestId];
        req.status = RequestStatus.Executed;
        if (req.requestType == RequestType.Attestation) {
            _mintCitizen(req.target, requestId, AttestationSource.AttesterMultisig);
        } else {
            // Follow the target's lineage to whoever holds it now (it may have moved).
            address holder = currentHolderOf(req.target);
            if (holder == address(0) || !hasCitizenNFT[holder]) revert TargetNotCitizen(req.target);
            _revokeCitizen(holder, requestId);
        }
    }

    function _mintCitizen(address to, uint256 requestId, AttestationSource src) internal returns (uint256 tokenId) {
        if (hasCitizenNFT[to]) revert AlreadyCitizen(to);
        if (movedTo[to] != address(0)) revert AccountMovedAway(to);
        tokenId = _nextTokenId++;
        hasCitizenNFT[to] = true;
        hasEverHeldCitizenNFT[to] = true;
        _tokenIdByOwner[to] = tokenId;
        citizenCount++;
        attestationSource[to] = src;
        _startLineage(to);
        _delegate(to, to);
        emit CitizenNFTMinted(to, tokenId, requestId);
        _safeMint(to, tokenId); // receiver callback last
    }

    function _revokeCitizen(address target, uint256 requestId) internal {
        uint256 tokenId = _tokenIdByOwner[target];
        delete _tokenIdByOwner[target];
        hasCitizenNFT[target] = false;
        citizenCount--;
        _endLineage(target);
        _burn(tokenId);
        emit CitizenNFTRevoked(target, tokenId, requestId);
    }

    function emergencyMint(address) external pure {
        revert EmergencyMintDisabled();
    }

    // ---- Governance-tunable setters (owner) ----

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

    /// @notice True if `approver`'s identity (either origin) approved the request, from any address.
    function hasApprovedRequest(uint256 requestId, address approver) external view returns (bool) {
        Request storage req = _requests[requestId];
        return req.hasApproved[originOf(approver)] || req.hasApproved[attesterNFT.originOf(approver)];
    }

    function hasRejectedRequest(uint256 requestId, address rejector) external view returns (bool) {
        Request storage req = _requests[requestId];
        return req.hasRejected[originOf(rejector)] || req.hasRejected[attesterNFT.originOf(rejector)];
    }

    // ---- ERC721 / soulbound plumbing ----

    /// @dev Only mint (from == 0) and burn (to == 0). A move is a burn + a mint.
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override(ERC721, ERC721Votes)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
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
        if (index != 0) revert OnlyOneTokenPerOwner();
        if (balanceOf(owner) == 0) revert NoToken(owner);
        return _tokenIdByOwner[owner];
    }
}
