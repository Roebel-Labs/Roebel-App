// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./ThresholdBands.sol";
import "./V3Migration.sol";

interface IAttesterNFTv2Source {
    function hasAttesterNFT(address account) external view returns (bool);
}

/// @title AttesterNFTv3
/// @notice Soulbound NFT for Roebel culture-committee members. Same request/approve/reject/
///         revoke semantics and %-band thresholds as AttesterNFTv2, plus the v2 → v3 migration
///         (see V3Migration for the full design):
///  - **Ownable2Step**: the owner (the new Attester Safe) is set in the constructor and any
///    handover must be accepted by the receiving address.
///  - **No founders**: the set is seeded by `bootstrapFromV2`, which re-issues a token to each
///    address that holds AttesterNFTv2 (checked on-chain), then `finalizeBootstrap()` closes
///    owner minting forever. After that, tokens only come from the multi-sig request flow.
///  - **`moveTo`**: a holder moves its token to an account the holder's legacy account has
///    made its admin. `attesterCount` never changes on a move.
///  - Request votes are keyed by identity origin (see V3Migration), so a moved attester cannot
///    vote twice on the same request, and revocations follow the target across moves.
///
/// Owner powers: bootstrap (until finalized), the two band setters, closing the move window,
/// and ownership handover. The owner cannot burn, and cannot mint after bootstrap finalization.
contract AttesterNFTv3 is ERC721, Ownable2Step, V3Migration {
    using ThresholdBands for ThresholdBands.Band;

    error AlreadyAttester(address account);
    error OnlyAttesters();
    error TargetNotAttester(address target);
    error RequestNotPending(uint256 requestId);
    error AlreadyVoted(uint256 requestId);
    error TargetCannotVote(uint256 requestId);
    error Soulbound();
    error EmergencyMintDisabled();
    error OnlyOneTokenPerOwner();
    error NoToken(address owner);

    /// @notice The v2 contract bootstrap reads holders from (immutable).
    IAttesterNFTv2Source public immutable attesterNFTv2;

    uint256 private _nextTokenId;

    mapping(address => bool) public hasAttesterNFT;
    mapping(address => bool) public hasEverHeldAttesterNFT;

    /// @notice Live number of attesters (denominator for percentage bands). Constant under moves.
    uint256 public attesterCount;

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
        uint256 requiredApprovals;  // snapshot at creation
        uint256 requiredRejections; // snapshot at creation
        uint256 createdAt;
    }

    mapping(uint256 => Request) public requests;
    uint256 public requestCount;

    /// @dev requestId => identity origin => voted. Keyed by origin, not msg.sender (see V3Migration).
    mapping(uint256 => mapping(address => bool)) private _requestApprovals;
    mapping(uint256 => mapping(address => bool)) private _requestRejections;

    ThresholdBands.Band public approvalBand;
    ThresholdBands.Band public rejectionBand;

    event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI);
    event RequestApproved(uint256 indexed requestId, address indexed approver);
    event RequestRejected(uint256 indexed requestId, address indexed rejector);
    event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId);
    event AttesterNFTRevoked(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId);

    event ApprovalBandChanged(uint16 percentBps, uint16 floor, uint16 cap);
    event RejectionBandChanged(uint16 percentBps, uint16 floor, uint16 cap);

    constructor(
        address initialOwner,
        address _attesterNFTv2,
        string memory name,
        string memory symbol,
        ThresholdBands.Band memory _approvalBand,
        ThresholdBands.Band memory _rejectionBand
    )
        ERC721(name, symbol)
        Ownable(initialOwner)
    {
        if (_attesterNFTv2 == address(0)) revert ZeroAddress();
        _approvalBand.validate();
        _rejectionBand.validate();
        attesterNFTv2 = IAttesterNFTv2Source(_attesterNFTv2);
        approvalBand = _approvalBand;
        rejectionBand = _rejectionBand;
    }

    // ---- Migration phase 1: bootstrap from v2 (one-way) ----

    /// @notice Re-issue a v3 token to each address that holds AttesterNFTv2 today, at the SAME
    /// address. Skips addresses that hold or ever held a v3 token (so re-running a batch is
    /// safe, and a v3 revocation or move can never be undone by bootstrap). Reverts on any
    /// address that is not a v2 holder, so a typo can't mint an identity.
    function bootstrapFromV2(address[] calldata holders) external onlyOwner {
        if (bootstrapFinalized) revert BootstrapAlreadyFinalized();
        for (uint256 i = 0; i < holders.length; i++) {
            address h = holders[i];
            if (!attesterNFTv2.hasAttesterNFT(h)) revert NotV2Holder(h);
            if (hasEverHeldAttesterNFT[h] || movedTo[h] != address(0)) continue;
            uint256 tokenId = _mintAttesterNFT(h, 0);
            emit BootstrapMinted(h, tokenId);
        }
    }

    /// @notice One-way: after this the owner can never mint again.
    function finalizeBootstrap() external onlyOwner {
        bootstrapFinalized = true;
        emit BootstrapFinalized();
    }

    // ---- Migration phase 2: self-serve move (one-way window) ----

    /// @notice Move the caller's token to `newAccount`. Called through the legacy account
    /// (`legacy.execute(this, 0, moveTo(safe))`), so `msg.sender` is the legacy account and
    /// `ILegacyAccount(msg.sender).isAdmin(newAccount)` is the on-chain proof of the link.
    ///
    /// The token keeps its id: it is burned at the old address and re-minted with the same id
    /// at `newAccount` in one transaction. `attesterCount` is unchanged. Open requests:
    /// approvals/rejections already cast stay counted (keyed by origin, so the mover cannot
    /// vote again from `newAccount`); a pending revocation of the mover executes against
    /// `newAccount`; a pending request can never mint to or revoke the old address.
    function moveTo(address newAccount) external {
        if (moveWindowClosed) revert MoveWindowAlreadyClosed();
        address from = msg.sender;
        if (!hasAttesterNFT[from]) revert NotHolder(from);
        if (newAccount == address(0)) revert ZeroAddress();
        if (hasAttesterNFT[newAccount] || hasEverHeldAttesterNFT[newAccount] || movedTo[newAccount] != address(0)) {
            revert DestinationAlreadyUsed(newAccount);
        }
        _requireAdminLink(from, newAccount);

        uint256 tokenId = _tokenIdByOwner[from];
        delete _tokenIdByOwner[from];
        hasAttesterNFT[from] = false;
        _burn(tokenId);

        hasAttesterNFT[newAccount] = true;
        hasEverHeldAttesterNFT[newAccount] = true;
        _tokenIdByOwner[newAccount] = tokenId;
        _recordMove(from, newAccount);

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
        if (hasAttesterNFT[msg.sender] || balanceOf(msg.sender) != 0) revert AlreadyAttester(msg.sender);
        if (movedTo[msg.sender] != address(0)) revert AccountMovedAway(msg.sender);
        return _createRequest(msg.sender, RequestType.Attestation, evidenceURI);
    }

    function createRevocationRequest(address target, string calldata evidenceURI) external returns (uint256) {
        if (!hasAttesterNFT[msg.sender]) revert OnlyAttesters();
        if (!hasAttesterNFT[target]) revert TargetNotAttester(target);
        return _createRequest(target, RequestType.Revocation, evidenceURI);
    }

    function _createRequest(address target, RequestType reqType, string calldata evidenceURI) internal returns (uint256) {
        uint256 requestId = requestCount++;
        Request storage req = requests[requestId];
        req.id = requestId;
        req.requester = msg.sender;
        req.target = target;
        req.requestType = reqType;
        req.status = RequestStatus.Pending;
        req.evidenceURI = evidenceURI;
        req.requiredApprovals = approvalBand.required(attesterCount);
        req.requiredRejections = rejectionBand.required(attesterCount);
        req.createdAt = block.timestamp;

        if (reqType == RequestType.Attestation) {
            emit AttestationRequestCreated(requestId, target, evidenceURI);
        } else {
            emit RevocationRequestCreated(requestId, target, evidenceURI);
        }
        return requestId;
    }

    /// @dev Shared checks for approve/reject; returns the voter's identity key (origin).
    function _voterKey(uint256 requestId) internal view returns (address key, Request storage req) {
        if (!hasAttesterNFT[msg.sender]) revert OnlyAttesters();
        req = requests[requestId];
        if (req.status != RequestStatus.Pending) revert RequestNotPending(requestId);
        key = originOf(msg.sender);
        if (_requestApprovals[requestId][key] || _requestRejections[requestId][key]) revert AlreadyVoted(requestId);
        if (msg.sender == req.target || key == originOf(req.target)) revert TargetCannotVote(requestId);
    }

    function approveRequest(uint256 requestId) external {
        (address key, Request storage req) = _voterKey(requestId);
        _requestApprovals[requestId][key] = true;
        req.signatureCount++;
        emit RequestApproved(requestId, msg.sender);
        if (req.signatureCount >= req.requiredApprovals) {
            _executeRequest(requestId);
        }
    }

    function rejectRequest(uint256 requestId) external {
        (address key, Request storage req) = _voterKey(requestId);
        _requestRejections[requestId][key] = true;
        req.rejectionCount++;
        emit RequestRejected(requestId, msg.sender);
        if (req.rejectionCount >= req.requiredRejections) {
            req.status = RequestStatus.Rejected;
        }
    }

    function _executeRequest(uint256 requestId) internal {
        Request storage req = requests[requestId];
        req.status = RequestStatus.Executed;
        if (req.requestType == RequestType.Attestation) {
            _mintAttesterNFT(req.target, requestId);
        } else {
            // Follow the target's lineage to whoever holds it now (it may have moved).
            address holder = currentHolderOf(req.target);
            if (holder == address(0) || !hasAttesterNFT[holder]) revert TargetNotAttester(req.target);
            _revokeAttesterNFT(holder, requestId);
        }
    }

    function _mintAttesterNFT(address to, uint256 requestId) internal returns (uint256 tokenId) {
        if (hasAttesterNFT[to]) revert AlreadyAttester(to);
        if (movedTo[to] != address(0)) revert AccountMovedAway(to);
        tokenId = _nextTokenId++;
        hasAttesterNFT[to] = true;
        hasEverHeldAttesterNFT[to] = true;
        _tokenIdByOwner[to] = tokenId;
        attesterCount++;
        _startLineage(to);
        emit AttesterNFTMinted(to, tokenId, requestId);
        _safeMint(to, tokenId); // receiver callback last
    }

    function _revokeAttesterNFT(address target, uint256 requestId) internal {
        uint256 tokenId = _tokenIdByOwner[target];
        delete _tokenIdByOwner[target];
        hasAttesterNFT[target] = false;
        attesterCount--;
        _endLineage(target);
        _burn(tokenId);
        emit AttesterNFTRevoked(target, tokenId, requestId);
    }

    function emergencyMint(address) external pure {
        revert EmergencyMintDisabled();
    }

    // ---- Governance-tunable setters (owner) ----

    function setApprovalBand(ThresholdBands.Band calldata b) external onlyOwner {
        b.validate();
        approvalBand = b;
        emit ApprovalBandChanged(b.percentBps, b.floor, b.cap);
    }

    function setRejectionBand(ThresholdBands.Band calldata b) external onlyOwner {
        b.validate();
        rejectionBand = b;
        emit RejectionBandChanged(b.percentBps, b.floor, b.cap);
    }

    // ---- Views ----

    function requiredApprovalsFor(uint256 requestId) external view returns (uint256) {
        return requests[requestId].requiredApprovals;
    }

    function requiredRejectionsFor(uint256 requestId) external view returns (uint256) {
        return requests[requestId].requiredRejections;
    }

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
            req.requester, req.target, req.requestType, req.status,
            req.evidenceURI, req.signatureCount, req.createdAt
        );
    }

    function getRequestRejections(uint256 requestId) external view returns (uint256) {
        return requests[requestId].rejectionCount;
    }

    /// @notice True if `approver`'s identity (origin) approved the request, from any address.
    function hasApprovedRequest(uint256 requestId, address approver) external view returns (bool) {
        return _requestApprovals[requestId][originOf(approver)];
    }

    function hasRejectedRequest(uint256 requestId, address rejector) external view returns (bool) {
        return _requestRejections[requestId][originOf(rejector)];
    }

    // ---- ERC721 / soulbound plumbing ----

    /// @dev Only mint (from == 0) and burn (to == 0). A move is a burn + a mint.
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256) {
        if (index != 0) revert OnlyOneTokenPerOwner();
        if (balanceOf(owner) == 0) revert NoToken(owner);
        return _tokenIdByOwner[owner];
    }
}
