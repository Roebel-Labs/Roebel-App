// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {console2} from "forge-std/console2.sol";
import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {WebAuthnHelper} from "./utils/WebAuthnHelper.sol";
import {
    PackedUserOperation,
    SignerPermissionRequest,
    IThirdwebAccountFactory,
    IThirdwebAccount,
    ISafe,
    ISafeProxyFactory,
    ISafeWebAuthnSharedSigner,
    ISafeWebAuthnSignerFactory
} from "./utils/Interfaces.sol";

/// @notice Proves the full passkey path on a Gnosis fork against the real deployed bytecode:
///         counterfactual passkey Safe (SharedSigner owner, Safe4337Module + SocialRecoveryModule),
///         WebAuthn-signed v0.7 userOps, sponsored by the live NetizenVerifyingPaymaster (voucher v2),
///         and the tranche-1 handover op that makes the Safe co-admin of a legacy thirdweb account.
contract PasskeySafeSponsoredTest is PasskeySafeBase {
    uint256 internal constant EOA_KEY = 0xA11CE;
    string internal constant VECTOR_PATH = "./test/fixtures/passkey-safe-vector.json";

    uint256 internal x;
    uint256 internal y;
    bytes internal initializer;
    address internal safe;

    function setUp() public {
        _fork();
        (x, y) = vm.publicKeyP256(PASSKEY_PK);
        initializer = _passkeySafeInitializer(x, y);
        safe = _predictSafe(initializer, SAFE_SALT_NONCE);
        _takeOverSponsorSigner();
    }

    function test_counterfactualAddressMatchesFactory() public {
        assertEq(safe.code.length, 0, "Safe must not exist yet");
        uint256 snap = vm.snapshotState();
        address deployed =
            ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(SAFE_L2_SINGLETON, initializer, SAFE_SALT_NONCE);
        assertEq(deployed, safe, "predicted != deployed");

        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], SHARED_SIGNER);
        assertEq(ISafe(safe).getThreshold(), 1);
        assertTrue(ISafe(safe).isModuleEnabled(SAFE_4337_MODULE), "4337 module");
        assertTrue(ISafe(safe).isModuleEnabled(SOCIAL_RECOVERY), "social recovery module");
        ISafeWebAuthnSharedSigner.Signer memory cfg = ISafeWebAuthnSharedSigner(SHARED_SIGNER).getConfiguration(safe);
        assertEq(cfg.x, x);
        assertEq(cfg.y, y);
        assertEq(cfg.verifiers, VERIFIERS);
        vm.revertToState(snap);
    }

    function test_sponsoredDeployAndTransfer() public {
        address recipient = makeAddr("recipient");
        vm.deal(safe, 1 wei);
        uint256 depositBefore = paymaster.getDeposit();

        PackedUserOperation memory op = _buildOp(
            safe,
            entryPoint.getNonce(safe, 0),
            _safeInitCode(initializer, SAFE_SALT_NONCE),
            _executeUserOpCallData(recipient, 1 wei, "")
        );
        _sponsor(op);
        _signOp(op, PASSKEY_PK, SHARED_SIGNER);
        uint256 gasUsed = _handleOp(op);
        console2.log("handleOps gas (deploy + 1 wei transfer, sponsored):", gasUsed);

        assertGt(safe.code.length, 0, "Safe must be deployed");
        assertEq(recipient.balance, 1, "recipient +1 wei");
        assertLt(paymaster.getDeposit(), depositBefore, "paymaster deposit must pay");
        assertEq(entryPoint.getNonce(safe, 0), 1);
    }

    /// @notice The exact tranche-1 op: first sponsored userOp deploys the passkey Safe AND submits the
    ///         EOA-signed SignerPermissionRequest{isAdmin: 1} to the legacy account (value 0).
    function test_sponsoredHandoverMakesSafeCoAdmin() public {
        address eoa = vm.addr(EOA_KEY);
        IThirdwebAccount legacy = IThirdwebAccount(IThirdwebAccountFactory(TW_FACTORY).createAccount(eoa, ""));
        vm.deal(address(legacy), 1 ether);

        SignerPermissionRequest memory req = _permissionRequest(
            safe, 1, uint128(block.timestamp), uint128(block.timestamp + 1 hours), keccak256("add")
        );
        bytes memory sig = _signHandover(EOA_KEY, address(legacy), req);
        uint256 depositBefore = paymaster.getDeposit();

        PackedUserOperation memory op = _buildOp(
            safe,
            entryPoint.getNonce(safe, 0),
            _safeInitCode(initializer, SAFE_SALT_NONCE),
            _executeUserOpCallData(
                address(legacy), 0, abi.encodeCall(IThirdwebAccount.setPermissionsForSigner, (req, sig))
            )
        );
        _sponsor(op);
        _signOp(op, PASSKEY_PK, SHARED_SIGNER);
        uint256 gasHandover = _handleOp(op);
        console2.log("handleOps gas (deploy + handover, sponsored):", gasHandover);

        assertTrue(legacy.isAdmin(safe), "passkey Safe must be co-admin");
        assertTrue(legacy.isAdmin(eoa), "EOA stays admin in tranche 1");
        assertLt(paymaster.getDeposit(), depositBefore);

        // Second sponsored op: Safe drives the legacy account (legacy.execute), still value 0 at the Safe.
        address recipient = makeAddr("recipient");
        PackedUserOperation memory op2 = _buildOp(
            safe,
            entryPoint.getNonce(safe, 0),
            "",
            _executeUserOpCallData(
                address(legacy), 0, abi.encodeCall(IThirdwebAccount.execute, (recipient, 1 wei, ""))
            )
        );
        _sponsor(op2);
        _signOp(op2, PASSKEY_PK, SHARED_SIGNER);
        uint256 gasExec = _handleOp(op2);
        console2.log("handleOps gas (legacy.execute via Safe, sponsored):", gasExec);
        assertEq(recipient.balance, 1, "legacy account paid 1 wei on the Safe's behalf");
    }

    function test_wrongPasskeyRejected() public {
        PackedUserOperation memory op = _buildOp(
            safe,
            entryPoint.getNonce(safe, 0),
            _safeInitCode(initializer, SAFE_SALT_NONCE),
            _executeUserOpCallData(makeAddr("recipient"), 0, "")
        );
        _sponsor(op);
        _signOp(op, 0xBADBAD, SHARED_SIGNER);
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        entryPoint.handleOps(ops, payable(makeAddr("bundler")));
    }

    function test_p256PrecompileProbeAndFallbackVerifier() public {
        bool hasPrecompile = _forkHasP256Precompile();
        console2.log("fork has RIP-7212 precompile at 0x100:", hasPrecompile);

        bytes32 challenge = keccak256("fallback-check");
        WebAuthnParts memory p = _webAuthnSign(PASSKEY_PK, challenge);
        ISafeWebAuthnSignerFactory f = ISafeWebAuthnSignerFactory(SIGNER_FACTORY);
        // Production packing (precompile first, FCL fallback) must verify regardless of the fork EVM.
        assertEq(f.isValidSignatureForSigner(challenge, p.webAuthnSignature, x, y, VERIFIERS), bytes4(0x1626ba7e));
        // FCL alone must verify too (this is what runs if 0x100 is absent).
        assertEq(
            f.isValidSignatureForSigner(challenge, p.webAuthnSignature, x, y, uint176(uint160(FCL_VERIFIER))),
            bytes4(0x1626ba7e)
        );
        // Precompile alone: valid iff the fork EVM has 0x100.
        bytes4 precompileOnly =
            f.isValidSignatureForSigner(challenge, p.webAuthnSignature, x, y, uint176(0x0100) << 160);
        assertEq(precompileOnly == bytes4(0x1626ba7e), hasPrecompile);
    }

    /// @notice Cross-checks our voucher encoding against the netizen_labs golden vector.
    function test_voucherGoldenVector() public view {
        string memory json = vm.readFile("./test/fixtures/voucher-vector.json");
        PackedUserOperation memory op = PackedUserOperation({
            sender: vm.parseJsonAddress(json, ".userOp.sender"),
            nonce: vm.parseJsonUint(json, ".userOp.nonce"),
            initCode: vm.parseJsonBytes(json, ".userOp.initCode"),
            callData: vm.parseJsonBytes(json, ".userOp.callData"),
            accountGasLimits: vm.parseJsonBytes32(json, ".userOp.accountGasLimits"),
            preVerificationGas: vm.parseJsonUint(json, ".userOp.preVerificationGas"),
            gasFees: vm.parseJsonBytes32(json, ".userOp.gasFees"),
            paymasterAndData: vm.parseJsonBytes(json, ".paymasterAndData"),
            signature: ""
        });
        bytes32 stable = _hashStableFieldsLocal(op);
        assertEq(stable, vm.parseJsonBytes32(json, ".hashStableFields"), "hashStableFields vector");
        bytes32 digest = _voucherDigestLocal(
            vm.parseJsonUint(json, ".domain.chainId"),
            vm.parseJsonAddress(json, ".domain.verifyingContract"),
            stable,
            vm.parseJsonBytes32(json, ".voucher.subjectHash"),
            vm.parseJsonUint(json, ".voucher.maxCostWei"),
            uint48(vm.parseJsonUint(json, ".voucher.validAfter")),
            uint48(vm.parseJsonUint(json, ".voucher.validUntil")),
            vm.parseJsonBytes32(json, ".voucher.voucherNonce")
        );
        assertEq(digest, vm.parseJsonBytes32(json, ".eip712Digest"), "voucher digest vector");
        bytes memory paymasterData = abi.encode(
            uint48(vm.parseJsonUint(json, ".voucher.validAfter")),
            uint48(vm.parseJsonUint(json, ".voucher.validUntil")),
            vm.parseJsonBytes32(json, ".voucher.voucherNonce"),
            vm.parseJsonBytes32(json, ".voucher.subjectHash"),
            vm.parseJsonUint(json, ".voucher.maxCostWei"),
            vm.parseJsonBytes(json, ".signature")
        );
        assertEq(paymasterData, vm.parseJsonBytes(json, ".paymasterData"), "paymasterData vector");
    }

    // ------------------------------------------------------------------
    // Golden vector for Task 3 (TypeScript must reproduce every field byte-for-byte)
    // ------------------------------------------------------------------

    // Fixed, block-independent inputs.
    uint128 internal constant FIX_REQ_START = 1_790_000_000;
    uint128 internal constant FIX_REQ_END = 1_790_003_600;
    bytes32 internal constant FIX_UID = keccak256("roebel.app/passkey-handover/fixture");

    function test_writeVector() public {
        address eoa = vm.addr(EOA_KEY);
        address legacy = IThirdwebAccountFactory(TW_FACTORY).getAddress(eoa, "");

        // --- Handover request (fixed) ---
        SignerPermissionRequest memory req = _permissionRequest(safe, 1, FIX_REQ_START, FIX_REQ_END, FIX_UID);
        bytes32 handoverDigest = _handoverDigest(legacy, req);
        bytes memory handoverSig = _signHandover(EOA_KEY, legacy, req);
        // Verify the digest against the REAL Account bytecode (recover == eoa, success == isAdmin && !executed).
        IThirdwebAccountFactory(TW_FACTORY).createAccount(eoa, "");
        (bool okReq, address recovered) = IThirdwebAccount(legacy).verifySignerPermissionRequest(req, handoverSig);
        assertTrue(okReq, "verifySignerPermissionRequest must succeed");
        assertEq(recovered, eoa, "handover digest mismatch vs real Account");
        bytes memory setPermissionsCallData = abi.encodeCall(IThirdwebAccount.setPermissionsForSigner, (req, handoverSig));
        bytes memory userOpCallData = _executeUserOpCallData(legacy, 0, setPermissionsCallData);

        // --- Fixed userOp (stub paymasterAndData = paymaster ++ gas limits ++ 320 zero bytes) ---
        PackedUserOperation memory op =
            _buildOp(safe, 0, _safeInitCode(initializer, SAFE_SALT_NONCE), userOpCallData);
        op.paymasterAndData = abi.encodePacked(PAYMASTER, PM_VERIFICATION_GAS, PM_POST_OP_GAS, new bytes(320));
        op.signature = abi.encodePacked(uint48(0), uint48(0));
        bytes32 safeOpHash = module4337.getOperationHash(op);
        assertEq(safeOpHash, _safeOpHash(op, 0, 0));

        // --- WebAuthn signature over the fixed op hash ---
        WebAuthnParts memory p = _webAuthnSign(PASSKEY_PK, safeOpHash);
        assertEq(
            ISafeWebAuthnSignerFactory(SIGNER_FACTORY).isValidSignatureForSigner(
                safeOpHash, p.webAuthnSignature, x, y, VERIFIERS
            ),
            bytes4(0x1626ba7e),
            "encoded WebAuthn signature must verify on the real SignerFactory"
        );
        bytes memory safeSignature = WebAuthnHelper.safeContractSignature(SHARED_SIGNER, p.webAuthnSignature);
        bytes memory userOpSig = WebAuthnHelper.userOpSignature(0, 0, safeSignature);

        _writeVectorJson(req, legacy, eoa, handoverDigest, handoverSig, setPermissionsCallData, op, safeOpHash, p, safeSignature, userOpSig);
    }

    function _writeVectorJson(
        SignerPermissionRequest memory req,
        address legacy,
        address eoa,
        bytes32 handoverDigest,
        bytes memory handoverSig,
        bytes memory setPermissionsCallData,
        PackedUserOperation memory op,
        bytes32 safeOpHash,
        WebAuthnParts memory p,
        bytes memory safeSignature,
        bytes memory userOpSig
    ) internal {
        string memory h = "handover";
        vm.serializeString(h, "_note", "EIP-712 SignerPermissionRequest on the legacy thirdweb Account, domain {name:'Account',version:'1',chainId:100,verifyingContract:legacyAccount}. approvedTargets is hashed as keccak256(abi.encodePacked(address[])). Digest + signature verified against the real Account bytecode via verifySignerPermissionRequest on a Gnosis fork.");
        vm.serializeString(h, "eoaPrivateKey", "0x00000000000000000000000000000000000000000000000000000000000a11ce");
        vm.serializeAddress(h, "eoa", eoa);
        vm.serializeAddress(h, "legacyAccount", legacy);
        vm.serializeAddress(h, "signer", req.signer);
        vm.serializeString(h, "isAdmin", "1");
        vm.serializeString(h, "approvedTargets", "[]");
        vm.serializeString(h, "nativeTokenLimitPerTransaction", "0");
        vm.serializeString(h, "permissionStartTimestamp", "0");
        vm.serializeString(h, "permissionEndTimestamp", "0");
        vm.serializeString(h, "reqValidityStartTimestamp", vm.toString(uint256(req.reqValidityStartTimestamp)));
        vm.serializeString(h, "reqValidityEndTimestamp", vm.toString(uint256(req.reqValidityEndTimestamp)));
        vm.serializeString(h, "_uidNote", "uid = keccak256(\"roebel.app/passkey-handover/fixture\")");
        vm.serializeBytes32(h, "uid", req.uid);
        vm.serializeBytes32(h, "digest", handoverDigest);
        vm.serializeBytes(h, "signature", handoverSig);
        string memory handoverJson = vm.serializeBytes(h, "setPermissionsForSignerCallData", setPermissionsCallData);

        string memory u = "userOp";
        vm.serializeString(u, "_note", "Fixed v0.7 PackedUserOperation (first op: deploy + handover). paymasterAndData is a 372-byte STUB (paymaster ++ uint128 pmVerificationGasLimit ++ uint128 pmPostOpGasLimit ++ 320 zero bytes). signature prefix validAfter=0, validUntil=0. safeOpHash = Safe4337Module(0x75cf...c226).getOperationHash(op) on the real module.");
        vm.serializeAddress(u, "sender", op.sender);
        vm.serializeString(u, "nonce", vm.toString(op.nonce));
        vm.serializeBytes(u, "initCode", op.initCode);
        vm.serializeBytes(u, "callData", op.callData);
        vm.serializeBytes32(u, "accountGasLimits", op.accountGasLimits);
        vm.serializeString(u, "verificationGasLimit", vm.toString(uint256(VERIFICATION_GAS)));
        vm.serializeString(u, "callGasLimit", vm.toString(uint256(CALL_GAS)));
        vm.serializeString(u, "preVerificationGas", vm.toString(op.preVerificationGas));
        vm.serializeBytes32(u, "gasFees", op.gasFees);
        vm.serializeString(u, "maxPriorityFeePerGas", vm.toString(uint256(MAX_PRIORITY_FEE)));
        vm.serializeString(u, "maxFeePerGas", vm.toString(uint256(MAX_FEE)));
        vm.serializeBytes(u, "paymasterAndData", op.paymasterAndData);
        vm.serializeString(u, "validAfter", "0");
        vm.serializeString(u, "validUntil", "0");
        string memory userOpJson = vm.serializeBytes32(u, "safeOpHash", safeOpHash);

        string memory w = "webauthn";
        vm.serializeString(w, "_note", "Inputs: challenge = userOp.safeOpHash; authenticatorData = sha256('id.ortis.app') ++ 0x05 (UP|UV) ++ uint32 signCount 0; clientDataJSON = bytes of clientDataJSONHex; (r,s) from P-256 key passkeyPrivateKey over signingDigest = sha256(authenticatorData ++ sha256(clientDataJSON)), s normalized to low-s. clientDataFields = clientDataJSON minus the leading '{\"type\":\"webauthn.get\",\"challenge\":\"<b64url>\",' and the trailing '}'. webAuthnSignature = abi.encode(bytes authenticatorData, string clientDataFields, uint256 r, uint256 s) (verified on the real SafeWebAuthnSignerFactory.isValidSignatureForSigner). safeSignature = bytes32(owner) ++ bytes32(65) ++ 0x00 ++ uint256(len) ++ webAuthnSignature with owner = SafeWebAuthnSharedSigner. userOpSignature = uint48 validAfter ++ uint48 validUntil ++ safeSignature.");
        vm.serializeBytes32(w, "challenge", p.challenge);
        vm.serializeBytes(w, "authenticatorData", p.authenticatorData);
        vm.serializeString(w, "_clientDataJSONNote", "clientDataJSONHex is the exact UTF-8 bytes of clientDataJSON (stored as hex because forge's JSON writer would re-parse a JSON string into an object and lose byte-exactness).");
        vm.serializeBytes(w, "clientDataJSONHex", bytes(p.clientDataJSON));
        vm.serializeString(w, "clientDataFields", p.clientDataFields);
        vm.serializeBytes32(w, "signingDigest", p.digest);
        vm.serializeBytes32(w, "r", bytes32(p.r));
        vm.serializeBytes32(w, "s", bytes32(p.s));
        vm.serializeBytes(w, "webAuthnSignature", p.webAuthnSignature);
        vm.serializeBytes(w, "safeSignature", safeSignature);
        string memory webauthnJson = vm.serializeBytes(w, "userOpSignature", userOpSig);

        string memory a = "addresses";
        vm.serializeAddress(a, "entryPoint", ENTRY_POINT);
        vm.serializeAddress(a, "safeSingletonL2", SAFE_L2_SINGLETON);
        vm.serializeAddress(a, "safeProxyFactory", SAFE_PROXY_FACTORY);
        vm.serializeAddress(a, "multiSend", MULTI_SEND);
        vm.serializeAddress(a, "safe4337Module", SAFE_4337_MODULE);
        vm.serializeAddress(a, "safeModuleSetup", SAFE_MODULE_SETUP);
        vm.serializeAddress(a, "sharedSigner", SHARED_SIGNER);
        vm.serializeAddress(a, "signerFactory", SIGNER_FACTORY);
        vm.serializeAddress(a, "fclP256Verifier", FCL_VERIFIER);
        vm.serializeAddress(a, "socialRecoveryModule", SOCIAL_RECOVERY);
        vm.serializeAddress(a, "paymaster", PAYMASTER);
        string memory addressesJson = vm.serializeAddress(a, "thirdwebAccountFactory", TW_FACTORY);

        string memory root = "root";
        vm.serializeString(root, "_description", "Golden vector for the passkey Safe (Task 1 -> Task 3). Produced by test/PasskeySafeSponsored.t.sol::test_writeVector against real Gnosis (chain 100) bytecode on a fork. Task 3 TypeScript must reproduce safeAddress, setupData, initCode, handover.digest, userOp.safeOpHash and webauthn.* byte-for-byte. uint fields are decimal strings; x/y/verifiers are 0x-hex.");
        vm.serializeString(root, "_privateKeyNote", "passkeyPrivateKey (P-256) and handover.eoaPrivateKey (secp256k1) are TEST-ONLY constants; never use them for anything real.");
        vm.serializeString(root, "chainId", "100");
        vm.serializeString(root, "rpId", RP_ID);
        vm.serializeString(root, "passkeyPrivateKey", "0x0000000000000000000000000000000000000000000000000000000000c0ffee");
        vm.serializeBytes32(root, "x", bytes32(x));
        vm.serializeBytes32(root, "y", bytes32(y));
        vm.serializeString(root, "_verifiersNote", "uint176: (0x0100 << 160) | FCLP256Verifier");
        vm.serializeString(root, "verifiers", vm.toString(abi.encodePacked(VERIFIERS)));
        vm.serializeString(root, "saltNonce", vm.toString(SAFE_SALT_NONCE));
        vm.serializeString(root, "_setupDataNote", "Safe.setup(owners=[SharedSigner], threshold=1, to=MultiSend, data=multiSend([delegatecall SafeModuleSetup.enableModules([Safe4337Module, SocialRecoveryModule]), delegatecall SharedSigner.configure({x,y,verifiers})]), fallbackHandler=Safe4337Module, 0, 0, 0). multiSend tx packing: uint8 op ++ address to ++ uint256 value ++ uint256 dataLength ++ data.");
        vm.serializeBytes(root, "setupData", initializer);
        vm.serializeAddress(root, "safeAddress", safe);
        vm.serializeBytes(root, "initCode", _safeInitCode(initializer, SAFE_SALT_NONCE));
        vm.serializeString(root, "addresses", addressesJson);
        vm.serializeString(root, "handover", handoverJson);
        vm.serializeString(root, "userOp", userOpJson);
        string memory out = vm.serializeString(root, "webauthn", webauthnJson);
        vm.writeJson(out, VECTOR_PATH);
    }
}
