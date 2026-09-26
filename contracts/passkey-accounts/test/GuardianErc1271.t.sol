// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {console2} from "forge-std/console2.sol";
import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {WebAuthnHelper} from "./utils/WebAuthnHelper.sol";
import {
    PackedUserOperation,
    ISafe,
    ISafeProxyFactory,
    IERC1271,
    ICompatibilityFallbackHandler,
    ISocialRecoveryModule,
    ISafeWebAuthnSignerFactory
} from "./utils/Interfaces.sol";

/// @notice Step 0 of the recovery design: ERC-1271 on a passkey Safe, proven on a Gnosis fork.
///
/// A passkey Safe (owner SafeWebAuthnSharedSigner, fallback handler Safe4337Module v0.3.0) answers
/// `isValidSignature(bytes32 h, bytes sig)` with 0x1626ba7e. Safe4337Module inherits Safe's
/// CompatibilityFallbackHandler 1.4.1, which checks the Safe's own signatures over the Safe's
/// EIP-712 `SafeMessage(bytes message)` hash with `message = abi.encode(h)`. The WebAuthn challenge
/// is therefore that SafeMessage hash, and the signature is the ordinary one-owner Safe contract
/// signature (r = owner, s = 65, v = 0, len ++ WebAuthn signature), exactly as for userOps.
///
/// With that, guardian passkey Safes approve a Candide recovery OFF-CHAIN (signing `getRecoveryHash`)
/// and the recovering person's NEW passkey Safe submits one sponsored userOp:
/// `createSigner(newKey)` + `multiConfirmRecovery(wallet, [signer(newKey)], 1, sigs, true)`.
/// Three days later a second sponsored userOp calls `finalizeRecovery(wallet)`; after that the
/// recovered wallet signs userOps through its per-key signer (not the SharedSigner).
///
/// `test_writeRecoveryVector` writes `test/fixtures/recovery-vector.json` for the Expo library.
contract GuardianErc1271Test is PasskeySafeBase {
    /// keccak256("SafeMessage(bytes message)") — Safe CompatibilityFallbackHandler 1.4.1.
    bytes32 internal constant SAFE_MSG_TYPEHASH = 0x60b3cbf8b4a223d68d641b3b6ddf9a298e7f33710cf3d3a9d1146b5a6150fbca;
    /// keccak256("ExecuteRecovery(address wallet,address[] newOwners,uint256 newThreshold,uint256 nonce)")
    bytes32 internal constant EXECUTE_RECOVERY_TYPEHASH =
        0x124b64921a7c7e677c6cc3b132eaaa57130bc6fc05ab157f35fe5264a7c198d5;
    address internal constant MULTI_SEND_CALL_ONLY = 0x9641d764fc13c8B624c04430C7356C1C7C8102e2;
    uint256 internal constant RECOVERY_PERIOD = 259200;

    uint256 internal constant GUARDIAN1_PK = 0xA1;
    uint256 internal constant GUARDIAN2_PK = 0xA2;
    uint256 internal constant FAMILY_PK = 0xA3;
    uint256 internal constant NEW_PASSKEY_PK = 0xC0FFEE3;
    string internal constant VECTOR_PATH = "./test/fixtures/recovery-vector.json";

    ISocialRecoveryModule internal srm = ISocialRecoveryModule(SOCIAL_RECOVERY);

    address internal wallet; // the passkey Safe being recovered (key PASSKEY_PK)
    address internal guardian1; // deployed guardian passkey Safes
    address internal guardian2;
    address internal family; // COUNTERFACTUAL guardian passkey Safe (a family member)
    address internal newSafe; // the recovering person's fresh counterfactual passkey Safe (new key)
    uint256 internal newX;
    uint256 internal newY;
    address internal newSigner; // SafeWebAuthnSignerFactory.getSigner(newX, newY, VERIFIERS)
    address[] internal newOwners;

    function setUp() public {
        _fork();
        _takeOverSponsorSigner();
        wallet = _deployPasskeySafe(PASSKEY_PK);
        guardian1 = _deployPasskeySafe(GUARDIAN1_PK);
        guardian2 = _deployPasskeySafe(GUARDIAN2_PK);
        family = _passkeySafeAddress(FAMILY_PK);
        assertEq(family.code.length, 0, "family Safe stays counterfactual");

        (newX, newY) = vm.publicKeyP256(NEW_PASSKEY_PK);
        newSafe = _predictSafe(_passkeySafeInitializer(newX, newY), SAFE_SALT_NONCE);
        newSigner = ISafeWebAuthnSignerFactory(SIGNER_FACTORY).getSigner(newX, newY, VERIFIERS);
        newOwners.push(newSigner);

        // The wallet owner adds three guardians, threshold 2 (plain module calls via the Safe's
        // own userOps are covered in SocialRecovery.t.sol; here the SRM is driven directly).
        vm.startPrank(wallet);
        srm.addGuardianWithThreshold(guardian1, 1);
        srm.addGuardianWithThreshold(guardian2, 1);
        srm.addGuardianWithThreshold(family, 2);
        vm.stopPrank();
        assertEq(srm.threshold(wallet), 2);
        assertEq(srm.guardiansCount(wallet), 3);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    function _passkeySafeAddress(uint256 pk) internal pure returns (address) {
        (uint256 px, uint256 py) = vm.publicKeyP256(pk);
        return _predictSafe(_passkeySafeInitializer(px, py), SAFE_SALT_NONCE);
    }

    function _deployPasskeySafe(uint256 pk) internal returns (address s) {
        (uint256 px, uint256 py) = vm.publicKeyP256(pk);
        s = ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(
            SAFE_L2_SINGLETON, _passkeySafeInitializer(px, py), SAFE_SALT_NONCE
        );
    }

    /// Safe EIP-712 SafeMessage hash for ERC-1271 over `h` (message = abi.encode(h)).
    function _safeMessageHash(address safe, bytes32 h) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(keccak256("EIP712Domain(uint256 chainId,address verifyingContract)"), block.chainid, safe)
        );
        bytes32 structHash = keccak256(abi.encode(SAFE_MSG_TYPEHASH, keccak256(abi.encode(h))));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domain, structHash));
    }

    /// The Safe ERC-1271 signature over `h` from the passkey `pk` through `owner`.
    function _sign1271(uint256 pk, address safe, address owner, bytes32 h)
        internal
        view
        returns (bytes memory sig, WebAuthnParts memory p)
    {
        p = _webAuthnSign(pk, _safeMessageHash(safe, h));
        sig = WebAuthnHelper.safeContractSignature(owner, p.webAuthnSignature);
    }

    function _recoveryHashLocal(address w, address[] memory owners, uint256 t, uint256 n)
        internal
        view
        returns (bytes32)
    {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Social Recovery Module"),
                keccak256("0.0.1"),
                block.chainid,
                SOCIAL_RECOVERY
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(EXECUTE_RECOVERY_TYPEHASH, w, keccak256(abi.encodePacked(owners)), t, n));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domain, structHash));
    }

    /// Guardian approvals sorted by signer address (SRM requires strictly increasing signers).
    function _approvals(bytes32 recoveryHash) internal view returns (ISocialRecoveryModule.SignatureData[] memory sigs) {
        (bytes memory s1,) = _sign1271(GUARDIAN1_PK, guardian1, SHARED_SIGNER, recoveryHash);
        (bytes memory s2,) = _sign1271(GUARDIAN2_PK, guardian2, SHARED_SIGNER, recoveryHash);
        sigs = new ISocialRecoveryModule.SignatureData[](2);
        (sigs[0], sigs[1]) = guardian1 < guardian2
            ? (ISocialRecoveryModule.SignatureData(guardian1, s1), ISocialRecoveryModule.SignatureData(guardian2, s2))
            : (ISocialRecoveryModule.SignatureData(guardian2, s2), ISocialRecoveryModule.SignatureData(guardian1, s1));
    }

    function _multiSendCallOnly(bytes memory txs) internal pure returns (bytes memory) {
        return abi.encodeWithSignature(
            "executeUserOp(address,uint256,bytes,uint8)",
            MULTI_SEND_CALL_ONLY,
            uint256(0),
            abi.encodeWithSignature("multiSend(bytes)", txs),
            uint8(1)
        );
    }

    /// Sponsored userOp from `sender` (deployed or counterfactual via `initCode`), signed by `pk` via `owner`.
    function _sponsoredOp(
        address sender,
        bytes memory initCode,
        bytes memory callData,
        uint256 pk,
        address owner,
        uint128 callGas
    ) internal returns (PackedUserOperation memory op) {
        op = _buildOp(sender, entryPoint.getNonce(sender, 0), initCode, callData);
        op.accountGasLimits = bytes32((uint256(VERIFICATION_GAS) << 128) | callGas);
        _sponsor(op);
        _signOp(op, pk, owner);
    }

    function _recoveryBatch(ISocialRecoveryModule.SignatureData[] memory sigs) internal view returns (bytes memory) {
        return _multiSendCallOnly(
            abi.encodePacked(
                _multiSendTx(
                    0,
                    SIGNER_FACTORY,
                    0,
                    abi.encodeCall(ISafeWebAuthnSignerFactory.createSigner, (newX, newY, VERIFIERS))
                ),
                _multiSendTx(
                    0,
                    SOCIAL_RECOVERY,
                    0,
                    abi.encodeCall(ISocialRecoveryModule.multiConfirmRecovery, (wallet, newOwners, 1, sigs, true))
                )
            )
        );
    }

    // ------------------------------------------------------------------
    // ERC-1271
    // ------------------------------------------------------------------

    function test_passkeySafeAnswersErc1271() public view {
        bytes32 h = keccak256("any 32-byte message");
        // Local SafeMessage hash == the handler's own computation.
        assertEq(
            _safeMessageHash(guardian1, h),
            ICompatibilityFallbackHandler(SAFE_4337_MODULE).getMessageHashForSafe(guardian1, abi.encode(h)),
            "local SafeMessage hash != CompatibilityFallbackHandler.getMessageHashForSafe"
        );
        (bytes memory sig,) = _sign1271(GUARDIAN1_PK, guardian1, SHARED_SIGNER, h);
        assertEq(IERC1271(guardian1).isValidSignature(h, sig), bytes4(0x1626ba7e), "ERC-1271 magic value");
    }

    function test_erc1271RejectsWrongKeyOrRawHash() public {
        bytes32 h = keccak256("any 32-byte message");
        // Signed by another passkey → the Safe's checkSignatures reverts inside the handler.
        (bytes memory wrongKey,) = _sign1271(GUARDIAN2_PK, guardian1, SHARED_SIGNER, h);
        vm.expectRevert();
        IERC1271(guardian1).isValidSignature(h, wrongKey);
        // Challenge = the raw hash instead of the SafeMessage hash → rejected as well.
        WebAuthnParts memory p = _webAuthnSign(GUARDIAN1_PK, h);
        bytes memory raw = WebAuthnHelper.safeContractSignature(SHARED_SIGNER, p.webAuthnSignature);
        vm.expectRevert();
        IERC1271(guardian1).isValidSignature(h, raw);
    }

    // ------------------------------------------------------------------
    // Candide recovery with off-chain passkey-guardian approvals
    // ------------------------------------------------------------------

    function test_recoveryHashMatchesCandide() public view {
        assertEq(
            srm.getRecoveryHash(wallet, newOwners, 1, srm.nonce(wallet)),
            _recoveryHashLocal(wallet, newOwners, 1, srm.nonce(wallet)),
            "local recovery hash != SRM.getRecoveryHash"
        );
    }

    function test_guardianApprovalAcceptedBySrm() public view {
        bytes32 rh = srm.getRecoveryHash(wallet, newOwners, 1, srm.nonce(wallet));
        (bytes memory s1,) = _sign1271(GUARDIAN1_PK, guardian1, SHARED_SIGNER, rh);
        srm.validateGuardianSignature(wallet, rh, guardian1, s1); // reverts on failure
    }

    function test_sponsoredMultiConfirmFromNewSafe_thenFinalize() public {
        bytes32 rh = srm.getRecoveryHash(wallet, newOwners, 1, srm.nonce(wallet));
        ISocialRecoveryModule.SignatureData[] memory sigs = _approvals(rh);

        // One sponsored op from the NEW passkey Safe: deploy it + createSigner + multiConfirmRecovery(execute).
        PackedUserOperation memory op = _sponsoredOp(
            newSafe,
            _safeInitCode(_passkeySafeInitializer(newX, newY), SAFE_SALT_NONCE),
            _recoveryBatch(sigs),
            NEW_PASSKEY_PK,
            SHARED_SIGNER,
            1_500_000
        );
        uint256 gasUsed = _handleOp(op);
        console2.log("deploy newSafe + createSigner + multiConfirmRecovery (FCL fallback) gas:", gasUsed);
        assertGt(newSafe.code.length, 0, "new Safe deployed");
        assertGt(newSigner.code.length, 0, "per-key signer deployed");
        assertEq(srm.getRecoveryRequest(wallet).executeAfter, uint64(block.timestamp + RECOVERY_PERIOD), "delay started");
        assertTrue(srm.hasGuardianApproved(wallet, guardian1, newOwners, 1) == false, "nonce moved on");

        // After the delay: a second sponsored op from the new Safe finalizes.
        vm.warp(block.timestamp + RECOVERY_PERIOD + 1);
        op = _sponsoredOp(
            newSafe,
            "",
            _executeUserOpCallData(SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.finalizeRecovery, (wallet))),
            NEW_PASSKEY_PK,
            SHARED_SIGNER,
            500_000
        );
        _handleOp(op);
        address[] memory owners = ISafe(wallet).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], newSigner, "wallet owner = per-key signer of the new passkey");

        // The recovered wallet signs userOps via the per-key signer (the signature's static part names it).
        address recipient = makeAddr("recipient");
        vm.deal(wallet, 1 wei);
        op = _sponsoredOp(wallet, "", _executeUserOpCallData(recipient, 1 wei, ""), NEW_PASSKEY_PK, newSigner, 500_000);
        _handleOp(op);
        assertEq(recipient.balance, 1);

        // ...and ERC-1271 on the recovered wallet works through the per-key signer too.
        bytes32 h = keccak256("after recovery");
        (bytes memory sig,) = _sign1271(NEW_PASSKEY_PK, wallet, newSigner, h);
        assertEq(IERC1271(wallet).isValidSignature(h, sig), bytes4(0x1626ba7e));
    }

    function test_undeployedGuardianCannotSignOffchain_confirmsOnchainInstead() public {
        bytes32 rh = srm.getRecoveryHash(wallet, newOwners, 1, srm.nonce(wallet));
        (bytes memory sf,) = _sign1271(FAMILY_PK, family, SHARED_SIGNER, rh);
        // No code at the counterfactual Safe → OZ SignatureChecker falls back to ECDSA and fails.
        vm.expectRevert(bytes("SM: Invalid guardian signature"));
        srm.validateGuardianSignature(wallet, rh, family, sf);

        // The family member's own sponsored op deploys their Safe and confirms on-chain (msg.sender path).
        PackedUserOperation memory op = _sponsoredOp(
            family,
            _safeInitCode(_passkeySafeInitializer(_x(FAMILY_PK), _y(FAMILY_PK)), SAFE_SALT_NONCE),
            _executeUserOpCallData(
                SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.confirmRecovery, (wallet, newOwners, 1, false))
            ),
            FAMILY_PK,
            SHARED_SIGNER,
            500_000
        );
        _handleOp(op);
        assertTrue(srm.hasGuardianApproved(wallet, family, newOwners, 1), "family confirmed on-chain");

        // One off-chain passkey approval + the on-chain confirmation reach threshold 2.
        (bytes memory s1,) = _sign1271(GUARDIAN1_PK, guardian1, SHARED_SIGNER, rh);
        ISocialRecoveryModule.SignatureData[] memory sigs = new ISocialRecoveryModule.SignatureData[](1);
        sigs[0] = ISocialRecoveryModule.SignatureData(guardian1, s1);
        op = _sponsoredOp(
            newSafe,
            _safeInitCode(_passkeySafeInitializer(newX, newY), SAFE_SALT_NONCE),
            _recoveryBatch(sigs),
            NEW_PASSKEY_PK,
            SHARED_SIGNER,
            1_500_000
        );
        _handleOp(op);
        assertGt(srm.getRecoveryRequest(wallet).executeAfter, 0, "recovery started");
    }

    function test_approvalsForOtherOwnersOrNonceAreRejected() public {
        bytes32 rh = srm.getRecoveryHash(wallet, newOwners, 1, srm.nonce(wallet));
        ISocialRecoveryModule.SignatureData[] memory sigs = _approvals(rh);
        address[] memory attackerOwners = new address[](1);
        attackerOwners[0] = makeAddr("attacker");
        vm.expectRevert(bytes("SM: Invalid guardian signature"));
        srm.multiConfirmRecovery(wallet, attackerOwners, 1, sigs, true);

        // The owner invalidates the nonce → the collected approvals are dead.
        vm.prank(wallet);
        (bool ok,) = SOCIAL_RECOVERY.call(abi.encodeWithSignature("invalidateNonce()"));
        assertTrue(ok);
        vm.expectRevert(bytes("SM: Invalid guardian signature"));
        srm.multiConfirmRecovery(wallet, newOwners, 1, sigs, true);
    }

    function _x(uint256 pk) internal pure returns (uint256 px) {
        (px,) = vm.publicKeyP256(pk);
    }

    function _y(uint256 pk) internal pure returns (uint256 py) {
        (, py) = vm.publicKeyP256(pk);
    }

    // ------------------------------------------------------------------
    // Fixture for Expo (apps/expo/lib/passkey/guardians.ts + userop.ts)
    // ------------------------------------------------------------------

    function test_writeRecoveryVector() public {
        uint256 n = srm.nonce(wallet);
        bytes32 rh = srm.getRecoveryHash(wallet, newOwners, 1, n);
        (bytes memory g1Sig, WebAuthnParts memory p) = _sign1271(GUARDIAN1_PK, guardian1, SHARED_SIGNER, rh);
        srm.validateGuardianSignature(wallet, rh, guardian1, g1Sig);
        ISocialRecoveryModule.SignatureData[] memory sigs = _approvals(rh);
        bytes memory multiConfirm =
            abi.encodeCall(ISocialRecoveryModule.multiConfirmRecovery, (wallet, newOwners, 1, sigs, true));

        // Post-recovery userOp vector: fixed op from the recovered wallet, signed through newSigner.
        PackedUserOperation memory op = _buildOp(wallet, 7, "", _executeUserOpCallData(makeAddr("recipient"), 1, ""));
        op.paymasterAndData = abi.encodePacked(PAYMASTER, PM_VERIFICATION_GAS, PM_POST_OP_GAS, new bytes(320));
        op.signature = abi.encodePacked(uint48(0), uint48(0));
        bytes32 opHash = module4337.getOperationHash(op);
        WebAuthnParts memory q = _webAuthnSign(NEW_PASSKEY_PK, opHash);
        bytes memory userOpSig =
            WebAuthnHelper.userOpSignature(0, 0, WebAuthnHelper.safeContractSignature(newSigner, q.webAuthnSignature));
        assertEq(
            ISafeWebAuthnSignerFactory(SIGNER_FACTORY).isValidSignatureForSigner(
                opHash, q.webAuthnSignature, newX, newY, VERIFIERS
            ),
            bytes4(0x1626ba7e)
        );

        string memory g = "guardianApproval";
        vm.serializeString(
            g,
            "_recipe",
            "1) recoveryHash = SRM.getRecoveryHash(wallet,newOwners,newThreshold,SRM.nonce(wallet)) = keccak256(0x1901 ++ srmDomainSeparator ++ keccak256(abi.encode(EXECUTE_RECOVERY_TYPEHASH, wallet, keccak256(abi.encodePacked(newOwners)), newThreshold, nonce))), domain EIP712Domain(string name,string version,uint256 chainId,address verifyingContract) = ('Social Recovery Module','0.0.1',100,SRM). 2) challenge = safeMessageHash = keccak256(0x1901 ++ keccak256(abi.encode(keccak256('EIP712Domain(uint256 chainId,address verifyingContract)'),100,guardianSafe)) ++ keccak256(abi.encode(SAFE_MSG_TYPEHASH, keccak256(abi.encode(recoveryHash))))). 3) WebAuthn-sign the challenge with the guardian's passkey (same authenticatorData / clientDataJSON rules as userOps). 4) guardianSignature = bytes32(owner) ++ bytes32(65) ++ 0x00 ++ uint256(len) ++ abi.encode(authenticatorData, clientDataFields, r, s) with owner = SharedSigner (or the guardian's per-key signer after its own recovery). 5) SRM.multiConfirmRecovery(wallet, newOwners, newThreshold, [(signer, signature)] sorted by signer ascending, true). The guardian Safe MUST be deployed (no code = rejected)."
        );
        vm.serializeBytes32(g, "safeMsgTypehash", SAFE_MSG_TYPEHASH);
        vm.serializeBytes32(g, "executeRecoveryTypehash", EXECUTE_RECOVERY_TYPEHASH);
        vm.serializeBytes32(g, "srmDomainSeparator", srm.domainSeparator());
        vm.serializeString(g, "guardianPasskeyPrivateKey", vm.toString(bytes32(GUARDIAN1_PK)));
        vm.serializeBytes32(g, "guardianX", bytes32(_x(GUARDIAN1_PK)));
        vm.serializeBytes32(g, "guardianY", bytes32(_y(GUARDIAN1_PK)));
        vm.serializeAddress(g, "guardianSafe", guardian1);
        vm.serializeBytes32(g, "guardianSafeDomainSeparator", ISafe(guardian1).domainSeparator());
        vm.serializeAddress(g, "wallet", wallet);
        vm.serializeAddress(g, "newOwner", newSigner);
        vm.serializeString(g, "newThreshold", "1");
        vm.serializeString(g, "nonce", vm.toString(n));
        vm.serializeBytes32(g, "recoveryHash", rh);
        vm.serializeBytes32(g, "safeMessageHash", p.challenge);
        vm.serializeBytes(g, "authenticatorData", p.authenticatorData);
        vm.serializeBytes(g, "clientDataJSONHex", bytes(p.clientDataJSON));
        vm.serializeString(g, "clientDataFields", p.clientDataFields);
        vm.serializeBytes32(g, "r", bytes32(p.r));
        vm.serializeBytes32(g, "s", bytes32(p.s));
        vm.serializeBytes(g, "webAuthnSignature", p.webAuthnSignature);
        string memory gJson = vm.serializeBytes(g, "guardianSignature", g1Sig);

        string memory m = "multiConfirm";
        vm.serializeString(m, "_note", "Both deployed guardians (keys 0xA1, 0xA2) approve; signatures sorted by signer address. Accepted by the real SRM on the fork.");
        vm.serializeAddress(m, "guardian2Safe", guardian2);
        string memory mJson = vm.serializeBytes(m, "callData", multiConfirm);

        string memory u = "postRecoveryUserOp";
        vm.serializeString(u, "_note", "Fixed op from the RECOVERED wallet (owner = per-key signer newOwner). The Safe contract signature's static part names newOwner, not the SharedSigner. paymasterAndData = 372-byte stub; validAfter = validUntil = 0.");
        vm.serializeAddress(u, "sender", op.sender);
        vm.serializeString(u, "nonce", vm.toString(op.nonce));
        vm.serializeBytes(u, "callData", op.callData);
        vm.serializeString(u, "verificationGasLimit", vm.toString(uint256(VERIFICATION_GAS)));
        vm.serializeString(u, "callGasLimit", vm.toString(uint256(CALL_GAS)));
        vm.serializeString(u, "preVerificationGas", vm.toString(op.preVerificationGas));
        vm.serializeString(u, "maxPriorityFeePerGas", vm.toString(uint256(MAX_PRIORITY_FEE)));
        vm.serializeString(u, "maxFeePerGas", vm.toString(uint256(MAX_FEE)));
        vm.serializeBytes(u, "paymasterAndData", op.paymasterAndData);
        vm.serializeBytes32(u, "safeOpHash", opHash);
        vm.serializeBytes(u, "authenticatorData", q.authenticatorData);
        vm.serializeBytes(u, "clientDataJSONHex", bytes(q.clientDataJSON));
        vm.serializeBytes32(u, "r", bytes32(q.r));
        vm.serializeBytes32(u, "s", bytes32(q.s));
        string memory uJson = vm.serializeBytes(u, "userOpSignature", userOpSig);

        string memory root = "recovery";
        vm.serializeString(root, "_description", "Recovery golden vector, written by test/GuardianErc1271.t.sol::test_writeRecoveryVector against real Gnosis bytecode on a fork. Expo guardians.ts / userop.ts must reproduce it byte-for-byte. All private keys are TEST-ONLY.");
        vm.serializeString(root, "chainId", "100");
        vm.serializeAddress(root, "socialRecoveryModule", SOCIAL_RECOVERY);
        vm.serializeAddress(root, "signerFactory", SIGNER_FACTORY);
        vm.serializeString(root, "verifiers", vm.toString(abi.encodePacked(VERIFIERS)));
        vm.serializeString(root, "walletPasskeyPrivateKey", vm.toString(bytes32(PASSKEY_PK)));
        vm.serializeString(root, "newPasskeyPrivateKey", vm.toString(bytes32(NEW_PASSKEY_PK)));
        vm.serializeBytes32(root, "newX", bytes32(newX));
        vm.serializeBytes32(root, "newY", bytes32(newY));
        vm.serializeAddress(root, "newSafe", newSafe);
        vm.serializeString(root, "guardianApproval", gJson);
        vm.serializeString(root, "multiConfirm", mJson);
        string memory out = vm.serializeString(root, "postRecoveryUserOp", uJson);
        vm.writeJson(out, VECTOR_PATH);
    }
}
