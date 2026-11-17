// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface ICredCitizenSource {
    function hasCitizenNFT(address account) external view returns (bool);
}

interface ICredAttesterSource {
    function hasAttesterNFT(address account) external view returns (bool);
}

/// @dev The slice of OrgRegistry (NSP-14) this register reads.
interface ICredOrgSource {
    struct Org {
        address safe;
        uint64 generation;
        uint64 registeredAt;
        string metadataURI;
    }

    function isRegistered(bytes32 orgId) external view returns (bool);
    function getOrg(bytes32 orgId) external view returns (Org memory);
    function roleOf(bytes32 orgId, address account) external view returns (uint8);
    function isOrgOwner(bytes32 orgId, address account) external view returns (bool);
}

/**
 * @title CredentialRegistry — the community's credential register
 * @notice A soulbound ERC-1155 register of roles, memberships and badges. Every
 *         credential TYPE belongs to a namespace: an org registered in OrgRegistry
 *         (NSP-14), or the community namespace COMMUNITY = bytes32(0). Token id =
 *         uint256(typeId), typeId = keccak256(abi.encode(orgId, localId)).
 *
 *         Who may do what:
 *           - An org's authority — its Safe, an owner of that Safe
 *             (OrgRegistry.isOrgOwner) or an account with Role.Admin — creates,
 *             edits and retires the org's types and appoints per-type delegates.
 *             Authority and delegates may publish batches (Merkle roots of
 *             salted leaves) and revoke them, or single leaves. By design a single
 *             Safe owner acts alone, without the Safe's threshold: an owner gets
 *             nothing an Admin lacks (audit P1-01, accepted by the owner).
 *           - Delegates persist across the removal of the admin who appointed them
 *             and across Safe rotation; recovery = the authority revokes each
 *             delegate (DelegateSet events list them) (P1-04, accepted).
 *           - The community namespace is managed by `owner()` alone.
 *           - `owner()` may additionally mark a type as recognised (an official
 *             office), switch an org's private-only flag, and replace the three
 *             source contracts through a delayed two-step. It is not an org's
 *             authority, but it is trusted: through a replacement OrgRegistry it
 *             controls, after SOURCES_DELAY and an explicit, evented rebindType
 *             per type, it could gain authority over an org's types (P1-03).
 *             Every step of that is visible on chain.
 *           - Editing a recognised type drops the recognition (P1-05).
 *           - Private-only ("members may not be publicly visible"): the org's
 *             authority turns it on and off, an attester can only turn it on
 *             (protection), the owner can do both. Never for COMMUNITY.
 *
 *         Privacy: a batch publishes only a Merkle root and a count. Each leaf is
 *         salted with 32 random bytes, so a leaf cannot be guessed from a known
 *         account; who is in a batch stays private until a holder claims publicly
 *         (or never, when the holder only proves membership privately).
 *
 *         Citizen and Attester are reserved `External` types: `holds` asks
 *         CitizenNFT / AttesterNFT directly and nothing is ever minted for them.
 *
 *         Generations and registry binding: an org type is bound to the
 *         OrgRegistry and the generation it was created under (typeRegistryOf,
 *         CredentialType.orgGeneration) and goes dark when the org is revoked,
 *         even if the same id registers again. The three sources (CitizenNFT,
 *         AttesterNFT, OrgRegistry) change together via proposeSources →
 *         SOURCES_DELAY → applySources. After an OrgRegistry swap every org type
 *         is inactive until anyone calls rebindType(typeId): that succeeds only
 *         while the OLD registry still has the org alive at the type's generation
 *         and the new one has the org registered with the SAME Safe, and then
 *         adopts the new registry's generation and drops the recognition seal.
 *         A type that was dead before the swap never revives (P1-02), and a
 *         different entity under the same id never inherits it (P2-01). While a
 *         type awaits rebinding (its org still alive in the registry it is bound
 *         to), prune refuses to burn its holdings (P2-04).
 *         Runbook: rebind every live org type right after applySources, while the
 *         old registry is frozen (no revocations, no Safe rotations) — the rebind
 *         reads the old registry's LIVE state (P2-03), and a type whose org
 *         rotated its Safe first stays inactive (the org creates new types).
 *
 *         Non-transferable: every transfer and approval reverts; a balance is 0 or 1.
 *         balanceOf is validity-aware, not a raw ERC-1155 balance: expiry, batch
 *         or leaf revocation, retirement, org death and the NFT sources change it
 *         without a TransferSingle event; prune emits the burn (P1-07, accepted).
 *         External types report 1 without any mint. A source that reverts makes
 *         the views answer "not held" / inactive instead of reverting (P1-06).
 *         Every state change is emitted, so a log-only indexer reproduces every view.
 */
contract CredentialRegistry is ERC1155, Ownable2Step, EIP712 {
    enum Kind { Role, Membership, Badge }
    enum ClaimPolicy { IssuerBatch, SelfClaim, External }
    enum LeafKind { Account, ClaimKey }
    enum LeafStatus { Invalid, Valid, Expired, Revoked, Inactive }

    struct TypeConfig {
        string metadataURI;      // <= 512 bytes
        uint64 defaultValidity;  // seconds; 0 = no expiry. Applied by selfClaim; informational for batches
        uint64 claimStart;       // 0 = open
        uint64 claimEnd;         // 0 = open; otherwise > claimStart
        uint32 supplyCap;        // 0 = uncapped; counts current holders
        bool publicClaim;        // false = can never be minted, only proven privately
    }

    struct CredentialType {
        bytes32 orgId;           // bytes32(0) = community namespace
        bytes32 localId;
        uint64 orgGeneration;    // OrgRegistry generation at creation
        uint64 createdAt;
        Kind kind;
        ClaimPolicy policy;
        bool recognised;
        bool retired;
        uint32 supply;           // accounts with a raw balance of 1
        TypeConfig config;
    }

    struct Batch { bytes32 typeId; bytes32 root; address issuer; uint32 count; uint64 createdAt; bool revoked; }
    struct Leaf { LeafKind kind; bytes32 typeId; address subject; uint64 validUntil; bytes32 salt; }
    struct Holding { uint64 batchId; uint64 validUntil; uint64 since; bytes32 leaf; }   // batchId 0 = self-claimed

    uint256 public constant MAX_URI_BYTES = 512;
    uint64 public constant SOURCES_DELAY = 2 days;
    bytes32 public constant COMMUNITY = bytes32(0);
    bytes32 public constant CITIZEN_TYPE = 0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3;
    bytes32 public constant ATTESTER_TYPE = 0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d;
    bytes32 public constant GUEST_TYPE = 0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7;
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(uint64 batchId,bytes32 leaf,address account)");
    uint8 private constant ORG_ROLE_ADMIN = 2;

    address public citizenNFT;
    address public attesterNFT;
    address public orgRegistry;

    address private _pendingCitizenNFT;
    address private _pendingAttesterNFT;
    address private _pendingOrgRegistry;
    uint64 private _pendingEta;   // 0 = nothing pending

    mapping(bytes32 => CredentialType) private _types;
    mapping(bytes32 => bool) private _exists;
    /// @dev The OrgRegistry an org type is currently valid under (unused for COMMUNITY types).
    mapping(bytes32 => address) private _typeRegistry;
    mapping(bytes32 => mapping(address => bool)) private _delegates;
    /// @notice true = the org's Membership types can only be proven privately, never claimed publicly.
    mapping(bytes32 => bool) public orgPrivateOnly;

    Batch[] private _batches; // index 0 unused: batch ids start at 1
    mapping(bytes32 => mapping(address => Holding)) private _holdings;
    mapping(uint64 => mapping(bytes32 => bool)) private _leafRevoked;
    mapping(uint64 => mapping(bytes32 => address)) private _leafBoundTo;

    event TypeCreated(bytes32 indexed typeId, bytes32 indexed orgId, bytes32 localId, Kind kind, ClaimPolicy policy, uint64 orgGeneration);
    event TypeConfigured(bytes32 indexed typeId, TypeConfig config);
    event TypeRetired(bytes32 indexed typeId);
    event TypeRecognised(bytes32 indexed typeId, bool recognised);
    event TypeRebound(bytes32 indexed typeId, address indexed orgRegistry, uint64 orgGeneration);
    event DelegateSet(bytes32 indexed typeId, address indexed delegate, bool allowed);
    event OrgPrivateOnlySet(bytes32 indexed orgId, bool privateOnly, address indexed by);
    event BatchAdded(uint64 indexed batchId, bytes32 indexed typeId, address indexed issuer, bytes32 root, uint32 count);
    event BatchRevoked(uint64 indexed batchId);
    event LeafRevoked(uint64 indexed batchId, bytes32 leaf);
    event Claimed(bytes32 indexed typeId, address indexed account, uint64 indexed batchId, bytes32 leaf, uint64 validUntil);
    event SelfClaimed(bytes32 indexed typeId, address indexed account, uint64 validUntil);
    event Renounced(bytes32 indexed typeId, address indexed account);
    event Pruned(bytes32 indexed typeId, address indexed account);
    event SourcesProposed(address citizenNFT, address attesterNFT, address orgRegistry, uint64 eta);
    event SourcesApplied(address citizenNFT, address attesterNFT, address orgRegistry);
    event SourcesCancelled();

    error NotAuthorised(address caller);
    error UnknownType(bytes32 typeId);
    error TypeExists(bytes32 typeId);
    error TypeInactive(bytes32 typeId);
    error ExternalType(bytes32 typeId);
    error WrongPolicy(bytes32 typeId);
    error BadConfig();
    error UriTooLong();
    error UnknownBatch(uint64 batchId);
    error BatchIsRevoked(uint64 batchId);
    error EmptyBatch();
    error LeafTypeMismatch();
    error InvalidProof();
    error LeafIsRevoked(bytes32 leaf);
    error LeafExpired(bytes32 leaf);
    error NotLeafSubject(address caller);
    error LeafBoundToOther(bytes32 leaf);
    error BadClaimSignature();
    error PublicClaimDisabled(bytes32 typeId);
    error ClaimWindowClosed(bytes32 typeId);
    error SupplyCapReached(bytes32 typeId);
    error AlreadyHeld(bytes32 typeId, address account);
    error NotHeld(bytes32 typeId, address account);
    error StillValid(bytes32 typeId, address account);
    error Soulbound();
    error NotContract(address account);
    error NoPendingSources();
    error SourcesNotReady(uint64 eta);
    error NotRebindable(bytes32 typeId);

    /// @param reservedURIs metadata URIs of Citizen, Attester and Guest, in that order.
    constructor(
        address initialOwner,
        address citizenNFT_,
        address attesterNFT_,
        address orgRegistry_,
        string[3] memory reservedURIs
    ) ERC1155("") Ownable(initialOwner) EIP712("CredentialRegistry", "1") {
        _setSources(citizenNFT_, attesterNFT_, orgRegistry_);
        _batches.push();

        TypeConfig memory c;
        c.publicClaim = true; // External types are public by nature (the NFT is public); nothing is minted
        c.metadataURI = reservedURIs[0];
        _createReserved(CITIZEN_TYPE, "citizen", Kind.Role, ClaimPolicy.External, c);
        c.metadataURI = reservedURIs[1];
        _createReserved(ATTESTER_TYPE, "attester", Kind.Role, ClaimPolicy.External, c);
        c.metadataURI = reservedURIs[2];
        _createReserved(GUEST_TYPE, "guest", Kind.Membership, ClaimPolicy.SelfClaim, c);
    }

    // ---------------------------------------------------------------------
    // Types — org authority
    // ---------------------------------------------------------------------

    function createType(bytes32 orgId, bytes32 localId, Kind kind, ClaimPolicy policy, TypeConfig calldata cfg)
        external
        returns (bytes32 typeId)
    {
        if (!canManage(orgId, msg.sender)) revert NotAuthorised(msg.sender);
        typeId = typeIdOf(orgId, localId);
        if (policy == ClaimPolicy.External) revert WrongPolicy(typeId);
        if (_exists[typeId]) revert TypeExists(typeId);
        _validateConfig(cfg);
        uint64 generation;
        if (orgId != COMMUNITY) {
            address reg = orgRegistry;
            generation = ICredOrgSource(reg).getOrg(orgId).generation;
            _typeRegistry[typeId] = reg;
        }
        _create(typeId, orgId, localId, kind, policy, generation, cfg);
    }

    /// @notice Changes a type's config; kind and policy are fixed at creation.
    ///         The owner may edit the reserved types' metadata through this.
    ///         Editing a recognised type drops the recognition (the owner may seal
    ///         it again). A cap below the current supply is allowed: nothing is
    ///         burned, new mints revert until supply < cap, renewals still work.
    function updateType(bytes32 typeId, TypeConfig calldata cfg) external {
        CredentialType storage t = _requireType(typeId);
        _requireActiveAndManager(typeId, t);
        _validateConfig(cfg);
        bool uriChanged = keccak256(bytes(t.config.metadataURI)) != keccak256(bytes(cfg.metadataURI));
        t.config = cfg;
        emit TypeConfigured(typeId, cfg);
        if (uriChanged) emit URI(cfg.metadataURI, uint256(typeId));
        if (t.recognised) {
            t.recognised = false;
            emit TypeRecognised(typeId, false);
        }
    }

    /// @notice Permissionless. After an OrgRegistry swap, carries a live org type
    ///         over to the current registry: the old registry must still have the
    ///         org registered at the type's generation, the current one must have
    ///         it registered, and the org's Safe must be the same in both (P2-01:
    ///         same org, not merely the same id). The type then takes the current
    ///         generation and loses its recognition seal (P2-02; the owner re-seals).
    ///         Keepers rebind every live type right after applySources, before any
    ///         Safe rotation or revocation in either registry: a type whose org
    ///         changed its Safe first stays inactive, and the org creates new types.
    ///         Idempotent and caller-independent (P2-07).
    function rebindType(bytes32 typeId) external {
        CredentialType storage t = _requireType(typeId);
        (bool ok, address oldSafe) = _awaitingRebind(typeId, t);
        uint64 gen;
        address safe;
        address reg = orgRegistry;
        if (ok) (ok, gen, safe) = _orgInfo(reg, t.orgId);
        if (!ok || safe != oldSafe) revert NotRebindable(typeId);
        _typeRegistry[typeId] = reg;
        t.orgGeneration = gen;
        emit TypeRebound(typeId, reg, gen);
        if (t.recognised) {
            t.recognised = false;
            emit TypeRecognised(typeId, false);
        }
    }

    /// @notice Irreversible: the type stops counting and its id stays taken.
    function retireType(bytes32 typeId) external {
        CredentialType storage t = _requireType(typeId);
        if (t.policy == ClaimPolicy.External) revert ExternalType(typeId);
        _requireActiveAndManager(typeId, t);
        t.retired = true;
        emit TypeRetired(typeId);
    }

    /// @notice A delegate may issue and revoke batches of this one type; it cannot
    ///         edit the type or appoint delegates.
    function setDelegate(bytes32 typeId, address delegate, bool allowed) external {
        CredentialType storage t = _requireType(typeId);
        if (t.policy == ClaimPolicy.External) revert ExternalType(typeId);
        _requireActiveAndManager(typeId, t);
        _delegates[typeId][delegate] = allowed;
        emit DelegateSet(typeId, delegate, allowed);
    }

    /// @notice On and off by the org's authority or the owner; on only by an attester.
    ///         The flag is kept per orgId and survives a re-registration of that id.
    function setOrgPrivateOnly(bytes32 orgId, bool privateOnly) external {
        (bool registered,,) = _orgInfo(orgRegistry, orgId);
        if (orgId == COMMUNITY || !registered) revert NotAuthorised(msg.sender);
        bool allowed = msg.sender == owner() || canManage(orgId, msg.sender)
            || (privateOnly && ICredAttesterSource(attesterNFT).hasAttesterNFT(msg.sender));
        if (!allowed) revert NotAuthorised(msg.sender);
        orgPrivateOnly[orgId] = privateOnly;
        emit OrgPrivateOnlySet(orgId, privateOnly, msg.sender);
    }

    /// @notice Marks a type as an official office of the community. Sealing needs
    ///         an active type (P2-08); unsealing is always allowed. Apps still
    ///         check isTypeActive: a sealed type can go inactive later.
    function setRecognised(bytes32 typeId, bool recognised) external onlyOwner {
        CredentialType storage t = _requireType(typeId);
        if (recognised && !isTypeActive(typeId)) revert TypeInactive(typeId);
        t.recognised = recognised;
        emit TypeRecognised(typeId, recognised);
    }

    // ---------------------------------------------------------------------
    // Issuing — org authority or a delegate of the type
    // ---------------------------------------------------------------------

    /// @notice Publishes a Merkle root of salted leaves. Only the root and the count are public.
    function addBatch(bytes32 typeId, bytes32 root, uint32 count) external returns (uint64 batchId) {
        CredentialType storage t = _requireType(typeId);
        if (t.policy == ClaimPolicy.External) revert ExternalType(typeId);
        if (t.policy != ClaimPolicy.IssuerBatch) revert WrongPolicy(typeId);
        _requireActiveAndIssuer(typeId);
        if (root == bytes32(0) || count == 0) revert EmptyBatch();
        batchId = uint64(_batches.length);
        _batches.push(Batch(typeId, root, msg.sender, count, uint64(block.timestamp), false));
        emit BatchAdded(batchId, typeId, msg.sender, root, count);
    }

    /// @notice Stops every holding from this batch at once; no transaction per holder.
    function revokeBatch(uint64 batchId) external {
        Batch storage b = _requireBatch(batchId);
        _requireActiveAndIssuer(b.typeId);
        if (b.revoked) revert BatchIsRevoked(batchId);
        b.revoked = true;
        emit BatchRevoked(batchId);
    }

    /// @notice Revokes single leaves of a batch; a claimed leaf that is its holder's
    ///         current holding is burned. Already revoked leaves are skipped.
    ///         The array is unbounded: clients chunk at about 500 leaves. Needs an
    ///         active type, so a dead generation's batches cannot be revoked later
    ///         (they no longer count anyway).
    function revokeLeaves(uint64 batchId, bytes32[] calldata leaves) external {
        Batch storage b = _requireBatch(batchId);
        bytes32 typeId = b.typeId;
        _requireActiveAndIssuer(typeId);
        for (uint256 i = 0; i < leaves.length; i++) {
            bytes32 h = leaves[i];
            if (_leafRevoked[batchId][h]) continue;
            _leafRevoked[batchId][h] = true;
            emit LeafRevoked(batchId, h);
            address account = _leafBoundTo[batchId][h];
            if (account == address(0)) continue;
            Holding storage hold = _holdings[typeId][account];
            if (hold.batchId == batchId && hold.leaf == h && _rawBalance(typeId, account) == 1) _burn(typeId, account);
        }
    }

    // ---------------------------------------------------------------------
    // Holders
    // ---------------------------------------------------------------------

    /// @notice Claims a leaf publicly. An Account leaf is claimed by its subject; a
    ///         ClaimKey leaf by whoever holds the key (EIP-712 signature over
    ///         batchId, leaf and msg.sender), after which it stays bound to that account.
    ///         Claiming while holding replaces the holding (renewal) without a second mint.
    ///         A stale holder still fills a capped slot until pruned: apps batch
    ///         prune + claim in one user operation (P1-09, accepted).
    function claim(uint64 batchId, Leaf calldata leaf, bytes32[] calldata proof, bytes calldata claimSignature)
        external
    {
        Batch storage b = _requireBatch(batchId);
        bytes32 typeId = b.typeId;
        if (!isTypeActive(typeId)) revert TypeInactive(typeId);
        if (leaf.typeId != typeId) revert LeafTypeMismatch();
        CredentialType storage t = _types[typeId];
        _requireMintable(typeId, t);
        if (b.revoked) revert BatchIsRevoked(batchId);
        bytes32 h = leafHash(leaf);
        if (!MerkleProof.verifyCalldata(proof, b.root, h)) revert InvalidProof();
        if (_leafRevoked[batchId][h]) revert LeafIsRevoked(h);
        if (leaf.validUntil != 0 && block.timestamp > leaf.validUntil) revert LeafExpired(h);

        address bound = _leafBoundTo[batchId][h];
        if (leaf.kind == LeafKind.Account) {
            if (msg.sender != leaf.subject) revert NotLeafSubject(msg.sender);
        } else if (bound == address(0)) {
            (address signer, ECDSA.RecoverError err,) =
                ECDSA.tryRecover(claimDigest(batchId, h, msg.sender), claimSignature);
            if (err != ECDSA.RecoverError.NoError || signer != leaf.subject) revert BadClaimSignature();
        } else if (bound != msg.sender) {
            revert LeafBoundToOther(h);
        }
        if (bound != msg.sender) _leafBoundTo[batchId][h] = msg.sender;

        _hold(typeId, t, Holding(batchId, leaf.validUntil, uint64(block.timestamp), h));
        emit Claimed(typeId, msg.sender, batchId, h, leaf.validUntil);
    }

    /// @notice Claims a SelfClaim type (e.g. Guest). A stale holding is refreshed without a second mint.
    function selfClaim(bytes32 typeId) external {
        CredentialType storage t = _requireType(typeId);
        if (t.policy == ClaimPolicy.External) revert ExternalType(typeId);
        if (t.policy != ClaimPolicy.SelfClaim) revert WrongPolicy(typeId);
        if (!isTypeActive(typeId)) revert TypeInactive(typeId);
        _requireMintable(typeId, t);
        if (holds(typeId, msg.sender)) revert AlreadyHeld(typeId, msg.sender);
        uint64 validity = t.config.defaultValidity;
        uint64 validUntil = validity == 0 ? 0 : uint64(block.timestamp) + validity;
        _hold(typeId, t, Holding(0, validUntil, uint64(block.timestamp), bytes32(0)));
        emit SelfClaimed(typeId, msg.sender, validUntil);
    }

    /// @notice Burns the caller's holding (even a stale one). A claim-key leaf stays
    ///         bound to the caller, and the leaf remains valid for private proofs.
    function renounce(bytes32 typeId) external {
        _requireBurnable(typeId, msg.sender);
        _burn(typeId, msg.sender);
        emit Renounced(typeId, msg.sender);
    }

    /// @notice Anyone may burn a holding that no longer counts (expired, revoked,
    ///         retired type or dead org), which also frees a capped slot.
    ///         A type that awaits rebindType after a registry swap (its org still
    ///         alive in the registry it is bound to) is not pruned; its stale
    ///         holdings are pruned after the rebind (P2-04).
    function prune(bytes32 typeId, address account) external {
        _requireBurnable(typeId, account);
        (bool awaiting,) = _awaitingRebind(typeId, _types[typeId]);
        if (awaiting || holds(typeId, account)) revert StillValid(typeId, account);
        _burn(typeId, account);
        emit Pruned(typeId, account);
    }

    // ---------------------------------------------------------------------
    // Sources — owner, delayed two-step
    // ---------------------------------------------------------------------

    /// @notice All three sources change together, SOURCES_DELAY after the proposal.
    function proposeSources(address citizenNFT_, address attesterNFT_, address orgRegistry_) external onlyOwner {
        _requireCode(citizenNFT_);
        _requireCode(attesterNFT_);
        _requireCode(orgRegistry_);
        uint64 eta = uint64(block.timestamp) + SOURCES_DELAY;
        _pendingCitizenNFT = citizenNFT_;
        _pendingAttesterNFT = attesterNFT_;
        _pendingOrgRegistry = orgRegistry_;
        _pendingEta = eta;
        emit SourcesProposed(citizenNFT_, attesterNFT_, orgRegistry_, eta);
    }

    function applySources() external onlyOwner {
        uint64 eta = _pendingEta;
        if (eta == 0) revert NoPendingSources();
        if (block.timestamp < eta) revert SourcesNotReady(eta);
        address c = _pendingCitizenNFT;
        address a = _pendingAttesterNFT;
        address o = _pendingOrgRegistry;
        _clearPendingSources();
        _setSources(c, a, o);
    }

    function cancelSources() external onlyOwner {
        if (_pendingEta == 0) revert NoPendingSources();
        _clearPendingSources();
        emit SourcesCancelled();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice True iff `account` currently holds a credential of `typeId`.
    function holds(bytes32 typeId, address account) public view returns (bool) {
        if (typeId == CITIZEN_TYPE) {
            try ICredCitizenSource(citizenNFT).hasCitizenNFT(account) returns (bool c) { return c; } catch { return false; }
        }
        if (typeId == ATTESTER_TYPE) {
            try ICredAttesterSource(attesterNFT).hasAttesterNFT(account) returns (bool a) { return a; } catch { return false; }
        }
        if (_rawBalance(typeId, account) == 0 || !isTypeActive(typeId)) return false;
        Holding storage h = _holdings[typeId][account];
        if (h.validUntil != 0 && block.timestamp > h.validUntil) return false;
        if (h.batchId == 0) return true;
        return !_batches[h.batchId].revoked && !_leafRevoked[h.batchId][h.leaf];
    }

    /// @notice The validity of a leaf, without minting. Never reverts. Ignores
    ///         publicClaim, the private-only switch, the claim window and the cap
    ///         (they limit minting, not validity). Membership in the batch is checked
    ///         first, so a leaf that is not in the batch is always Invalid.
    function checkLeaf(uint64 batchId, Leaf calldata leaf, bytes32[] calldata proof)
        external
        view
        returns (LeafStatus status, address boundTo)
    {
        if (batchId == 0 || batchId >= _batches.length) return (LeafStatus.Invalid, address(0));
        Batch storage b = _batches[batchId];
        bytes32 h = leafHash(leaf);
        if (leaf.typeId != b.typeId || !MerkleProof.verifyCalldata(proof, b.root, h)) {
            return (LeafStatus.Invalid, address(0));
        }
        boundTo = _leafBoundTo[batchId][h];
        if (!isTypeActive(b.typeId)) status = LeafStatus.Inactive;
        else if (b.revoked || _leafRevoked[batchId][h]) status = LeafStatus.Revoked;
        else if (leaf.validUntil != 0 && block.timestamp > leaf.validUntil) status = LeafStatus.Expired;
        else status = LeafStatus.Valid;
    }

    function getType(bytes32 typeId) external view returns (CredentialType memory) {
        return _requireType(typeId);
    }

    function getBatch(uint64 batchId) external view returns (Batch memory) {
        return _requireBatch(batchId);
    }

    /// @notice The raw holding record (empty when nothing is held); see holds() for validity.
    function holdingOf(bytes32 typeId, address account) external view returns (Holding memory) {
        return _holdings[typeId][account];
    }

    function typeExists(bytes32 typeId) external view returns (bool) {
        return _exists[typeId];
    }

    /// @notice Exists, not retired, and (for an org type) bound to the current
    ///         OrgRegistry, where the org is registered at the type's generation.
    ///         A reverting registry answers false.
    function isTypeActive(bytes32 typeId) public view returns (bool) {
        if (!_exists[typeId]) return false;
        CredentialType storage t = _types[typeId];
        if (t.retired) return false;
        if (t.orgId == COMMUNITY) return true;
        address reg = orgRegistry;
        if (_typeRegistry[typeId] != reg) return false;
        (bool ok, uint64 gen,) = _orgInfo(reg, t.orgId);
        return ok && gen == t.orgGeneration;
    }

    /// @notice The OrgRegistry an org type is bound to (zero for COMMUNITY types).
    function typeRegistryOf(bytes32 typeId) external view returns (address) {
        return _typeRegistry[typeId];
    }

    /// @notice COMMUNITY: the owner. An org: its Safe, a Safe owner, or an Admin.
    ///         A reverting registry answers false (P2-06), so readers degrade;
    ///         state-changing paths then revert NotAuthorised.
    function canManage(bytes32 orgId, address account) public view returns (bool) {
        if (orgId == COMMUNITY) return account == owner();
        address reg = orgRegistry;
        (bool ok,, address safe) = _orgInfo(reg, orgId);
        if (!ok) return false;
        if (safe == account) return true;
        try ICredOrgSource(reg).roleOf(orgId, account) returns (uint8 role) {
            if (role == ORG_ROLE_ADMIN) return true;
        } catch {
            return false;
        }
        try ICredOrgSource(reg).isOrgOwner(orgId, account) returns (bool isOwner) {
            return isOwner;
        } catch {
            return false;
        }
    }

    function canIssue(bytes32 typeId, address account) public view returns (bool) {
        if (!_exists[typeId]) return false;
        return _delegates[typeId][account] || canManage(_types[typeId].orgId, account);
    }

    function isDelegate(bytes32 typeId, address account) external view returns (bool) {
        return _delegates[typeId][account];
    }

    function leafRevoked(uint64 batchId, bytes32 leaf) external view returns (bool) {
        return _leafRevoked[batchId][leaf];
    }

    function leafBoundTo(uint64 batchId, bytes32 leaf) external view returns (address) {
        return _leafBoundTo[batchId][leaf];
    }

    function batchCount() external view returns (uint64) {
        return uint64(_batches.length - 1);
    }

    function pendingSources()
        external
        view
        returns (address citizenNFT_, address attesterNFT_, address orgRegistry_, uint64 eta)
    {
        return (_pendingCitizenNFT, _pendingAttesterNFT, _pendingOrgRegistry, _pendingEta);
    }

    function typeIdOf(bytes32 orgId, bytes32 localId) public pure returns (bytes32) {
        return keccak256(abi.encode(orgId, localId));
    }

    /// @notice Double-hashed leaf (OpenZeppelin convention against inner-node confusion).
    function leafHash(Leaf calldata leaf) public pure returns (bytes32) {
        return keccak256(
            bytes.concat(keccak256(abi.encode(uint8(leaf.kind), leaf.typeId, leaf.subject, leaf.validUntil, leaf.salt)))
        );
    }

    /// @notice EIP-712 digest a claim key signs to bind its leaf to `account`.
    function claimDigest(uint64 batchId, bytes32 leaf, address account) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, batchId, leaf, account)));
    }

    // ---------------------------------------------------------------------
    // ERC-1155: soulbound, balance answered by holds()
    // ---------------------------------------------------------------------

    function balanceOf(address account, uint256 id) public view override returns (uint256) {
        return holds(bytes32(id), account) ? 1 : 0;
    }

    /// @notice The type's metadata URI ("" for an unknown id).
    function uri(uint256 id) public view override returns (string memory) {
        return _types[bytes32(id)].config.metadataURI;
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert Soulbound();
    }

    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public
        pure
        override
    {
        revert Soulbound();
    }

    /// @dev Only mints (from 0) and burns (to 0) pass.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert Soulbound();
        super._update(from, to, ids, values);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _createReserved(bytes32 typeId, string memory name, Kind kind, ClaimPolicy policy, TypeConfig memory cfg)
        private
    {
        if (bytes(cfg.metadataURI).length > MAX_URI_BYTES) revert UriTooLong();
        bytes32 localId = keccak256(bytes(string.concat("netizen:credential-type:v1:", name)));
        // The constants must match the documented derivation.
        assert(typeIdOf(COMMUNITY, localId) == typeId);
        _create(typeId, COMMUNITY, localId, kind, policy, 0, cfg);
    }

    function _create(
        bytes32 typeId,
        bytes32 orgId,
        bytes32 localId,
        Kind kind,
        ClaimPolicy policy,
        uint64 generation,
        TypeConfig memory cfg
    ) private {
        _exists[typeId] = true;
        CredentialType storage t = _types[typeId];
        t.orgId = orgId;
        t.localId = localId;
        t.orgGeneration = generation;
        t.createdAt = uint64(block.timestamp);
        t.kind = kind;
        t.policy = policy;
        t.config = cfg;
        emit TypeCreated(typeId, orgId, localId, kind, policy, generation);
        emit TypeConfigured(typeId, cfg);
        emit URI(cfg.metadataURI, uint256(typeId));
    }

    /// @dev (registered, generation, safe) of `orgId` in `reg`; a reverting registry
    ///      reads as unregistered. Not caught (P2-05, owner trust): malformed return
    ///      data, a source without code, gas exhaustion and returnbombs.
    function _orgInfo(address reg, bytes32 orgId) private view returns (bool ok, uint64 gen, address safe) {
        try ICredOrgSource(reg).isRegistered(orgId) returns (bool r) {
            if (!r) return (false, 0, address(0));
        } catch {
            return (false, 0, address(0));
        }
        try ICredOrgSource(reg).getOrg(orgId) returns (ICredOrgSource.Org memory o) {
            return (true, o.generation, o.safe);
        } catch {
            return (false, 0, address(0));
        }
    }

    /// @dev An org type, not retired, bound to a registry other than the current one,
    ///      in which its org is still alive at the type's generation; plus the org's
    ///      Safe there. Depends on the old registry's live state (P2-03).
    function _awaitingRebind(bytes32 typeId, CredentialType storage t) private view returns (bool, address) {
        address old = _typeRegistry[typeId];
        if (t.orgId == COMMUNITY || t.policy == ClaimPolicy.External || t.retired || old == orgRegistry) {
            return (false, address(0));
        }
        (bool ok, uint64 gen, address safe) = _orgInfo(old, t.orgId);
        return (ok && gen == t.orgGeneration, safe);
    }

    function _requireType(bytes32 typeId) internal view returns (CredentialType storage t) {
        if (!_exists[typeId]) revert UnknownType(typeId);
        t = _types[typeId];
    }

    /// @dev Activity is checked before authority, so a dead or retired type reports
    ///      TypeInactive to everyone (a delegate of a dead org included).
    function _requireActiveAndManager(bytes32 typeId, CredentialType storage t) internal view {
        if (!isTypeActive(typeId)) revert TypeInactive(typeId);
        if (!canManage(t.orgId, msg.sender)) revert NotAuthorised(msg.sender);
    }

    /// @dev Like _requireActiveAndManager, for issuing: a delegate counts too.
    function _requireActiveAndIssuer(bytes32 typeId) internal view {
        if (!isTypeActive(typeId)) revert TypeInactive(typeId);
        if (!canIssue(typeId, msg.sender)) revert NotAuthorised(msg.sender);
    }

    function _requireBatch(uint64 batchId) internal view returns (Batch storage) {
        if (batchId == 0 || batchId >= _batches.length) revert UnknownBatch(batchId);
        return _batches[batchId];
    }

    /// @dev publicClaim, the org's private-only switch (Membership only) and the claim window.
    ///      These gate new public claims only; they never affect existing holdings.
    function _requireMintable(bytes32 typeId, CredentialType storage t) internal view {
        if (!t.config.publicClaim || (t.kind == Kind.Membership && orgPrivateOnly[t.orgId])) {
            revert PublicClaimDisabled(typeId);
        }
        uint64 start = t.config.claimStart;
        uint64 end = t.config.claimEnd;
        if ((start != 0 && block.timestamp < start) || (end != 0 && block.timestamp > end)) {
            revert ClaimWindowClosed(typeId);
        }
    }

    function _requireBurnable(bytes32 typeId, address account) internal view {
        if (_requireType(typeId).policy == ClaimPolicy.External) revert ExternalType(typeId);
        if (_rawBalance(typeId, account) == 0) revert NotHeld(typeId, account);
    }

    /// @dev Writes msg.sender's holding and mints (cap-checked) when nothing is held yet.
    function _hold(bytes32 typeId, CredentialType storage t, Holding memory h) private {
        _holdings[typeId][msg.sender] = h;
        if (_rawBalance(typeId, msg.sender) == 0) {
            uint32 cap = t.config.supplyCap;
            if (cap != 0 && t.supply >= cap) revert SupplyCapReached(typeId);
            t.supply++;
            _update(address(0), msg.sender, _single(typeId), _single(bytes32(uint256(1))));
        }
    }

    /// @dev Burns a raw holding and clears its record; a claim-key binding is kept.
    function _burn(bytes32 typeId, address account) private {
        _types[typeId].supply--;
        delete _holdings[typeId][account];
        _update(account, address(0), _single(typeId), _single(bytes32(uint256(1))));
    }

    function _rawBalance(bytes32 typeId, address account) private view returns (uint256) {
        return ERC1155.balanceOf(account, uint256(typeId));
    }

    function _single(bytes32 v) private pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = uint256(v);
    }

    function _validateConfig(TypeConfig calldata cfg) internal pure {
        if (bytes(cfg.metadataURI).length > MAX_URI_BYTES) revert UriTooLong();
        if (cfg.claimStart != 0 && cfg.claimEnd != 0 && cfg.claimEnd <= cfg.claimStart) revert BadConfig();
    }

    function _setSources(address c, address a, address o) private {
        _requireCode(c);
        _requireCode(a);
        _requireCode(o);
        citizenNFT = c;
        attesterNFT = a;
        orgRegistry = o;
        emit SourcesApplied(c, a, o);
    }

    function _clearPendingSources() private {
        delete _pendingCitizenNFT;
        delete _pendingAttesterNFT;
        delete _pendingOrgRegistry;
        delete _pendingEta;
    }

    function _requireCode(address account) private view {
        if (account.code.length == 0) revert NotContract(account);
    }
}
