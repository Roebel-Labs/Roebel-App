// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {console2} from "forge-std/console2.sol";
import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {
    PackedUserOperation,
    SignerPermissionRequest,
    IThirdwebAccountFactory,
    IThirdwebAccount,
    ISocialRecoveryModule
} from "./utils/Interfaces.sol";

/// @notice Proves the "thirdweb trennen" (detach) step on a Gnosis fork against the REAL thirdweb
///         AccountFactory/Account bytecode: after the tranche-1 handover made the passkey Safe
///         co-admin (and the Safe set up 2-of-2 guardians), the EOA signs its own removal
///         (`SignerPermissionRequest{signer: eoa, isAdmin: 2}`) and the passkey Safe submits it as
///         ONE sponsored userOp (single CALL, value 0, target = legacy). Afterwards the Safe is the
///         sole admin, the EOA is powerless and the legacy account's ERC-1271 path is dead.
contract PasskeyDetachTest is PasskeySafeBase {
    uint256 internal constant EOA_KEY = 0xA11CE;
    uint256 internal constant NEW_EOA_KEY = 0xA11CE2;
    uint256 internal constant G1_KEY = 0x6001;
    uint256 internal constant G2_KEY = 0x6002;
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;

    ISocialRecoveryModule internal srm = ISocialRecoveryModule(SOCIAL_RECOVERY);

    address internal eoa;
    IThirdwebAccount internal legacy;
    address internal safe;
    address internal recipient;
    address internal g1;
    address internal g2;

    function setUp() public {
        _fork();
        _takeOverSponsorSigner();

        (uint256 x, uint256 y) = vm.publicKeyP256(PASSKEY_PK);
        bytes memory initializer = _passkeySafeInitializer(x, y);
        safe = _predictSafe(initializer, SAFE_SALT_NONCE);

        eoa = vm.addr(EOA_KEY);
        legacy = IThirdwebAccount(IThirdwebAccountFactory(TW_FACTORY).createAccount(eoa, ""));
        vm.deal(address(legacy), 1 ether);
        recipient = makeAddr("recipient");

        // Tranche-1 handover: op 0 deploys the passkey Safe and submits the EOA-signed
        // SignerPermissionRequest{isAdmin: 1, signer: safe} to the legacy account.
        SignerPermissionRequest memory addReq = _permissionRequest(
            safe, 1, uint128(block.timestamp), uint128(block.timestamp + 1 hours), keccak256("handover")
        );
        _sponsoredOp(
            _safeInitCode(initializer, SAFE_SALT_NONCE),
            address(legacy),
            0,
            abi.encodeCall(
                IThirdwebAccount.setPermissionsForSigner, (addReq, _signHandover(EOA_KEY, address(legacy), addReq))
            )
        );
        assertTrue(legacy.isAdmin(safe), "Safe must be co-admin after handover");
        assertTrue(legacy.isAdmin(eoa), "EOA stays admin after handover");

        // The Safe adds 2 guardians (threshold 2) through its own sponsored userOps.
        g1 = _deployPlainSafe(vm.addr(G1_KEY), uint256(keccak256("detach-g1")));
        g2 = _deployPlainSafe(vm.addr(G2_KEY), uint256(keccak256("detach-g2")));
        _sponsoredOp("", SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (g1, 1)));
        _sponsoredOp("", SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (g2, 2)));
        assertEq(srm.guardiansCount(safe), 2);
        assertEq(srm.threshold(safe), 2);
        assertTrue(srm.isGuardian(safe, g1) && srm.isGuardian(safe, g2));
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /// @dev One sponsored, WebAuthn-signed Safe4337Module.executeUserOp(to, value, data, CALL).
    function _sponsoredOp(bytes memory initCode, address to, uint256 value, bytes memory data)
        internal
        returns (uint256 gasUsed)
    {
        PackedUserOperation memory op =
            _buildOp(safe, entryPoint.getNonce(safe, 0), initCode, _executeUserOpCallData(to, value, data));
        _sponsor(op);
        _signOp(op, PASSKEY_PK, SHARED_SIGNER);
        gasUsed = _handleOp(op);
    }

    function _detachRequest(bytes32 uid) internal view returns (SignerPermissionRequest memory) {
        return _permissionRequest(eoa, 2, uint128(block.timestamp), uint128(block.timestamp + 1 hours), uid);
    }

    /// @dev The exact detach op the app sends: ONE sponsored userOp, single CALL, value 0, target = legacy.
    function _detach() internal returns (SignerPermissionRequest memory req, bytes memory sig, uint256 gasUsed) {
        req = _detachRequest(keccak256("detach"));
        sig = _signHandover(EOA_KEY, address(legacy), req);
        (bool ok, address signer) = legacy.verifySignerPermissionRequest(req, sig);
        assertTrue(ok, "detach request must verify on the real Account");
        assertEq(signer, eoa);
        gasUsed = _sponsoredOp("", address(legacy), 0, abi.encodeCall(IThirdwebAccount.setPermissionsForSigner, (req, sig)));
    }

    /// @dev thirdweb Account.getMessageHash: EIP-712 AccountMessage(bytes message) with message = abi.encode(hash).
    function _accountMessageHash(address account, bytes32 hash) internal pure returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Account"),
                keccak256("1"),
                uint256(100),
                account
            )
        );
        bytes32 structHash = keccak256(abi.encode(keccak256("AccountMessage(bytes message)"), keccak256(abi.encode(hash))));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator, structHash));
    }

    // ------------------------------------------------------------------
    // Tests
    // ------------------------------------------------------------------

    function test_detachLeavesSafeAsSoleAdmin() public {
        // ERC-1271 via the EOA is valid BEFORE detach.
        bytes32 hash = keccak256("some app message");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EOA_KEY, _accountMessageHash(address(legacy), hash));
        bytes memory eoaSig = abi.encodePacked(r, s, v);
        assertEq(legacy.isValidSignature(hash, eoaSig), ERC1271_MAGIC, "pre-detach ERC-1271 must be valid");

        uint256 depositBefore = paymaster.getDeposit();
        (,, uint256 gasDetach) = _detach();
        console2.log("handleOps gas (detach, sponsored):", gasDetach);
        assertLt(paymaster.getDeposit(), depositBefore, "paymaster must pay for the detach op");

        assertFalse(legacy.isAdmin(eoa), "EOA must no longer be admin");
        assertTrue(legacy.isAdmin(safe), "Safe must remain admin");
        address[] memory admins = legacy.getAllAdmins();
        assertEq(admins.length, 1, "exactly one admin left");
        assertEq(admins[0], safe, "the only admin is the passkey Safe");

        // Guardians are untouched by detach.
        assertEq(srm.guardiansCount(safe), 2);
        assertEq(srm.threshold(safe), 2);

        // The Safe still drives the legacy account via a sponsored userOp.
        uint256 before = recipient.balance;
        uint256 gasExec =
            _sponsoredOp("", address(legacy), 0, abi.encodeCall(IThirdwebAccount.execute, (recipient, 1 wei, "")));
        console2.log("handleOps gas (legacy.execute after detach, sponsored):", gasExec);
        assertEq(recipient.balance, before + 1, "legacy account paid 1 wei on the Safe's behalf");

        // The EOA's direct execute reverts.
        vm.prank(eoa);
        vm.expectRevert(bytes("Account: not admin or EntryPoint."));
        legacy.execute(recipient, 1 wei, "");

        // ERC-1271 via the EOA is dead after detach (mirrors LegacyHandover).
        try legacy.isValidSignature(hash, eoaSig) returns (bytes4 magic) {
            assertTrue(magic != ERC1271_MAGIC, "post-detach ERC-1271 must NOT be valid");
        } catch Error(string memory reason) {
            assertEq(reason, "Account: caller not approved target.");
        }
    }

    /// (a) The same detach request cannot be replayed (uid consumed).
    function test_detachReplayReverts() public {
        (SignerPermissionRequest memory req, bytes memory sig,) = _detach();
        vm.expectRevert(bytes("!sig"));
        legacy.setPermissionsForSigner(req, sig);
    }

    /// (b) The chain does NOT stop the EOA from removing the SAFE (isAdmin:2, signer: safe) while it is
    ///     still admin. Only the server/app policy (detach may only ever target the EOA itself) prevents it.
    function test_chainAllowsEoaToRemoveSafe_serverPolicyMustReject() public {
        SignerPermissionRequest memory req = _permissionRequest(
            safe, 2, uint128(block.timestamp), uint128(block.timestamp + 1 hours), keccak256("remove-safe")
        );
        legacy.setPermissionsForSigner(req, _signHandover(EOA_KEY, address(legacy), req));
        assertFalse(legacy.isAdmin(safe), "chain accepted the EOA removing the Safe");
        assertTrue(legacy.isAdmin(eoa));
        address[] memory admins = legacy.getAllAdmins();
        assertEq(admins.length, 1);
        assertEq(admins[0], eoa);
    }

    /// (c) After detach the removed EOA can no longer add admins.
    function test_detachedEoaCannotAddAdmin() public {
        _detach();
        SignerPermissionRequest memory req = _permissionRequest(
            vm.addr(NEW_EOA_KEY), 1, uint128(block.timestamp), uint128(block.timestamp + 1 hours), keccak256("re-add")
        );
        bytes memory sig = _signHandover(EOA_KEY, address(legacy), req);
        (bool ok, address signer) = legacy.verifySignerPermissionRequest(req, sig);
        assertFalse(ok, "removed EOA's request must not verify");
        assertEq(signer, eoa);
        vm.expectRevert(bytes("!sig"));
        legacy.setPermissionsForSigner(req, sig);
        assertFalse(legacy.isAdmin(vm.addr(NEW_EOA_KEY)));
    }
}
