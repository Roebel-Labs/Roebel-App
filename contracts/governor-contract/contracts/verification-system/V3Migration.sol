// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The one function v3 needs from a legacy (thirdweb) smart account.
/// thirdweb `Account` (impl 0xf22175c8…) exposes `isAdmin(address) view returns (bool)`.
interface ILegacyAccount {
    function isAdmin(address signer) external view returns (bool);
}

/// @title V3Migration
/// @notice Shared pieces of the v2 → v3 identity migration used by AttesterNFTv3 and CitizenNFTv3.
///
/// ## Why v3 exists
/// v2 holders are thirdweb smart accounts. Each citizen gets a **passkey Safe**, and the old
/// account makes that Safe its admin (`legacy.isAdmin(safe) == true`). v2 tokens are soulbound
/// and its `migrationMint` is finalized forever, so a v2 token can never follow its holder to
/// the Safe. v3 solves that with two one-way phases:
///
///  1. **Bootstrap** (`bootstrapFromV2`, owner only): re-issue v3 tokens to the SAME addresses
///     that hold v2 today, each one checked on-chain against the v2 contract. The production
///     app keeps working the moment it is pointed at v3, before anyone has a passkey.
///     `finalizeBootstrap()` closes this forever; after it the owner can never mint again.
///  2. **Self-serve move** (`moveTo`, holder only): a holder moves their own token to a new
///     account. The call arrives through `legacy.execute(...)`, so `msg.sender` is the legacy
///     account itself. `closeMoveWindow()` closes this forever.
///
/// ## Why `moveTo` needs the `isAdmin` link
/// Without a link proof, anyone who briefly controls a holder account (a leaked session key,
/// a malicious dApp approval) could move the identity to an address of their choosing, and a
/// holder could hand their vote to someone else. Requiring `legacy.isAdmin(newAccount)` means
/// the destination must already be a full admin of the source account: the move only confirms,
/// on-chain and without an operator-kept mapping, a control relation that already exists.
/// The link is read by `staticcall`, so the legacy account cannot re-enter during the check.
/// A move grants nothing the holder could not already do in v2: making another address an
/// admin of the legacy account already hands that address full control of the v2 identity.
/// The destination must never have held a token of this contract, so identities cannot merge
/// and a lineage never loops.
///
/// ## Ownership path
/// Both contracts are `Ownable2Step`. The owner starts as the new Attester Safe (constructor),
/// which runs bootstrap during the migration. Later the Safe hands ownership to the governance
/// Timelock: the Safe calls `transferOwnership(timelock)` and the Timelock (via a governance
/// proposal) calls `acceptOwnership()`. Until accepted, the Safe stays owner, so a typo in the
/// Timelock address can't orphan the contract. Owner powers stay the same for either owner and
/// are limited to: bootstrap (until finalized), band setters, `closeMoveWindow`, handover.
/// The threshold bands keep v2's rules exactly (ThresholdBands.validate, no extra floors).
///
/// ## Identity origin (why moved holders cannot vote twice)
/// Every token lineage has an **origin**: the address that first received it (bootstrap or
/// attestation). A move copies the origin to the new account. Request votes are keyed by
/// origin, not by `msg.sender`, so a holder who approved from the old address cannot approve
/// the same request again from the new one, and a target cannot vote on its own request from a
/// new address. Revocations resolve the origin to its **current** holder at execution time, so
/// moving never dodges a pending revocation and never revokes the wrong account.
abstract contract V3Migration {
    /// @notice Bootstrap was finalized (one-way).
    error BootstrapAlreadyFinalized();
    /// @notice The address does not hold the v2 token it is being bootstrapped from.
    error NotV2Holder(address account);
    /// @notice The move window was closed (one-way).
    error MoveWindowAlreadyClosed();
    /// @notice The caller holds no v3 token.
    error NotHolder(address account);
    /// @notice The move destination is the zero address.
    error ZeroAddress();
    /// @notice The move destination holds, or has ever held, a token of this contract.
    error DestinationAlreadyUsed(address account);
    /// @notice `legacy.isAdmin(newAccount)` returned false.
    error NotLinked(address legacy, address newAccount);
    /// @notice `legacy` has no working `isAdmin(address)` (EOA, other contract, or it reverted).
    error LinkCheckFailed(address legacy);
    /// @notice The address moved its token away; it cannot be (re-)issued a token.
    error AccountMovedAway(address account);

    event BootstrapMinted(address indexed account, uint256 indexed tokenId);
    event BootstrapFinalized();
    event MoveWindowClosed();
    /// @notice A holder moved its token. `oldTokenId == newTokenId` by design (see `moveTo`).
    event Moved(address indexed from, address indexed to, uint256 oldTokenId, uint256 newTokenId);

    /// @notice One-way switch: true once `finalizeBootstrap()` ran.
    bool public bootstrapFinalized;
    /// @notice One-way switch: true once `closeMoveWindow()` ran.
    bool public moveWindowClosed;

    /// @dev origin of a token lineage; 0 means "the address is its own origin".
    mapping(address => address) private _origin;
    /// @dev origin => address currently holding that lineage's token (0 = none).
    mapping(address => address) internal _currentHolder;
    /// @notice old address => address it moved its token to (0 = never moved).
    mapping(address => address) public movedTo;

    /// @notice The identity origin of `account` (itself unless it received a token by a move).
    function originOf(address account) public view returns (address) {
        address o = _origin[account];
        return o == address(0) ? account : o;
    }

    /// @notice The address currently holding the token whose lineage `account` belongs to
    /// (follows moves; 0 if that lineage holds no token any more).
    function currentHolderOf(address account) public view returns (address) {
        return _currentHolder[originOf(account)];
    }

    /// @dev Records a fresh lineage (bootstrap or attestation mint): `to` is its own origin.
    /// Clearing `_origin` matters for an address that once received a token by a move, lost it
    /// to revocation and was later re-attested: it is then a new identity, not the old lineage.
    function _startLineage(address to) internal {
        delete _origin[to];
        _currentHolder[to] = to;
    }

    /// @dev Records a move of the lineage held by `from` to `to`.
    function _recordMove(address from, address to) internal {
        address o = originOf(from);
        _origin[to] = o;
        _currentHolder[o] = to;
        movedTo[from] = to;
    }

    /// @dev Ends the lineage held by `holder` (revocation).
    function _endLineage(address holder) internal {
        delete _currentHolder[originOf(holder)];
    }

    /// @dev Reverts unless `legacy.isAdmin(newAccount)` returns true. Uses `staticcall` so the
    /// callee cannot change state, and fails closed on a revert, missing code or short return.
    function _requireAdminLink(address legacy, address newAccount) internal view {
        (bool ok, bytes memory ret) = legacy.staticcall(
            abi.encodeWithSelector(ILegacyAccount.isAdmin.selector, newAccount)
        );
        if (!ok || ret.length < 32) revert LinkCheckFailed(legacy);
        uint256 word = abi.decode(ret, (uint256));
        if (word > 1) revert LinkCheckFailed(legacy);
        if (word == 0) revert NotLinked(legacy, newAccount);
    }
}
