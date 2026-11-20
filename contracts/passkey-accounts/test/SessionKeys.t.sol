// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {console2} from "forge-std/console2.sol";
import {Vm} from "forge-std/Vm.sol";
import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {WebAuthnHelper} from "./utils/WebAuthnHelper.sol";
import {
    PackedUserOperation,
    IThirdwebAccount,
    ISafe,
    IMultiSend,
    ISafe4337Module,
    ISafeWebAuthnSharedSigner,
    ISafeWebAuthnSignerFactory,
    ISocialRecoveryModule
} from "./utils/Interfaces.sol";
import {
    ModuleInit,
    RegistryInit,
    Execution,
    ISafe7579,
    ISafeAdmin,
    PolicyData,
    ActionData,
    ERC7739Context,
    ERC7739Data,
    Session,
    ISmartSession,
    LimitUsage,
    ParamRule,
    ParamRules,
    ActionConfig,
    ICirclesHub,
    ISocialRecoveryGuardians
} from "./utils/SessionInterfaces.sol";

/// @notice Session keys for passkey Safes, forked from Gnosis against the real deployed bytecode.
///
/// Subject = Max's REAL passkey Safe 0xe3d1…2deb (owner SafeWebAuthnSharedSigner, modules
/// [SocialRecoveryModule, Safe4337Module], fallback Safe4337Module, 2 guardians / threshold 2,
/// co-admin of his legacy thirdweb account 0xc49d…Fb28, a Circles human in the Röbel group).
/// The only fork cheat on it: the SharedSigner's (x, y) in the Safe's storage is replaced by a
/// test passkey (we do not hold Max's key); guardians are impersonated with vm.prank.
///
///  1. MIGRATE (one passkey-signed, sponsored op on the CURRENT Safe4337Module path):
///     enableModule(Safe7579) + setFallbackHandler(Safe7579) + initializeAccount(SmartSession with
///     sessions, registry off) + disableModule(Safe4337Module). The passkey stays the ROOT: it is
///     still the Safe owner, and Safe7579 falls back to Safe.checkSignatures for nonce key 0.
///  2. A SESSION KEY (secp256k1, OwnableValidator as ISessionValidator) sends sponsored ops with
///     NO passkey signature, scoped by UniActionPolicy (legacy.execute → Hub.personalMint / groupMint
///     into the Röbel group / safeTransferFrom of Röbel Münzen with a per-transfer + per-session cap)
///     and TimeFramePolicy (30-day expiry, enforced by the EntryPoint via validUntil).
///  3. Everything else fails; revocation is one passkey op; renewal is one passkey op;
///     social recovery still works; the NetizenVerifyingPaymaster sponsors every op unchanged.
contract SessionKeysTest is PasskeySafeBase {
    // ---- Gnosis chain 100, verified 2026-09-27 ----
    address internal constant SAFE7579 = 0x7579EE8307284F293B1927136486880611F20002;
    address internal constant SMART_SESSIONS = 0x00000000002B0eCfbD0496EE71e01257dA0E37DE;
    address internal constant OWNABLE_VALIDATOR = 0x000000000013fdB5234E4E3162a810F54d9f7E98;
    address internal constant UNI_ACTION_POLICY = 0x0000000000714Cf48FcF88A0bFBa70d313415032;
    address internal constant TIME_FRAME_POLICY = 0x0000000000D30f611fA3bf652ac6879428586930;
    address internal constant MULTI_SEND_CALL_ONLY = 0x9641d764fc13c8B624c04430C7356C1C7C8102e2;
    address internal constant HUB = 0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8;
    address internal constant GROUP = 0xAc2CeCdBead594F97358a0d3132454f24F3E470c;
    address internal constant MAX_SAFE = 0xE3D18FECDcF8E8B656b11340790f7c0147632deB;
    address internal constant MAX_LEGACY = 0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28;
    address internal constant SENTINEL = address(1);

    /// SafeWebAuthnSharedSigner: SIGNER_SLOT = keccak256(abi.encode(SHARED_SIGNER, _SIGNER_MAPPING_SLOT)).
    uint256 internal constant SIGNER_MAPPING_SLOT = 0x2e0aed53485dc2290ceb5ce14725558ad3e3a09d38c69042410ad15c2b4ea4e8;
    /// Safe FallbackManager slot keccak256("fallback_manager.handler.address").
    bytes32 internal constant FALLBACK_HANDLER_SLOT = 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;

    uint256 internal constant MODULE_TYPE_VALIDATOR = 1;
    uint8 internal constant MODE_USE = 0;
    uint8 internal constant MODE_UNSAFE_ENABLE = 2;
    bytes32 internal constant EXEC_SINGLE = bytes32(0);
    bytes32 internal constant EXEC_BATCH = bytes32(uint256(0x01) << 248);

    uint256 internal constant SESSION_KEY = 0x5E55_10E;
    uint256 internal constant OTHER_KEY = 0xBAD_5E55;
    uint256 internal constant NEW_PASSKEY_PK = 0xC0FFEE2;
    uint256 internal constant SESSION_DAYS = 30;
    uint256 internal constant PER_TRANSFER_CAP = 50 ether; // 50 Röbel Münzen (18 decimals)
    uint256 internal constant SESSION_TRANSFER_CAP = 100 ether;
    uint128 internal constant GRANT_CALL_GAS = 3_500_000; // keeps maxCost under the 0.01 xDAI voucher cap at 2 gwei

    // UniActionPolicy conditions
    uint8 internal constant EQUAL = 0;
    uint8 internal constant GTE = 3;
    uint8 internal constant LTE = 4;

    address internal safe = MAX_SAFE;
    address internal sessionSigner;
    uint48 internal validUntil;
    bytes32 internal pidMint;
    bytes32 internal pidGroupMint;
    bytes32 internal pidSend;

    ICirclesHub internal hub = ICirclesHub(HUB);

    function setUp() public {
        _fork();
        _takeOverSponsorSigner();
        sessionSigner = vm.addr(SESSION_KEY);
        validUntil = uint48(block.timestamp + SESSION_DAYS * 1 days);

        // ---- the live shape of Max's Safe (fails loudly if it ever changes) ----
        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], SHARED_SIGNER, "Max's Safe is owned by the SharedSigner");
        assertTrue(ISafe(safe).isModuleEnabled(SAFE_4337_MODULE), "4337 module");
        assertTrue(ISafe(safe).isModuleEnabled(SOCIAL_RECOVERY), "SRM");
        assertEq(address(uint160(uint256(vm.load(safe, FALLBACK_HANDLER_SLOT)))), SAFE_4337_MODULE, "handler");
        assertTrue(IThirdwebAccount(MAX_LEGACY).isAdmin(safe), "Safe is admin of Max's legacy account");
        assertTrue(hub.isHuman(MAX_LEGACY), "legacy is a Circles human");
        assertTrue(hub.isTrusted(GROUP, MAX_LEGACY), "Roebel group trusts the legacy account");

        // ---- stand-in passkey: swap (x, y) in the SharedSigner config stored in the Safe ----
        ISafeWebAuthnSharedSigner.Signer memory cfg = ISafeWebAuthnSharedSigner(SHARED_SIGNER).getConfiguration(safe);
        assertEq(cfg.verifiers, VERIFIERS, "Max's verifiers = precompile 0x100 | FCL");
        (uint256 x, uint256 y) = vm.publicKeyP256(PASSKEY_PK);
        uint256 slot = uint256(keccak256(abi.encode(SHARED_SIGNER, SIGNER_MAPPING_SLOT)));
        vm.store(safe, bytes32(slot), bytes32(x));
        vm.store(safe, bytes32(slot + 1), bytes32(y));
        cfg = ISafeWebAuthnSharedSigner(SHARED_SIGNER).getConfiguration(safe);
        assertEq(cfg.x, x);
        assertEq(cfg.y, y);
    }

    // =====================================================================
    // Session definitions (UniActionPolicy over legacy.execute calldata)
    // =====================================================================
    //
    // legacy.execute(address target, uint256 value, bytes data) calldata, offsets AFTER the
    // 4-byte selector (UniActionPolicy reads data[4 + offset : 4 + offset + 32]):
    //   0x00 target | 0x20 value | 0x40 offset of `data` (pinned 0x60 -> canonical layout)
    //   0x60 data.length | 0x80 inner selector (+28 bytes) | 0x84 inner arg0 | 0xa4 arg1 | ...

    function _rule(uint8 condition, uint64 offset, bytes32 ref) internal pure returns (ParamRule memory r) {
        r.condition = condition;
        r.offset = offset;
        r.ref = ref;
    }

    function _config(ParamRule[] memory rules) internal pure returns (ActionConfig memory c) {
        c.valueLimitPerUse = 0; // 7579 value into legacy.execute must be 0
        c.paramRules.length = rules.length;
        for (uint256 i; i < rules.length; i++) {
            c.paramRules.rules[i] = rules[i];
        }
    }

    /// First 32 bytes of `selector ++ abi.encode(arg0)` (pins the inner selector exactly when arg0 is pinned).
    function _selWindow(bytes4 selector, address arg0) internal pure returns (bytes32 w) {
        bytes memory b = abi.encodePacked(selector, bytes32(uint256(uint160(arg0))));
        assembly {
            w := mload(add(b, 32))
        }
    }

    function _legacyRules(uint256 n) internal pure returns (ParamRule[] memory rules) {
        rules = new ParamRule[](n);
        rules[0] = _rule(EQUAL, 0x00, bytes32(uint256(uint160(HUB))));
        rules[1] = _rule(EQUAL, 0x20, bytes32(0));
        rules[2] = _rule(EQUAL, 0x40, bytes32(uint256(0x60)));
    }

    function _mintConfig() internal pure returns (ActionConfig memory) {
        ParamRule[] memory rules = _legacyRules(5);
        rules[3] = _rule(EQUAL, 0x60, bytes32(uint256(4))); // data = exactly personalMint()
        rules[4] = _rule(EQUAL, 0x80, bytes32(ICirclesHub.personalMint.selector));
        return _config(rules);
    }

    function _groupMintConfig() internal pure returns (ActionConfig memory) {
        ParamRule[] memory rules = _legacyRules(5);
        rules[3] = _rule(EQUAL, 0x80, _selWindow(ICirclesHub.groupMint.selector, GROUP));
        rules[4] = _rule(EQUAL, 0x84, bytes32(uint256(uint160(GROUP))));
        return _config(rules);
    }

    function _sendConfig() internal pure returns (ActionConfig memory) {
        ParamRule[] memory rules = _legacyRules(7);
        rules[3] = _rule(EQUAL, 0x80, _selWindow(ICirclesHub.safeTransferFrom.selector, MAX_LEGACY));
        rules[4] = _rule(EQUAL, 0x84, bytes32(uint256(uint160(MAX_LEGACY)))); // from = own balance
        rules[5] = _rule(EQUAL, 0xc4, bytes32(uint256(uint160(GROUP)))); // id = Röbel Münzen
        ParamRule memory cap = _rule(LTE, 0xe4, bytes32(PER_TRANSFER_CAP)); // amount per transfer
        cap.isLimited = true; // ... and cumulative over the session
        cap.usage = LimitUsage({limit: SESSION_TRANSFER_CAP, used: 0});
        rules[6] = cap;
        return _config(rules);
    }

    function _session(bytes32 salt, ActionConfig memory cfg, address signer, uint48 until)
        internal
        pure
        returns (Session memory s)
    {
        address[] memory owners = new address[](1);
        owners[0] = signer;
        s.sessionValidator = OWNABLE_VALIDATOR;
        s.sessionValidatorInitData = abi.encode(uint256(1), owners);
        s.salt = salt;
        s.userOpPolicies = new PolicyData[](1);
        s.userOpPolicies[0] = PolicyData(TIME_FRAME_POLICY, abi.encodePacked(until, uint48(0)));
        s.erc7739Policies = ERC7739Data(new ERC7739Context[](0), new PolicyData[](0));
        s.actions = new ActionData[](1);
        PolicyData[] memory ap = new PolicyData[](1);
        ap[0] = PolicyData(UNI_ACTION_POLICY, abi.encode(cfg));
        s.actions[0] = ActionData(IThirdwebAccount.execute.selector, MAX_LEGACY, ap);
        s.permitERC4337Paymaster = true; // sponsored ops need this (+ >= 1 userOp policy)
    }

    function _sessions(address signer, uint48 until) internal returns (Session[] memory s) {
        s = new Session[](3);
        s[0] = _session(keccak256("roebel/muenzen/personalMint"), _mintConfig(), signer, until);
        s[1] = _session(keccak256("roebel/muenzen/groupMint"), _groupMintConfig(), signer, until);
        s[2] = _session(keccak256("roebel/muenzen/send"), _sendConfig(), signer, until);
        pidMint = ISmartSession(SMART_SESSIONS).getPermissionId(s[0]);
        pidGroupMint = ISmartSession(SMART_SESSIONS).getPermissionId(s[1]);
        pidSend = ISmartSession(SMART_SESSIONS).getPermissionId(s[2]);
    }

    function _smartSessionsInitData(Session[] memory s) internal pure returns (bytes memory) {
        return abi.encodePacked(MODE_UNSAFE_ENABLE, abi.encode(s));
    }

    // =====================================================================
    // Ops
    // =====================================================================

    function _withCallGas(PackedUserOperation memory op, uint128 callGas) internal pure {
        op.accountGasLimits = bytes32((uint256(VERIFICATION_GAS) << 128) | callGas);
    }

    /// The migration: ONE passkey-signed, sponsored op through the CURRENT Safe4337Module path.
    function _migrationCallData(Session[] memory s) internal view returns (bytes memory) {
        (address[] memory mods,) = ISafeAdmin(safe).getModulesPaginated(SENTINEL, 10);
        address prev4337;
        for (uint256 i; i < mods.length; i++) {
            if (mods[i] == SAFE_4337_MODULE) prev4337 = i == 0 ? SAFE7579 : mods[i - 1]; // 7579 lands at the head
        }
        assertTrue(prev4337 != address(0), "4337 module not found");

        ModuleInit[] memory validators = new ModuleInit[](s.length == 0 ? 0 : 1);
        if (s.length != 0) validators[0] = ModuleInit(SMART_SESSIONS, _smartSessionsInitData(s));
        bytes memory txs = abi.encodePacked(
            _multiSendTx(0, safe, 0, abi.encodeCall(ISafeAdmin.enableModule, (SAFE7579))),
            _multiSendTx(0, safe, 0, abi.encodeCall(ISafeAdmin.setFallbackHandler, (SAFE7579))),
            _multiSendTx(
                0,
                safe,
                0,
                abi.encodeCall(
                    ISafe7579.initializeAccount,
                    (
                        validators,
                        new ModuleInit[](0),
                        new ModuleInit[](0),
                        new ModuleInit[](0),
                        RegistryInit(address(0), new address[](0), 0)
                    )
                )
            ),
            _multiSendTx(0, safe, 0, abi.encodeCall(ISafeAdmin.disableModule, (prev4337, SAFE_4337_MODULE)))
        );
        return abi.encodeCall(
            ISafe4337Module.executeUserOp, (MULTI_SEND_CALL_ONLY, 0, abi.encodeCall(IMultiSend.multiSend, (txs)), uint8(1))
        );
    }

    function _migrate(bool withSessions) internal returns (uint256 gasUsed) {
        Session[] memory s = withSessions ? _sessions(sessionSigner, validUntil) : new Session[](0);
        PackedUserOperation memory op = _buildOp(safe, entryPoint.getNonce(safe, 0), "", _migrationCallData(s));
        _withCallGas(op, GRANT_CALL_GAS);
        _sponsor(op);
        _signOp(op, PASSKEY_PK, SHARED_SIGNER); // Safe4337Module SafeOp hash
        gasUsed = _ok(op);
    }

    /// Independent SafeOp hash with the Safe7579 adapter as EIP-712 verifyingContract.
    function _safeOpHash7579(PackedUserOperation memory op) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(keccak256("EIP712Domain(uint256 chainId,address verifyingContract)"), block.chainid, SAFE7579)
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)"
                ),
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                uint128(uint256(op.accountGasLimits) >> 128),
                uint128(uint256(op.accountGasLimits)),
                op.preVerificationGas,
                uint128(uint256(op.gasFees) >> 128),
                uint128(uint256(op.gasFees)),
                keccak256(op.paymasterAndData),
                uint48(0),
                uint48(0),
                ENTRY_POINT
            )
        );
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator, structHash));
    }

    /// Root (passkey) op after migration: nonce key 0 -> Safe7579 falls back to Safe.checkSignatures.
    function _rootOp(uint256 pk, address owner, bytes memory callData) internal returns (PackedUserOperation memory op) {
        op = _buildOp(safe, entryPoint.getNonce(safe, 0), "", callData);
        _withCallGas(op, GRANT_CALL_GAS);
        _sponsor(op);
        op.signature = abi.encodePacked(uint48(0), uint48(0));
        (bytes memory operationData,,,) = ISafe7579(SAFE7579).getSafeOp(op, ENTRY_POINT);
        bytes32 h = keccak256(operationData);
        assertEq(h, _safeOpHash7579(op), "local SafeOp(7579) hash != Safe7579.getSafeOp");
        WebAuthnParts memory p = _webAuthnSign(pk, h);
        op.signature = WebAuthnHelper.userOpSignature(0, 0, WebAuthnHelper.safeContractSignature(owner, p.webAuthnSignature));
    }

    function _sessionNonceKey() internal pure returns (uint192) {
        return uint192(bytes24(bytes20(SMART_SESSIONS)));
    }

    /// Session op: NO passkey. Nonce key = SmartSession (validator selection), signature =
    /// USE ++ permissionId ++ ECDSA(sessionKey, userOpHash).
    function _sessionOp(uint256 key, bytes32 pid, bytes32 mode, bytes memory executionCalldata)
        internal
        returns (PackedUserOperation memory op)
    {
        op = _buildOp(
            safe, entryPoint.getNonce(safe, _sessionNonceKey()), "", abi.encodeCall(ISafe7579.execute, (mode, executionCalldata))
        );
        _sponsor(op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, entryPoint.getUserOpHash(op));
        op.signature = abi.encodePacked(MODE_USE, pid, abi.encodePacked(r, s, v));
    }

    function _viaLegacy(address target, bytes memory data) internal pure returns (bytes memory) {
        return abi.encodePacked(MAX_LEGACY, uint256(0), abi.encodeCall(IThirdwebAccount.execute, (target, 0, data)));
    }

    function _mintOp() internal returns (PackedUserOperation memory) {
        return _sessionOp(SESSION_KEY, pidMint, EXEC_SINGLE, _viaLegacy(HUB, abi.encodeCall(ICirclesHub.personalMint, ())));
    }

    function _sendOp(address to, uint256 amount) internal returns (PackedUserOperation memory) {
        return _sessionOp(
            SESSION_KEY,
            pidSend,
            EXEC_SINGLE,
            _viaLegacy(HUB, abi.encodeCall(ICirclesHub.safeTransferFrom, (MAX_LEGACY, to, uint256(uint160(GROUP)), amount, "")))
        );
    }


    /// handleOps + the op's EXECUTION must succeed (a reverted execution does not revert handleOps).
    function _ok(PackedUserOperation memory op) internal returns (uint256 gasUsed) {
        vm.recordLogs();
        gasUsed = _handleOp(op);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 evSig = keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)");
        bytes32 revSig = keccak256("UserOperationRevertReason(bytes32,address,uint256,bytes)");
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter != ENTRY_POINT) continue;
            if (logs[i].topics[0] == revSig) {
                (, bytes memory reason) = abi.decode(logs[i].data, (uint256, bytes));
                console2.logBytes(reason);
            }
            if (logs[i].topics[0] == evSig) {
                (, bool success,,) = abi.decode(logs[i].data, (uint256, bool, uint256, uint256));
                assertTrue(success, "userOp execution reverted");
                found = true;
            }
        }
        assertTrue(found, "no UserOperationEvent");
    }


    // SmartSession error selectors (verified source)
    bytes4 internal constant POLICY_VIOLATION = 0x3b577361; // PolicyViolation(bytes32,address)
    bytes4 internal constant NO_POLICIES_SET = 0x1c792c05; // NoPoliciesSet(bytes32)
    bytes4 internal constant INVALID_PERMISSION_ID = 0x526d0da5; // InvalidPermissionId(bytes32)
    bytes4 internal constant POLICY_CHECK_REVERTED = 0xf4270752; // PolicyCheckReverted(bytes32)

    /// A session op the chain rejects in validation (AA23). Safe7579 wraps the module's revert as
    /// ExecutionFailed(), so the SmartSession reason is read by calling the module directly
    /// (as the Safe, on a throw-away state snapshot) and compared to `why`.
    function _expectReject(PackedUserOperation memory op, bytes4 why) internal {
        _expectFail(op, "AA23 reverted");
        uint256 snap = vm.snapshotState();
        bytes32 h = entryPoint.getUserOpHash(op);
        vm.prank(safe);
        (bool ok, bytes memory ret) =
            SMART_SESSIONS.call(abi.encodeWithSignature("validateUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32)", op, h));
        vm.revertToState(snap);
        assertFalse(ok, "SmartSession must revert");
        assertEq(bytes4(ret), why, "SmartSession rejection reason");
    }

    /// handleOps must revert with FailedOp / FailedOpWithRevert carrying `reason`.
    function _expectFail(PackedUserOperation memory op, string memory reason) internal returns (bytes memory inner) {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        try entryPoint.handleOps(ops, payable(makeAddr("bundler"))) {
            revert(string.concat("op should have failed with ", reason));
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            bytes memory body = new bytes(err.length - 4);
            for (uint256 i = 4; i < err.length; i++) {
                body[i - 4] = err[i];
            }
            string memory got;
            if (sel == bytes4(keccak256("FailedOp(uint256,string)"))) {
                (, got) = abi.decode(body, (uint256, string));
            } else if (sel == bytes4(keccak256("FailedOpWithRevert(uint256,string,bytes)"))) {
                (, got, inner) = abi.decode(body, (uint256, string, bytes));
            } else {
                revert("unexpected revert shape");
            }
            assertEq(got, reason, "EntryPoint failure reason");

        }
    }

    function _groupBal() internal view returns (uint256) {
        return hub.balanceOf(MAX_LEGACY, uint256(uint160(GROUP)));
    }

    function _personalBal() internal view returns (uint256) {
        return hub.balanceOf(MAX_LEGACY, uint256(uint160(MAX_LEGACY)));
    }

    // =====================================================================
    // 1. Migration of Max's Safe + first grant in the same passkey op
    // =====================================================================

    function test_migrateMaxSafeAndGrant_onePasskeyOp() public {
        address[] memory guardiansBefore = ISocialRecoveryGuardians(SOCIAL_RECOVERY).getGuardians(safe);
        uint256 gasUsed = _migrate(true);
        console2.log("GAS migrate + grant 3 sessions (1 passkey op, sponsored, FCL):", gasUsed);

        assertTrue(ISafe(safe).isModuleEnabled(SAFE7579), "Safe7579 is a module");
        assertEq(address(uint160(uint256(vm.load(safe, FALLBACK_HANDLER_SLOT)))), SAFE7579, "Safe7579 is the handler");
        assertFalse(ISafe(safe).isModuleEnabled(SAFE_4337_MODULE), "Safe4337Module disabled");
        assertTrue(ISafe(safe).isModuleEnabled(SOCIAL_RECOVERY), "SRM untouched");
        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], SHARED_SIGNER, "passkey stays the (only) Safe owner = root");
        assertEq(ISocialRecoveryGuardians(SOCIAL_RECOVERY).getGuardians(safe).length, guardiansBefore.length);
        assertTrue(IThirdwebAccount(MAX_LEGACY).isAdmin(safe), "still legacy admin");
        assertTrue(ISafe7579(safe).isModuleInstalled(MODULE_TYPE_VALIDATOR, SMART_SESSIONS, ""), "SmartSession installed");
        bytes32[] memory pids = ISmartSession(SMART_SESSIONS).getPermissionIDs(safe);
        assertEq(pids.length, 3, "3 sessions granted");
    }

    // =====================================================================
    // 2. Session key acts with NO passkey, sponsored
    // =====================================================================

    function test_sessionKeyClaimsMuenzenWithoutPasskey() public {
        _migrate(true);
        uint256 deposit0 = paymaster.getDeposit();
        uint256 personal0 = _personalBal();
        (uint256 issuance,,) = hub.calculateIssuance(MAX_LEGACY);
        assertGt(issuance, 0, "Max has Muenzen to claim on the fork");

        uint256 gasMint = _ok(_mintOp());
        console2.log("GAS session op legacy.execute(Hub.personalMint) (sponsored):", gasMint);
        uint256 personal1 = _personalBal();
        assertGt(personal1, personal0, "personalMint minted with the session key only");
        assertLt(paymaster.getDeposit(), deposit0, "NetizenVerifyingPaymaster paid");

        // groupMint the fresh personal CRC into Röbel Münzen, second session op (no passkey)
        uint256 group0 = _groupBal();
        address[] memory avatars = new address[](1);
        avatars[0] = MAX_LEGACY;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = personal1 / 2;
        PackedUserOperation memory op = _sessionOp(
            SESSION_KEY,
            pidGroupMint,
            EXEC_SINGLE,
            _viaLegacy(HUB, abi.encodeCall(ICirclesHub.groupMint, (GROUP, avatars, amounts, "")))
        );
        uint256 gasGroup = _ok(op);
        console2.log("GAS session op legacy.execute(Hub.groupMint) (sponsored):", gasGroup);
        assertGt(_groupBal(), group0, "Roebel Muenzen minted with the session key only");
    }

    function test_sessionKeySendsMuenzenWithinCaps() public {
        _migrate(true);
        // NB: makeAddr("alice") has code on Gnosis mainnet (rejects ERC-1155), so use a fresh EOA
        address alice = makeAddr("roebel-session-recipient");
        assertEq(alice.code.length, 0, "recipient must be an EOA");
        uint256 g0 = _groupBal();
        assertGe(g0, SESSION_TRANSFER_CAP, "fork balance covers the test");

        uint256 gasSend = _ok(_sendOp(alice, PER_TRANSFER_CAP));
        console2.log("GAS session op legacy.execute(Hub.safeTransferFrom) (sponsored):", gasSend);
        assertEq(hub.balanceOf(alice, uint256(uint160(GROUP))), PER_TRANSFER_CAP, "50 Muenzen sent");

        // over the per-transfer cap
        _expectReject(_sendOp(alice, PER_TRANSFER_CAP + 1), POLICY_VIOLATION);
        // second 50 fills the session cap (100), any further Münzen exceed it
        _ok(_sendOp(alice, PER_TRANSFER_CAP));
        _expectReject(_sendOp(alice, 1), POLICY_VIOLATION);
        assertEq(hub.balanceOf(alice, uint256(uint160(GROUP))), SESSION_TRANSFER_CAP);
    }

    // =====================================================================
    // 3. Everything outside the scope fails
    // =====================================================================

    function test_disallowedCallsFail() public {
        _migrate(true);
        bytes memory groupMintData;
        {
            address[] memory avatars = new address[](1);
            avatars[0] = MAX_LEGACY;
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = 1;
            groupMintData = abi.encodeCall(ICirclesHub.groupMint, (GROUP, avatars, amounts, ""));
        }

        // a) right target, wrong permission: the mint session cannot groupMint
        _expectReject(_sessionOp(SESSION_KEY, pidMint, EXEC_SINGLE, _viaLegacy(HUB, groupMintData)), POLICY_VIOLATION);
        // b) disallowed inner selector: registerHuman / trust via legacy.execute
        _expectReject(
            _sessionOp(SESSION_KEY, pidMint, EXEC_SINGLE, _viaLegacy(HUB, abi.encodeCall(ICirclesHub.trust, (address(0xBEEF), 0)))),
            POLICY_VIOLATION
        );
        // c) disallowed inner target: legacy.execute(someToken, 0, transfer) / legacy.execute(safe, …)
        _expectReject(
            _sessionOp(SESSION_KEY, pidSend, EXEC_SINGLE, _viaLegacy(address(0xBEEF), abi.encodeCall(ICirclesHub.personalMint, ()))),
            POLICY_VIOLATION
        );
        // d) disallowed outer selector: legacy.executeBatch
        {
            address[] memory t = new address[](1);
            t[0] = HUB;
            uint256[] memory v = new uint256[](1);
            bytes[] memory d = new bytes[](1);
            d[0] = abi.encodeCall(ICirclesHub.personalMint, ());
            _expectReject(
                _sessionOp(
                    SESSION_KEY,
                    pidMint,
                    EXEC_SINGLE,
                    abi.encodePacked(MAX_LEGACY, uint256(0), abi.encodeCall(IThirdwebAccount.executeBatch, (t, v, d)))
                ),
                NO_POLICIES_SET
            );
        }
        // e) direct call to the Hub from the Safe (not via legacy) and a Safe self-call (owner change)
        _expectReject(
            _sessionOp(SESSION_KEY, pidMint, EXEC_SINGLE, abi.encodePacked(HUB, uint256(0), abi.encodeCall(ICirclesHub.personalMint, ()))),
            NO_POLICIES_SET
        );
        _expectReject(
            _sessionOp(
                SESSION_KEY,
                pidMint,
                EXEC_SINGLE,
                abi.encodePacked(safe, uint256(0), abi.encodeWithSignature("addOwnerWithThreshold(address,uint256)", address(0xBAD), 1))
            ),
            NO_POLICIES_SET
        );
        // f) value: 1 wei into legacy.execute at the 7579 level, and 1 wei inside legacy.execute
        _expectReject(
            _sessionOp(
                SESSION_KEY,
                pidMint,
                EXEC_SINGLE,
                abi.encodePacked(
                    MAX_LEGACY, uint256(1), abi.encodeCall(IThirdwebAccount.execute, (HUB, 0, abi.encodeCall(ICirclesHub.personalMint, ())))
                )
            ),
            POLICY_CHECK_REVERTED
        );
        _expectReject(
            _sessionOp(
                SESSION_KEY,
                pidMint,
                EXEC_SINGLE,
                abi.encodePacked(
                    MAX_LEGACY, uint256(0), abi.encodeCall(IThirdwebAccount.execute, (HUB, 1, abi.encodeCall(ICirclesHub.personalMint, ())))
                )
            ),
            POLICY_VIOLATION
        );
        // g) a 7579 batch that smuggles one disallowed call next to an allowed one
        {
            Execution[] memory ex = new Execution[](2);
            ex[0] = Execution(MAX_LEGACY, 0, abi.encodeCall(IThirdwebAccount.execute, (HUB, 0, abi.encodeCall(ICirclesHub.personalMint, ()))));
            ex[1] = Execution(MAX_LEGACY, 0, abi.encodeCall(IThirdwebAccount.execute, (address(0xBEEF), 0, "")));
            _expectReject(_sessionOp(SESSION_KEY, pidMint, EXEC_BATCH, abi.encode(ex)), POLICY_VIOLATION);
        }
        // h) module management straight from a session (callData is not execute())
        {
            PackedUserOperation memory op = _buildOp(
                safe,
                entryPoint.getNonce(safe, _sessionNonceKey()),
                "",
                abi.encodeCall(ISafe7579.installModule, (MODULE_TYPE_VALIDATOR, address(0xBAD), ""))
            );
            _sponsor(op);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(SESSION_KEY, entryPoint.getUserOpHash(op));
            op.signature = abi.encodePacked(MODE_USE, pidMint, abi.encodePacked(r, s, v));
            _expectReject(op, NO_POLICIES_SET);
        }
        // i) send from someone else's balance (from != legacy)
        _expectReject(
            _sessionOp(
                SESSION_KEY,
                pidSend,
                EXEC_SINGLE,
                _viaLegacy(HUB, abi.encodeCall(ICirclesHub.safeTransferFrom, (address(0xF00), address(0xBEEF), uint256(uint160(GROUP)), 1, "")))
            ),
            POLICY_VIOLATION
        );
        // j) a different key signing with a valid permission id
        _expectFail(
            _sessionOp(OTHER_KEY, pidMint, EXEC_SINGLE, _viaLegacy(HUB, abi.encodeCall(ICirclesHub.personalMint, ()))),
            "AA24 signature error"
        );
        // k) the allowed op itself still works afterwards (nothing above consumed state)
        _ok(_mintOp());
    }

    // =====================================================================
    // 4. Expiry, revocation, renewal
    // =====================================================================

    function test_expiredSessionFails() public {
        _migrate(true);
        vm.warp(uint256(validUntil) - 1 hours);
        _ok(_mintOp()); // still valid just before expiry
        vm.warp(uint256(validUntil) + 1);
        _expectFail(_mintOp(), "AA22 expired or not due");
    }

    function test_revokeAllSessionsWithOnePasskeyOp() public {
        _migrate(true);
        _ok(_mintOp());

        Execution[] memory ex = new Execution[](3);
        ex[0] = Execution(SMART_SESSIONS, 0, abi.encodeCall(ISmartSession.removeSession, (pidMint)));
        ex[1] = Execution(SMART_SESSIONS, 0, abi.encodeCall(ISmartSession.removeSession, (pidGroupMint)));
        ex[2] = Execution(SMART_SESSIONS, 0, abi.encodeCall(ISmartSession.removeSession, (pidSend)));
        uint256 gasRevoke =
            _ok(_rootOp(PASSKEY_PK, SHARED_SIGNER, abi.encodeCall(ISafe7579.execute, (EXEC_BATCH, abi.encode(ex)))));
        console2.log("GAS revoke all 3 sessions (1 passkey op, sponsored, FCL):", gasRevoke);

        assertEq(ISmartSession(SMART_SESSIONS).getPermissionIDs(safe).length, 0, "no session left");
        vm.warp(block.timestamp + 1 days);
        _expectReject(_mintOp(), INVALID_PERMISSION_ID);
        _expectReject(_sendOp(makeAddr("alice"), 1), INVALID_PERMISSION_ID);
    }

    /// Renewal (30 days later, or a new device): ONE passkey op re-installs SmartSession with the
    /// new session set (grants go through onInstall in UNSAFE_ENABLE mode, so no ERC-7484 registry
    /// attestation is needed - the Gnosis registry has none for the policies).
    function test_renewAfterExpiryWithOnePasskeyOp() public {
        _migrate(true);
        vm.warp(uint256(validUntil) + 1);
        _expectFail(_mintOp(), "AA22 expired or not due");

        uint48 until2 = uint48(block.timestamp + SESSION_DAYS * 1 days);
        Session[] memory s = _sessions(sessionSigner, until2);
        Execution[] memory ex = new Execution[](2);
        ex[0] = Execution(
            safe, 0, abi.encodeCall(ISafe7579.uninstallModule, (MODULE_TYPE_VALIDATOR, SMART_SESSIONS, abi.encode(SENTINEL, bytes(""))))
        );
        ex[1] = Execution(
            safe, 0, abi.encodeCall(ISafe7579.installModule, (MODULE_TYPE_VALIDATOR, SMART_SESSIONS, _smartSessionsInitData(s)))
        );
        uint256 gasRenew =
            _ok(_rootOp(PASSKEY_PK, SHARED_SIGNER, abi.encodeCall(ISafe7579.execute, (EXEC_BATCH, abi.encode(ex)))));
        console2.log("GAS renew: uninstall + reinstall 3 sessions (1 passkey op, sponsored, FCL):", gasRenew);
        assertEq(ISmartSession(SMART_SESSIONS).getPermissionIDs(safe).length, 3);
        _ok(_mintOp());
    }

    /// Grant on an ALREADY migrated Safe that has no SmartSession yet: one passkey op (7579 root
    /// path) installs it with the sessions.
    function test_grantOnMigratedSafeWithOnePasskeyOp() public {
        uint256 gasMigrate = _migrate(false);
        console2.log("GAS migrate only, no sessions (1 passkey op, sponsored, FCL):", gasMigrate);
        // SmartSession not installed: Safe7579 falls back to Safe.checkSignatures -> the ECDSA session sig fails
        _expectFail(_mintOp(), "AA24 signature error");

        Session[] memory s = _sessions(sessionSigner, validUntil);
        uint256 gasGrant = _ok(
            _rootOp(
                PASSKEY_PK,
                SHARED_SIGNER,
                abi.encodeCall(ISafe7579.installModule, (MODULE_TYPE_VALIDATOR, SMART_SESSIONS, _smartSessionsInitData(s)))
            )
        );
        console2.log("GAS grant 3 sessions on a migrated Safe (1 passkey op, sponsored, FCL):", gasGrant);
        _ok(_mintOp());
    }

    // =====================================================================
    // 5. Social recovery still works after the migration
    // =====================================================================

    function test_socialRecoveryStillWorks() public {
        _migrate(true);
        ISocialRecoveryModule srm = ISocialRecoveryModule(SOCIAL_RECOVERY);
        address[] memory guardians = ISocialRecoveryGuardians(SOCIAL_RECOVERY).getGuardians(safe);
        uint256 thr = srm.threshold(safe);
        assertGe(guardians.length, thr);

        (uint256 x2, uint256 y2) = vm.publicKeyP256(NEW_PASSKEY_PK);
        address newSigner = ISafeWebAuthnSignerFactory(SIGNER_FACTORY).createSigner(x2, y2, VERIFIERS);
        address[] memory newOwners = new address[](1);
        newOwners[0] = newSigner;
        for (uint256 i; i < thr; i++) {
            vm.prank(guardians[i]); // Max's real guardians (msg.sender check only)
            srm.confirmRecovery(safe, newOwners, 1, false);
        }
        srm.executeRecovery(safe, newOwners, 1);
        vm.warp(block.timestamp + 259200 + 1);
        srm.finalizeRecovery(safe);
        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], newSigner, "recovered to the new passkey");

        // Sessions SURVIVE a recovery (they belong to the account, not to the owner) ...
        _ok(_mintOp());

        // ... the OLD passkey is dead on the 7579 root path ...
        _expectFail(
            _rootOp(PASSKEY_PK, SHARED_SIGNER, abi.encodeCall(ISafe7579.execute, (EXEC_SINGLE, abi.encodePacked(SMART_SESSIONS, uint256(0), abi.encodeCall(ISmartSession.removeSession, (pidMint)))))),
            "AA24 signature error"
        );

        // ... and the NEW passkey revokes everything with one op (the recovery flow must do this).
        Execution[] memory ex = new Execution[](3);
        ex[0] = Execution(SMART_SESSIONS, 0, abi.encodeCall(ISmartSession.removeSession, (pidMint)));
        ex[1] = Execution(SMART_SESSIONS, 0, abi.encodeCall(ISmartSession.removeSession, (pidGroupMint)));
        ex[2] = Execution(SMART_SESSIONS, 0, abi.encodeCall(ISmartSession.removeSession, (pidSend)));
        _ok(_rootOp(NEW_PASSKEY_PK, newSigner, abi.encodeCall(ISafe7579.execute, (EXEC_BATCH, abi.encode(ex)))));
        _expectReject(_mintOp(), INVALID_PERMISSION_ID);
    }

    // =====================================================================
    // 6. ERC-1271 changes shape after the migration (breaking for every 1271 consumer)
    // =====================================================================

    function test_erc1271NeedsValidatorPrefixAfterMigration() public {
        bytes32 h = keccak256("roebel.app email proof");
        bytes32 safeMsg = _safeMessageHash(h);
        WebAuthnParts memory p = _webAuthnSign(PASSKEY_PK, safeMsg);
        bytes memory sig = WebAuthnHelper.safeContractSignature(SHARED_SIGNER, p.webAuthnSignature);

        // before: CompatibilityFallbackHandler (Safe4337Module) accepts the plain Safe signature
        assertEq(ISafe7579(safe).isValidSignature(h, sig), bytes4(0x1626ba7e), "pre-migration 1271");

        _migrate(true);
        // after: Safe7579 reads the first 20 bytes as a validator address; 20 zero bytes = "use the
        // Safe owners". The SafeMessage hash itself is unchanged.
        assertEq(
            ISafe7579(safe).isValidSignature(h, abi.encodePacked(address(0), sig)), bytes4(0x1626ba7e), "prefixed 1271"
        );
        vm.expectRevert();
        ISafe7579(safe).isValidSignature(h, sig);
    }

    function _safeMessageHash(bytes32 h) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(keccak256("EIP712Domain(uint256 chainId,address verifyingContract)"), block.chainid, safe)
        );
        bytes32 structHash = keccak256(
            abi.encode(
                0x60b3cbf8b4a223d68d641b3b6ddf9a298e7f33710cf3d3a9d1146b5a6150fbca, // SafeMessage(bytes message)
                keccak256(abi.encode(h))
            )
        );
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domain, structHash));
    }
}
