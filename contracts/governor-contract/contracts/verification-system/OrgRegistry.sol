// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ThresholdBands.sol";

interface IAttesterSet {
    function hasAttesterNFT(address account) external view returns (bool);
    function attesterCount() external view returns (uint256);
}

interface ISafeOwners {
    function isOwner(address owner) external view returns (bool);
}

/**
 * @title OrgRegistry (NSP-14 — Org Identity)
 * @notice Organisations as onchain actors. An org IS a Safe (or any contract
 *         account); the registry mints that Safe a soulbound OrgNFT once the
 *         community's attesters approve it, exactly like a Citizen is attested.
 *
 *         The Safe then governs its own record, with no admin in between:
 *           - which Nostr keys may publish as the org (a SET, so every admin
 *             device can hold its own key and be revoked alone — never a shared
 *             secret that a departing member keeps forever),
 *           - member/admin roles (owners are the Safe's own owners),
 *           - an optional metadata URI,
 *           - rotation to a new Safe.
 *
 *         Everything is emitted as events, so any indexer can rebuild the full
 *         org directory from the chain alone.
 *
 *         Canonical id: orgId = keccak256("netizen:org:v1:" + lowercase uuid),
 *         tokenId = uint256(orgId). The uuid is the org's existing database id
 *         (migration) or a fresh random uuid (new orgs) — the chain never needs
 *         the database, but existing records keep a stable, derivable id.
 *
 *         `owner()` (the community's Attester Safe during bootstrap) may only
 *         tune thresholds and run the one-time migration; it cannot touch an
 *         org's keys, roles or metadata.
 */
contract OrgRegistry is ERC721, Ownable {
    using ThresholdBands for ThresholdBands.Band;

    enum Role { None, Member, Admin }
    enum RequestType { Registration, Revocation }
    enum RequestStatus { Pending, Rejected, Executed }

    struct Org {
        address safe;          // address(0) == not registered (or revoked)
        uint64 generation;     // bumps on revocation, so stale keys/roles never resurface
        uint64 registeredAt;
        string metadataURI;
    }

    struct Request {
        RequestType requestType;
        RequestStatus status;
        bytes32 orgId;
        address safe;
        address requester;
        string uri;            // metadata URI (registration) or evidence URI (revocation)
        uint32 approvals;
        uint32 rejections;
        uint32 requiredApprovals;  // snapshot at creation
        uint32 requiredRejections; // snapshot at creation
        uint64 createdAt;
    }

    IAttesterSet public immutable attesters;

    ThresholdBands.Band public approvalBand;
    ThresholdBands.Band public rejectionBand;
    ThresholdBands.Band public revocationBand;

    mapping(bytes32 => Org) private _orgs;
    mapping(address => bytes32) public orgIdOfSafe;
    /// @notice Open request per orgId (0 = none). Stored as requestId + 1.
    mapping(bytes32 => uint256) private _openRequest;

    mapping(bytes32 => mapping(uint64 => mapping(bytes32 => bool))) private _nostrKeys;
    mapping(bytes32 => mapping(uint64 => mapping(address => Role))) private _roles;

    Request[] private _requests;
    mapping(uint256 => mapping(address => bool)) private _voted;

    uint256 public orgCount;
    bool public migrationFinalized;
    bool private _rotating;

    event RegistrationRequested(uint256 indexed requestId, bytes32 indexed orgId, address indexed safe, string metadataURI);
    event RevocationRequested(uint256 indexed requestId, bytes32 indexed orgId, address indexed requester, string evidenceURI);
    event RequestApproved(uint256 indexed requestId, address indexed attester);
    event RequestRejected(uint256 indexed requestId, address indexed attester);
    event RequestWithdrawn(uint256 indexed requestId);
    event OrgRegistered(bytes32 indexed orgId, address indexed safe, uint256 indexed requestId);
    event OrgRevoked(bytes32 indexed orgId, address indexed safe, uint256 indexed requestId);
    event SafeRotated(bytes32 indexed orgId, address indexed previous, address indexed next);
    event MetadataURIChanged(bytes32 indexed orgId, string metadataURI);
    event NostrKeySet(bytes32 indexed orgId, bytes32 indexed pubkey, bool authorized);
    event RoleSet(bytes32 indexed orgId, address indexed account, Role role);
    event BandsChanged();
    event MigrationFinalized();

    error NotAttester(address caller);
    error NotOrgSafe(bytes32 orgId, address caller);
    error NotContract(address account);
    error OrgExists(bytes32 orgId);
    error UnknownOrg(bytes32 orgId);
    error SafeInUse(address safe);
    error RequestOpen(bytes32 orgId, uint256 requestId);
    error NotPending(uint256 requestId);
    error AlreadyVoted(uint256 requestId, address attester);
    error MigrationClosed();
    error Soulbound();
    error ZeroPubkey();
    error SelfApproval(uint256 requestId, address attester);

    constructor(
        address initialOwner,
        IAttesterSet attesterSet,
        ThresholdBands.Band memory _approvalBand,
        ThresholdBands.Band memory _rejectionBand,
        ThresholdBands.Band memory _revocationBand
    ) ERC721("Netizen Organisation", "ORG") Ownable(initialOwner) {
        attesters = attesterSet;
        _setBands(_approvalBand, _rejectionBand, _revocationBand);
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyAttester() {
        if (!attesters.hasAttesterNFT(msg.sender)) revert NotAttester(msg.sender);
        _;
    }

    modifier onlyOrgSafe(bytes32 orgId) {
        address safe = _orgs[orgId].safe;
        if (safe == address(0)) revert UnknownOrg(orgId);
        if (safe != msg.sender) revert NotOrgSafe(orgId, msg.sender);
        _;
    }

    // ---------------------------------------------------------------------
    // Registration — the Safe asks, attesters decide
    // ---------------------------------------------------------------------

    /// @notice Called BY the org's Safe (msg.sender is the Safe), which proves
    ///         the Safe consents. Attesters then approve or reject.
    function requestRegistration(bytes32 orgId, string calldata metadataURI) external returns (uint256) {
        if (msg.sender.code.length == 0) revert NotContract(msg.sender);
        if (_orgs[orgId].safe != address(0)) revert OrgExists(orgId);
        if (orgIdOfSafe[msg.sender] != bytes32(0)) revert SafeInUse(msg.sender);
        uint256 id = _newRequest(RequestType.Registration, orgId, msg.sender, metadataURI, approvalBand);
        emit RegistrationRequested(id, orgId, msg.sender, metadataURI);
        return id;
    }

    /// @notice Any attester may open a revocation of a registered org.
    function requestRevocation(bytes32 orgId, string calldata evidenceURI) external onlyAttester returns (uint256) {
        address safe = _orgs[orgId].safe;
        if (safe == address(0)) revert UnknownOrg(orgId);
        uint256 id = _newRequest(RequestType.Revocation, orgId, safe, evidenceURI, revocationBand);
        emit RevocationRequested(id, orgId, msg.sender, evidenceURI);
        return id;
    }

    /// @notice The requesting Safe may withdraw its own pending registration.
    function withdrawRequest(uint256 requestId) external {
        Request storage r = _pending(requestId);
        if (r.requestType != RequestType.Registration || r.safe != msg.sender) {
            revert NotOrgSafe(r.orgId, msg.sender);
        }
        r.status = RequestStatus.Rejected;
        delete _openRequest[r.orgId];
        emit RequestWithdrawn(requestId);
    }

    function approveRequest(uint256 requestId) external onlyAttester {
        Request storage r = _vote(requestId);
        if (r.requestType == RequestType.Registration && _isSafeOwner(r.safe, msg.sender)) {
            revert SelfApproval(requestId, msg.sender);
        }
        r.approvals++;
        emit RequestApproved(requestId, msg.sender);
        if (r.approvals >= r.requiredApprovals) _execute(requestId, r);
    }

    function rejectRequest(uint256 requestId) external onlyAttester {
        Request storage r = _vote(requestId);
        r.rejections++;
        emit RequestRejected(requestId, msg.sender);
        if (r.rejections >= r.requiredRejections) {
            r.status = RequestStatus.Rejected;
            delete _openRequest[r.orgId];
        }
    }

    // ---------------------------------------------------------------------
    // Self-sovereign record — only the org's own Safe may write
    // ---------------------------------------------------------------------

    function setNostrKey(bytes32 orgId, bytes32 pubkey, bool authorized) external onlyOrgSafe(orgId) {
        if (pubkey == bytes32(0)) revert ZeroPubkey();
        _nostrKeys[orgId][_orgs[orgId].generation][pubkey] = authorized;
        emit NostrKeySet(orgId, pubkey, authorized);
    }

    function setRole(bytes32 orgId, address account, Role role) external onlyOrgSafe(orgId) {
        _roles[orgId][_orgs[orgId].generation][account] = role;
        emit RoleSet(orgId, account, role);
    }

    function setMetadataURI(bytes32 orgId, string calldata metadataURI) external onlyOrgSafe(orgId) {
        _orgs[orgId].metadataURI = metadataURI;
        emit MetadataURIChanged(orgId, metadataURI);
    }

    /// @notice Move the org (and its NFT) to a new Safe — the only way the
    ///         soulbound token ever changes hands. Keys and roles carry over.
    function rotateSafe(bytes32 orgId, address next) external onlyOrgSafe(orgId) {
        if (next.code.length == 0) revert NotContract(next);
        if (orgIdOfSafe[next] != bytes32(0)) revert SafeInUse(next);
        address previous = msg.sender;
        _orgs[orgId].safe = next;
        delete orgIdOfSafe[previous];
        orgIdOfSafe[next] = orgId;
        _rotating = true;
        _transfer(previous, next, uint256(orgId));
        _rotating = false;
        emit SafeRotated(orgId, previous, next);
    }

    // ---------------------------------------------------------------------
    // Bootstrap — owner only, before finalizeMigration()
    // ---------------------------------------------------------------------

    /// @notice One-time import of orgs that already exist offchain. Each entry
    ///         still lands as a normal, Safe-governed record.
    function migrationRegister(
        bytes32[] calldata orgIds,
        address[] calldata safes,
        string[] calldata metadataURIs,
        bytes32[] calldata nostrPubkeys
    ) external onlyOwner {
        if (migrationFinalized) revert MigrationClosed();
        require(
            orgIds.length == safes.length && safes.length == metadataURIs.length && safes.length == nostrPubkeys.length,
            "length mismatch"
        );
        for (uint256 i = 0; i < orgIds.length; i++) {
            if (safes[i].code.length == 0) revert NotContract(safes[i]);
            if (_orgs[orgIds[i]].safe != address(0)) revert OrgExists(orgIds[i]);
            if (orgIdOfSafe[safes[i]] != bytes32(0)) revert SafeInUse(safes[i]);
            _register(orgIds[i], safes[i], metadataURIs[i], 0);
            if (nostrPubkeys[i] != bytes32(0)) {
                _nostrKeys[orgIds[i]][_orgs[orgIds[i]].generation][nostrPubkeys[i]] = true;
                emit NostrKeySet(orgIds[i], nostrPubkeys[i], true);
            }
        }
    }

    function finalizeMigration() external onlyOwner {
        migrationFinalized = true;
        emit MigrationFinalized();
    }

    function setBands(
        ThresholdBands.Band calldata _approvalBand,
        ThresholdBands.Band calldata _rejectionBand,
        ThresholdBands.Band calldata _revocationBand
    ) external onlyOwner {
        _setBands(_approvalBand, _rejectionBand, _revocationBand);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getOrg(bytes32 orgId) external view returns (Org memory) {
        Org memory o = _orgs[orgId];
        if (o.safe == address(0)) revert UnknownOrg(orgId);
        return o;
    }

    function isRegistered(bytes32 orgId) external view returns (bool) {
        return _orgs[orgId].safe != address(0);
    }

    /// @notice True iff `pubkey` (x-only secp256k1, as in Nostr) may publish as the org now.
    function isNostrKeyAuthorized(bytes32 orgId, bytes32 pubkey) external view returns (bool) {
        Org storage o = _orgs[orgId];
        return o.safe != address(0) && _nostrKeys[orgId][o.generation][pubkey];
    }

    function roleOf(bytes32 orgId, address account) external view returns (Role) {
        Org storage o = _orgs[orgId];
        if (o.safe == address(0)) return Role.None;
        return _roles[orgId][o.generation][account];
    }

    /// @notice Owners are the Safe's own owners — read live, never duplicated here.
    function isOrgOwner(bytes32 orgId, address account) external view returns (bool) {
        address safe = _orgs[orgId].safe;
        if (safe == address(0)) return false;
        return _isSafeOwner(safe, account);
    }

    function openRequestOf(bytes32 orgId) external view returns (bool open, uint256 requestId) {
        uint256 stored = _openRequest[orgId];
        return (stored != 0, stored == 0 ? 0 : stored - 1);
    }

    function getRequest(uint256 requestId) external view returns (Request memory) {
        return _requests[requestId];
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    function hasVoted(uint256 requestId, address attester) external view returns (bool) {
        return _voted[requestId][attester];
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _setBands(
        ThresholdBands.Band memory a,
        ThresholdBands.Band memory rj,
        ThresholdBands.Band memory rv
    ) internal {
        a.validate();
        rj.validate();
        rv.validate();
        approvalBand = a;
        rejectionBand = rj;
        revocationBand = rv;
        emit BandsChanged();
    }

    function _newRequest(
        RequestType t,
        bytes32 orgId,
        address safe,
        string calldata uri,
        ThresholdBands.Band memory band
    ) internal returns (uint256 id) {
        uint256 open = _openRequest[orgId];
        if (open != 0) revert RequestOpen(orgId, open - 1);
        uint256 size = attesters.attesterCount();
        id = _requests.length;
        _requests.push(
            Request({
                requestType: t,
                status: RequestStatus.Pending,
                orgId: orgId,
                safe: safe,
                requester: msg.sender,
                uri: uri,
                approvals: 0,
                rejections: 0,
                requiredApprovals: uint32(band.required(size)),
                requiredRejections: uint32(rejectionBand.required(size)),
                createdAt: uint64(block.timestamp)
            })
        );
        _openRequest[orgId] = id + 1;
    }

    function _pending(uint256 requestId) internal view returns (Request storage r) {
        r = _requests[requestId];
        if (r.status != RequestStatus.Pending) revert NotPending(requestId);
    }

    function _vote(uint256 requestId) internal returns (Request storage r) {
        r = _pending(requestId);
        if (_voted[requestId][msg.sender]) revert AlreadyVoted(requestId, msg.sender);
        _voted[requestId][msg.sender] = true;
    }

    function _execute(uint256 requestId, Request storage r) internal {
        r.status = RequestStatus.Executed;
        delete _openRequest[r.orgId];
        if (r.requestType == RequestType.Registration) {
            // The Safe or the id may have been claimed (migration) while this was
            // pending. Close the request instead of reverting, or the final
            // approval could never land and the id would stay blocked forever.
            if (orgIdOfSafe[r.safe] != bytes32(0) || _orgs[r.orgId].safe != address(0)) {
                r.status = RequestStatus.Rejected;
                emit RequestRejected(requestId, address(0));
                return;
            }
            _register(r.orgId, r.safe, r.uri, requestId);
        } else {
            Org storage o = _orgs[r.orgId];
            address safe = o.safe;
            _burn(uint256(r.orgId));
            delete orgIdOfSafe[safe];
            o.safe = address(0);
            o.generation++;
            o.metadataURI = "";
            orgCount--;
            emit OrgRevoked(r.orgId, safe, requestId);
        }
    }

    function _register(bytes32 orgId, address safe, string memory metadataURI, uint256 requestId) internal {
        Org storage o = _orgs[orgId];
        o.safe = safe;
        o.registeredAt = uint64(block.timestamp);
        o.metadataURI = metadataURI;
        orgIdOfSafe[safe] = orgId;
        orgCount++;
        _mint(safe, uint256(orgId));
        emit OrgRegistered(orgId, safe, requestId);
    }

    function _isSafeOwner(address safe, address account) internal view returns (bool) {
        try ISafeOwners(safe).isOwner(account) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @dev Soulbound: mint, burn, and rotateSafe only.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && !_rotating) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
