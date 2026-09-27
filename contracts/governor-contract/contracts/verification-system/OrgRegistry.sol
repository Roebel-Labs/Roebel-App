// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ThresholdBands.sol";

interface IAttesterSet {
    function hasAttesterNFT(address account) external view returns (bool);
    function attesterCount() external view returns (uint256);
}

/**
 * @title OrgRegistry (NSP-14 — Org Identity)
 * @notice Organisations as onchain actors. An org IS a Safe (or another contract
 *         account); the registry mints that Safe a soulbound OrgNFT once the
 *         community's attesters approve it, exactly like a Citizen is attested.
 *
 *         The Safe then governs its own record, with no admin in between:
 *           - which Nostr keys may publish as the org (a SET, so every admin
 *             device holds its own key and can be revoked alone — never a shared
 *             secret a departing member keeps forever),
 *           - member/admin roles (owners are the Safe's own owners),
 *           - an optional metadata URI,
 *           - rotation to a new Safe (two-step: the new Safe must accept).
 *
 *         Every state change is emitted, so a log-only indexer reproduces every
 *         view, including request status and thresholds.
 *
 *         Canonical id: orgId = keccak256("netizen:org:v1:" + lowercase uuid),
 *         tokenId = uint256(orgId). Ids are PUBLIC (they derive from database
 *         uuids), so a registration request does not reserve an id: any number
 *         of Safes may claim the same id, attesters approve the right one, and
 *         the first to execute wins while the others close. A squatter can
 *         therefore waste attention, never block an org.
 *
 *         Requests expire after REQUEST_TTL; anyone may close an expired one,
 *         so no request can ever wedge an org (e.g. after the attester set shrinks).
 *
 *         `owner()` (the community's Attester Safe during bootstrap) may only
 *         tune thresholds and run the one-time migration; it cannot touch an
 *         org's keys, roles or metadata. Run finalizeMigration() in the same
 *         Safe batch as the last migrationRegister(). Band floors are capped at 50,
 *         but the owner can still LOWER a band (e.g. 1-of-N approval): hand
 *         ownership to the community Timelock once bootstrap is over.
 */
contract OrgRegistry is ERC721, Ownable {
    using ThresholdBands for ThresholdBands.Band;

    enum Role { None, Member, Admin }
    enum RequestType { Registration, Revocation }
    enum RequestStatus { Pending, Rejected, Executed }
    enum CloseReason { Approved, Rejected, Withdrawn, Expired, Superseded }

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
        uint64 expiresAt;
        uint64 claimGeneration;    // the id's generation when the claim was made
    }

    uint256 public constant REQUEST_TTL = 30 days;
    uint256 public constant REJECTION_COOLDOWN = 7 days;
    uint256 public constant MAX_URI_BYTES = 512;
    uint16 public constant MAX_BAND_FLOOR = 50;
    /// @notice requestId recorded for orgs imported by migrationRegister.
    uint256 public constant MIGRATION_REQUEST_ID = type(uint256).max;
    uint256 private constant SAFE_CALL_GAS = 30_000;

    IAttesterSet public immutable attesters;

    ThresholdBands.Band public approvalBand;
    ThresholdBands.Band public rejectionBand;
    ThresholdBands.Band public revocationBand;

    mapping(bytes32 => Org) private _orgs;
    mapping(address => bytes32) public orgIdOfSafe;
    /// @notice pending rotation target per org (address(0) = none).
    mapping(bytes32 => address) public pendingSafe;

    /// @dev Open-request slots store requestId + 1 (0 = none).
    mapping(address => uint256) private _openRegistrationOfSafe;
    mapping(bytes32 => uint256) private _openRevocationOfOrg;
    mapping(address => uint256) public cooldownUntil;

    mapping(bytes32 => mapping(uint64 => mapping(bytes32 => bool))) private _nostrKeys;
    mapping(bytes32 => mapping(uint64 => mapping(address => Role))) private _roles;

    Request[] private _requests;
    mapping(uint256 => mapping(address => bool)) private _voted;

    uint256 public orgCount;
    bool public migrationFinalized;
    bool private _rotating;

    event RegistrationRequested(
        uint256 indexed requestId, bytes32 indexed orgId, address indexed safe,
        string metadataURI, uint32 requiredApprovals, uint32 requiredRejections, uint64 expiresAt
    );
    event RevocationRequested(
        uint256 indexed requestId, bytes32 indexed orgId, address indexed requester,
        string evidenceURI, uint32 requiredApprovals, uint32 requiredRejections, uint64 expiresAt
    );
    event RequestApproved(uint256 indexed requestId, address indexed attester);
    event RequestRejected(uint256 indexed requestId, address indexed attester);
    /// @notice Every terminal transition, exactly once per request.
    event RequestClosed(uint256 indexed requestId, RequestStatus status, CloseReason reason);
    event OrgRegistered(bytes32 indexed orgId, address indexed safe, uint256 indexed requestId, uint64 generation);
    event OrgRevoked(bytes32 indexed orgId, address indexed safe, uint256 indexed requestId, uint64 generation);
    event RotationProposed(bytes32 indexed orgId, address indexed current, address indexed next);
    event SafeRotated(bytes32 indexed orgId, address indexed previous, address indexed next);
    event MetadataURIChanged(bytes32 indexed orgId, string metadataURI);
    event NostrKeySet(bytes32 indexed orgId, bytes32 indexed pubkey, bool authorized);
    event RoleSet(bytes32 indexed orgId, address indexed account, Role role);
    event BandsChanged(ThresholdBands.Band approval, ThresholdBands.Band rejection, ThresholdBands.Band revocation);
    event MigrationFinalized();
    /// @notice ERC-5192: the token is locked (soulbound) from mint.
    event Locked(uint256 tokenId);

    error NotAttester(address caller);
    error NotOrgSafe(bytes32 orgId, address caller);
    error NotContract(address account);
    error OrgExists(bytes32 orgId);
    error UnknownOrg(bytes32 orgId);
    error SafeInUse(address safe);
    error RequestOpen(uint256 requestId);
    error NotPending(uint256 requestId);
    error NotExpired(uint256 requestId);
    error NotStale(uint256 requestId);
    error Expired(uint256 requestId);
    error AlreadyVoted(uint256 requestId, address attester);
    error SelfVote(uint256 requestId, address attester);
    error CoolingDown(address safe, uint256 until);
    error NoPendingRotation(bytes32 orgId);
    error MigrationClosed();
    error Soulbound();
    error ZeroPubkey();
    error UriTooLong();
    error BandTooHigh();

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
    // Requests — the Safe asks (or an attester, for revocation), attesters decide
    // ---------------------------------------------------------------------

    /// @notice Called BY the org's Safe (msg.sender is the Safe), which proves the
    ///         Safe consents. Does not reserve the id — see the contract notice.
    function requestRegistration(bytes32 orgId, string calldata metadataURI) external returns (uint256 id) {
        _requireContractAccount(msg.sender);
        _requireUri(metadataURI);
        if (_orgs[orgId].safe != address(0)) revert OrgExists(orgId);
        if (orgIdOfSafe[msg.sender] != bytes32(0)) revert SafeInUse(msg.sender);
        if (block.timestamp < cooldownUntil[msg.sender]) revert CoolingDown(msg.sender, cooldownUntil[msg.sender]);
        _closeIfExpired(_openRegistrationOfSafe[msg.sender]);
        uint256 open = _openRegistrationOfSafe[msg.sender];
        if (open != 0) revert RequestOpen(open - 1);

        id = _newRequest(RequestType.Registration, orgId, msg.sender, metadataURI, approvalBand);
        _openRegistrationOfSafe[msg.sender] = id + 1;
        Request storage r = _requests[id];
        emit RegistrationRequested(
            id, orgId, msg.sender, metadataURI, r.requiredApprovals, r.requiredRejections, r.expiresAt
        );
    }

    /// @notice Any attester may open a revocation of a registered org.
    function requestRevocation(bytes32 orgId, string calldata evidenceURI) external onlyAttester returns (uint256 id) {
        _requireUri(evidenceURI);
        address safe = _orgs[orgId].safe;
        if (safe == address(0)) revert UnknownOrg(orgId);
        _closeIfExpired(_openRevocationOfOrg[orgId]);
        uint256 open = _openRevocationOfOrg[orgId];
        if (open != 0) revert RequestOpen(open - 1);

        id = _newRequest(RequestType.Revocation, orgId, safe, evidenceURI, revocationBand);
        _openRevocationOfOrg[orgId] = id + 1;
        Request storage r = _requests[id];
        emit RevocationRequested(
            id, orgId, msg.sender, evidenceURI, r.requiredApprovals, r.requiredRejections, r.expiresAt
        );
    }

    /// @notice The requesting Safe may withdraw its own pending registration.
    function withdrawRequest(uint256 requestId) external {
        Request storage r = _pending(requestId);
        if (r.requestType != RequestType.Registration || r.safe != msg.sender) {
            revert NotOrgSafe(r.orgId, msg.sender);
        }
        _close(requestId, r, RequestStatus.Rejected, CloseReason.Withdrawn);
    }

    /// @notice Anyone may close a request past its expiry, so none can wedge an org.
    function expireRequest(uint256 requestId) external {
        Request storage r = _pending(requestId);
        if (block.timestamp <= r.expiresAt) revert NotExpired(requestId);
        _close(requestId, r, RequestStatus.Rejected, CloseReason.Expired);
    }

    /// @notice Anyone may close a registration claim that can no longer win: its
    ///         id is taken, or was registered and revoked since the claim was made.
    function closeStale(uint256 requestId) external {
        Request storage r = _pending(requestId);
        if (r.requestType != RequestType.Registration || !_isStaleClaim(r)) revert NotStale(requestId);
        _close(requestId, r, RequestStatus.Rejected, CloseReason.Superseded);
    }

    function approveRequest(uint256 requestId) external onlyAttester {
        Request storage r = _vote(requestId, true);
        r.approvals++;
        emit RequestApproved(requestId, msg.sender);
        if (r.approvals >= r.requiredApprovals) _execute(requestId, r);
    }

    function rejectRequest(uint256 requestId) external onlyAttester {
        Request storage r = _vote(requestId, false);
        r.rejections++;
        emit RequestRejected(requestId, msg.sender);
        if (r.rejections >= r.requiredRejections) {
            if (r.requestType == RequestType.Registration) {
                cooldownUntil[r.safe] = block.timestamp + REJECTION_COOLDOWN;
            }
            _close(requestId, r, RequestStatus.Rejected, CloseReason.Rejected);
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
        _requireUri(metadataURI);
        _orgs[orgId].metadataURI = metadataURI;
        emit MetadataURIChanged(orgId, metadataURI);
    }

    /// @notice Step 1 of a rotation: the current Safe names its successor.
    ///         address(0) cancels a pending proposal.
    function proposeRotation(bytes32 orgId, address next) external onlyOrgSafe(orgId) {
        if (next != address(0)) _requireContractAccount(next);
        pendingSafe[orgId] = next;
        emit RotationProposed(orgId, msg.sender, next);
    }

    /// @notice Step 2: the successor Safe accepts. This is the only way the
    ///         soulbound token ever changes hands. Keys and roles carry over.
    function acceptRotation(bytes32 orgId) external {
        address next = pendingSafe[orgId];
        if (next == address(0) || next != msg.sender) revert NoPendingRotation(orgId);
        if (orgIdOfSafe[next] != bytes32(0)) revert SafeInUse(next);
        // The successor's own pending registration (if any) is superseded.
        uint256 open = _openRegistrationOfSafe[next];
        if (open != 0) _close(open - 1, _requests[open - 1], RequestStatus.Rejected, CloseReason.Superseded);

        address previous = _orgs[orgId].safe;
        delete pendingSafe[orgId];
        _orgs[orgId].safe = next;
        delete orgIdOfSafe[previous];
        orgIdOfSafe[next] = orgId;
        uint256 rev = _openRevocationOfOrg[orgId];
        if (rev != 0) _requests[rev - 1].safe = next;

        _rotating = true;
        _transfer(previous, next, uint256(orgId));
        _rotating = false;
        emit SafeRotated(orgId, previous, next);
    }

    // ---------------------------------------------------------------------
    // Bootstrap — owner only, before finalizeMigration()
    // ---------------------------------------------------------------------

    /// @notice One-time import of orgs that already exist offchain. Each entry
    ///         lands as a normal, Safe-governed record.
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
            _requireContractAccount(safes[i]);
            _requireUri(metadataURIs[i]);
            if (_orgs[orgIds[i]].safe != address(0)) revert OrgExists(orgIds[i]);
            if (orgIdOfSafe[safes[i]] != bytes32(0)) revert SafeInUse(safes[i]);
            uint256 open = _openRegistrationOfSafe[safes[i]];
            if (open != 0) _close(open - 1, _requests[open - 1], RequestStatus.Rejected, CloseReason.Superseded);
            _register(orgIds[i], safes[i], metadataURIs[i], MIGRATION_REQUEST_ID);
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
    ///         Only meaningful for that org's own record: a hostile contract org
    ///         can answer true for everyone, so never use this as a wider authority.
    function isOrgOwner(bytes32 orgId, address account) external view returns (bool) {
        address safe = _orgs[orgId].safe;
        if (safe == address(0)) return false;
        return _isSafeOwner(safe, account);
    }

    function openRegistrationOf(address safe) external view returns (bool open, uint256 requestId) {
        uint256 s = _openRegistrationOfSafe[safe];
        return (s != 0, s == 0 ? 0 : s - 1);
    }

    function openRevocationOf(bytes32 orgId) external view returns (bool open, uint256 requestId) {
        uint256 s = _openRevocationOfOrg[orgId];
        return (s != 0, s == 0 ? 0 : s - 1);
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

    /// @notice The org's metadata URI (empty when it keeps its profile on Nostr only).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _orgs[bytes32(tokenId)].metadataURI;
    }

    /// @notice ERC-5192: every OrgNFT is locked.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId); // ERC-5192
    }

    // ---------------------------------------------------------------------
    // Soulbound: no approvals, no transfers (except acceptRotation)
    // ---------------------------------------------------------------------

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && !_rotating) revert Soulbound();
        return super._update(to, tokenId, auth);
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
        // A floor above any realistic attester set would silently freeze a gate.
        if (a.floor > MAX_BAND_FLOOR || rj.floor > MAX_BAND_FLOOR || rv.floor > MAX_BAND_FLOOR) revert BandTooHigh();
        approvalBand = a;
        rejectionBand = rj;
        revocationBand = rv;
        emit BandsChanged(a, rj, rv);
    }

    function _newRequest(
        RequestType t,
        bytes32 orgId,
        address safe,
        string calldata uri,
        ThresholdBands.Band memory band
    ) internal returns (uint256 id) {
        uint256 size = attesters.attesterCount();
        // Never demand more votes than there are attesters, or the request is dead on arrival.
        uint256 cap = size == 0 ? 1 : size;
        uint256 approvalsNeeded = band.required(size);
        uint256 rejectionsNeeded = rejectionBand.required(size);
        if (approvalsNeeded > cap) approvalsNeeded = cap;
        if (rejectionsNeeded > cap) rejectionsNeeded = cap;

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
                requiredApprovals: uint32(approvalsNeeded),
                requiredRejections: uint32(rejectionsNeeded),
                createdAt: uint64(block.timestamp),
                expiresAt: uint64(block.timestamp + REQUEST_TTL),
                claimGeneration: _orgs[orgId].generation
            })
        );
    }

    function _pending(uint256 requestId) internal view returns (Request storage r) {
        r = _requests[requestId];
        if (r.status != RequestStatus.Pending) revert NotPending(requestId);
    }

    function _vote(uint256 requestId, bool approving) internal returns (Request storage r) {
        r = _pending(requestId);
        if (block.timestamp > r.expiresAt) revert Expired(requestId);
        if (_voted[requestId][msg.sender]) revert AlreadyVoted(requestId, msg.sender);
        // A Safe co-owner may not cast a vote that FAVOURS their org (admit it, or
        // shield it from revocation). Votes against it stay open: otherwise an org
        // could add every attester as an owner and become unrevocable.
        // Best-effort for favourable votes: a hostile contract can lie about owners.
        bool favoursOrg = (r.requestType == RequestType.Registration) == approving;
        if (favoursOrg) {
            address subject = r.requestType == RequestType.Registration ? r.safe : _orgs[r.orgId].safe;
            if (_isSafeOwner(subject, msg.sender)) revert SelfVote(requestId, msg.sender);
        }
        _voted[requestId][msg.sender] = true;
    }

    /// @dev A claim loses if its Safe already holds an org, the id is taken, or the
    ///      id changed generation (registered and revoked) since the claim was made.
    function _isStaleClaim(Request storage r) internal view returns (bool) {
        Org storage o = _orgs[r.orgId];
        return orgIdOfSafe[r.safe] != bytes32(0) || o.safe != address(0) || o.generation != r.claimGeneration;
    }

    /// @dev Slot value is requestId + 1 (0 = none).
    function _closeIfExpired(uint256 slot) internal {
        if (slot == 0) return;
        Request storage r = _requests[slot - 1];
        if (r.status == RequestStatus.Pending && block.timestamp > r.expiresAt) {
            _close(slot - 1, r, RequestStatus.Rejected, CloseReason.Expired);
        }
    }

    function _close(uint256 requestId, Request storage r, RequestStatus status, CloseReason reason) internal {
        r.status = status;
        if (r.requestType == RequestType.Registration) {
            if (_openRegistrationOfSafe[r.safe] == requestId + 1) delete _openRegistrationOfSafe[r.safe];
        } else {
            if (_openRevocationOfOrg[r.orgId] == requestId + 1) delete _openRevocationOfOrg[r.orgId];
        }
        emit RequestClosed(requestId, status, reason);
    }

    function _execute(uint256 requestId, Request storage r) internal {
        if (r.requestType == RequestType.Registration) {
            if (_isStaleClaim(r)) {
                _close(requestId, r, RequestStatus.Rejected, CloseReason.Superseded);
                return;
            }
            _close(requestId, r, RequestStatus.Executed, CloseReason.Approved);
            _register(r.orgId, r.safe, r.uri, requestId);
        } else {
            _close(requestId, r, RequestStatus.Executed, CloseReason.Approved);
            Org storage o = _orgs[r.orgId];
            address safe = o.safe;
            uint64 generation = o.generation;
            _burn(uint256(r.orgId));
            delete orgIdOfSafe[safe];
            delete pendingSafe[r.orgId];
            o.safe = address(0);
            o.generation = generation + 1;
            o.metadataURI = "";
            orgCount--;
            emit OrgRevoked(r.orgId, safe, requestId, generation);
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
        emit Locked(uint256(orgId));
        emit OrgRegistered(orgId, safe, requestId, o.generation);
        // Emitted so a log-only indexer reproduces the record without a view call.
        if (bytes(metadataURI).length != 0) emit MetadataURIChanged(orgId, metadataURI);
    }

    function _requireUri(string memory uri) internal pure {
        if (bytes(uri).length > MAX_URI_BYTES) revert UriTooLong();
    }

    /// @dev A deployed contract, and not an EIP-7702-delegated EOA (code 0xef0100‖addr),
    ///      which would put an org behind one private key.
    function _requireContractAccount(address account) internal view {
        uint256 size = account.code.length;
        if (size == 0) revert NotContract(account);
        if (size == 23) {
            bool delegated;
            assembly {
                let ptr := mload(0x40)
                extcodecopy(account, ptr, 0, 3)
                delegated := eq(shr(232, mload(ptr)), 0xef0100)
            }
            if (delegated) revert NotContract(account);
        }
    }

    /// @dev Bounded-gas staticcall; anything but a clean 32-byte `true` is "not an owner".
    function _isSafeOwner(address safe, address account) internal view returns (bool) {
        if (safe == address(0)) return false;
        (bool ok, bytes memory ret) =
            safe.staticcall{gas: SAFE_CALL_GAS}(abi.encodeWithSignature("isOwner(address)", account));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }
}
