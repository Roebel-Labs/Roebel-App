// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    PackedUserOperation,
    SignerPermissionRequest,
    IEntryPointV07,
    IThirdwebAccountFactory,
    IThirdwebAccount,
    ISafe,
    ISafeProxyFactory,
    IMultiSend,
    ISafeModuleSetup,
    ISafe4337Module,
    ISafeWebAuthnSharedSigner,
    ISafeWebAuthnSignerFactory,
    INetizenVerifyingPaymaster
} from "./Interfaces.sol";
import {WebAuthnHelper} from "./WebAuthnHelper.sol";

/// @notice Shared fork fixtures: real Gnosis addresses, passkey-Safe construction,
///         Safe4337Module userOps, WebAuthn signing and NetizenVerifyingPaymaster vouchers.
abstract contract PasskeySafeBase is Test {
    // ---- Gnosis chain 100, all verified to have code (2026-09-26) ----
    address internal constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address internal constant TW_FACTORY = 0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00;
    address internal constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address internal constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address internal constant MULTI_SEND = 0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526;
    address internal constant SAFE_4337_MODULE = 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226;
    address internal constant SAFE_MODULE_SETUP = 0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47;
    address internal constant SHARED_SIGNER = 0x94a4F6affBd8975951142c3999aEAB7ecee555c2;
    address internal constant SIGNER_FACTORY = 0x1d31F259eE307358a26dFb23EB365939E8641195;
    address internal constant FCL_VERIFIER = 0xA86e0054C51E4894D88762a017ECc5E5235f5DBA;
    address internal constant P256_PRECOMPILE = 0x0000000000000000000000000000000000000100;
    address internal constant SOCIAL_RECOVERY = 0x38275826E1933303E508433dD5f289315Da2541c;
    address internal constant PAYMASTER = 0x11ed03Db610c88b010FfE38B13142D3657f2E84f;
    address internal constant LIVE_SPONSOR_SIGNER = 0x218B0a592f2078Aa542d7B981638595DF6bA8bF7;

    /// @dev precompile 0x100 (hi 16 bits) | FCL fallback (lo 160 bits).
    uint176 internal constant VERIFIERS = (uint176(0x0100) << 160) | uint176(uint160(FCL_VERIFIER));

    string internal constant RP_ID = "roebel.app";
    uint256 internal constant PASSKEY_PK = 0xC0FFEE;
    uint256 internal constant SAFE_SALT_NONCE = 0;
    uint256 internal constant TEST_SPONSOR_KEY = 0x5905;

    // Gas limits used for every op. Chosen INSIDE the Task 2 sponsor-policy caps
    // (callGasLimit <= 1.5M, verificationGasLimit <= 1M, preVerificationGas <= 200k, maxFee <= 50 gwei).
    uint128 internal constant VERIFICATION_GAS = 1_000_000;
    uint128 internal constant CALL_GAS = 500_000;
    uint256 internal constant PRE_VERIFICATION_GAS = 100_000;
    uint128 internal constant MAX_PRIORITY_FEE = 1 gwei;
    uint128 internal constant MAX_FEE = 2 gwei;
    uint128 internal constant PM_VERIFICATION_GAS = 150_000;
    uint128 internal constant PM_POST_OP_GAS = 50_000;

    IEntryPointV07 internal entryPoint = IEntryPointV07(ENTRY_POINT);
    ISafe4337Module internal module4337 = ISafe4337Module(SAFE_4337_MODULE);
    INetizenVerifyingPaymaster internal paymaster = INetizenVerifyingPaymaster(PAYMASTER);

    uint256 internal voucherNonceCounter;

    function _fork() internal {
        vm.createSelectFork("gnosis");
        assertEq(block.chainid, 100, "not Gnosis");
    }

    // ------------------------------------------------------------------
    // Passkey Safe construction
    // ------------------------------------------------------------------

    function _multiSendTx(uint8 operation, address to, uint256 value, bytes memory data)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(operation, to, value, data.length, data);
    }

    /// @notice Safe.setup(...) calldata exactly as the Safe passkey + 4337 flow, with the
    ///         SocialRecoveryModule enabled next to the Safe4337Module.
    function _passkeySafeInitializer(uint256 x, uint256 y) internal pure returns (bytes memory) {
        address[] memory modules = new address[](2);
        modules[0] = SAFE_4337_MODULE;
        modules[1] = SOCIAL_RECOVERY;
        bytes memory txs = abi.encodePacked(
            _multiSendTx(1, SAFE_MODULE_SETUP, 0, abi.encodeCall(ISafeModuleSetup.enableModules, (modules))),
            _multiSendTx(
                1,
                SHARED_SIGNER,
                0,
                abi.encodeCall(ISafeWebAuthnSharedSigner.configure, (ISafeWebAuthnSharedSigner.Signer(x, y, VERIFIERS)))
            )
        );
        address[] memory owners = new address[](1);
        owners[0] = SHARED_SIGNER;
        return abi.encodeCall(
            ISafe.setup,
            (
                owners,
                1,
                MULTI_SEND,
                abi.encodeCall(IMultiSend.multiSend, (txs)),
                SAFE_4337_MODULE,
                address(0),
                0,
                payable(address(0))
            )
        );
    }

    /// @notice CREATE2 prediction per SafeProxyFactory 1.4.1:
    ///         salt = keccak256(keccak256(initializer) ++ saltNonce),
    ///         initCodeHash = keccak256(proxyCreationCode ++ uint256(singleton)).
    function _predictSafe(bytes memory initializer, uint256 saltNonce) internal pure returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
        bytes memory deploymentData = abi.encodePacked(
            ISafeProxyFactory(SAFE_PROXY_FACTORY).proxyCreationCode(), uint256(uint160(SAFE_L2_SINGLETON))
        );
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), SAFE_PROXY_FACTORY, salt, keccak256(deploymentData)))))
        );
    }

    function _safeInitCode(bytes memory initializer, uint256 saltNonce) internal pure returns (bytes memory) {
        return abi.encodePacked(
            SAFE_PROXY_FACTORY,
            abi.encodeCall(ISafeProxyFactory.createProxyWithNonce, (SAFE_L2_SINGLETON, initializer, saltNonce))
        );
    }

    // ------------------------------------------------------------------
    // UserOps
    // ------------------------------------------------------------------

    function _executeUserOpCallData(address to, uint256 value, bytes memory data) internal pure returns (bytes memory) {
        return abi.encodeCall(ISafe4337Module.executeUserOp, (to, value, data, uint8(0)));
    }

    function _buildOp(address sender, uint256 nonce, bytes memory initCode, bytes memory callData)
        internal
        pure
        returns (PackedUserOperation memory op)
    {
        op = PackedUserOperation({
            sender: sender,
            nonce: nonce,
            initCode: initCode,
            callData: callData,
            accountGasLimits: bytes32((uint256(VERIFICATION_GAS) << 128) | CALL_GAS),
            preVerificationGas: PRE_VERIFICATION_GAS,
            gasFees: bytes32((uint256(MAX_PRIORITY_FEE) << 128) | MAX_FEE),
            paymasterAndData: "",
            signature: ""
        });
    }

    /// @notice Independent re-implementation of Safe4337Module._getSafeOp hashing (v0.3.0).
    function _safeOpHash(PackedUserOperation memory op, uint48 validAfter, uint48 validUntil)
        internal
        view
        returns (bytes32)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(uint256 chainId,address verifyingContract)"), block.chainid, SAFE_4337_MODULE
            )
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
                validAfter,
                validUntil,
                ENTRY_POINT
            )
        );
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator, structHash));
    }

    struct WebAuthnParts {
        bytes32 challenge;
        bytes authenticatorData;
        string clientDataJSON;
        string clientDataFields;
        bytes32 digest;
        uint256 r;
        uint256 s;
        bytes webAuthnSignature;
    }

    function _webAuthnSign(uint256 pk, bytes32 challenge) internal pure returns (WebAuthnParts memory p) {
        p.challenge = challenge;
        p.authenticatorData = WebAuthnHelper.authenticatorData(RP_ID, 0x05, 0);
        p.clientDataFields = WebAuthnHelper.DEFAULT_CLIENT_DATA_FIELDS;
        p.clientDataJSON = WebAuthnHelper.clientDataJson(challenge, p.clientDataFields);
        p.digest = WebAuthnHelper.signingDigest(p.authenticatorData, p.clientDataJSON);
        (bytes32 r, bytes32 s) = vm.signP256(pk, p.digest);
        p.r = uint256(r);
        p.s = WebAuthnHelper.lowS(uint256(s));
        p.webAuthnSignature =
            WebAuthnHelper.encodeWebAuthnSignature(p.authenticatorData, p.clientDataFields, p.r, p.s);
    }

    /// @notice Signs the op with the passkey through `owner` (SharedSigner or a signer proxy).
    ///         validAfter = validUntil = 0. Checks the local SafeOp hash against the real module.
    function _signOp(PackedUserOperation memory op, uint256 pk, address owner) internal view {
        op.signature = abi.encodePacked(uint48(0), uint48(0));
        bytes32 opHash = module4337.getOperationHash(op);
        assertEq(opHash, _safeOpHash(op, 0, 0), "local SafeOp hash != Safe4337Module.getOperationHash");
        WebAuthnParts memory p = _webAuthnSign(pk, opHash);
        op.signature = WebAuthnHelper.userOpSignature(
            0, 0, WebAuthnHelper.safeContractSignature(owner, p.webAuthnSignature)
        );
    }

    function _handleOp(PackedUserOperation memory op) internal returns (uint256 gasUsed) {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        address bundler = makeAddr("bundler");
        vm.prank(bundler, bundler);
        uint256 g = gasleft();
        entryPoint.handleOps(ops, payable(bundler));
        gasUsed = g - gasleft();
    }

    // ------------------------------------------------------------------
    // Sponsorship (NetizenVerifyingPaymaster voucher v2)
    // ------------------------------------------------------------------

    /// @notice Replaces the live sponsorSigner with a test key by scanning storage for it.
    function _takeOverSponsorSigner() internal returns (uint256 slot) {
        for (slot = 0; slot <= 10; slot++) {
            if (vm.load(PAYMASTER, bytes32(slot)) == bytes32(uint256(uint160(LIVE_SPONSOR_SIGNER)))) {
                vm.store(PAYMASTER, bytes32(slot), bytes32(uint256(uint160(vm.addr(TEST_SPONSOR_KEY)))));
                assertEq(paymaster.sponsorSigner(), vm.addr(TEST_SPONSOR_KEY), "sponsorSigner takeover failed");
                return slot;
            }
        }
        revert("sponsorSigner slot not found");
    }

    function _hashStableFieldsLocal(PackedUserOperation memory op) internal pure returns (bytes32) {
        bytes memory pmd = op.paymasterAndData;
        uint128 pmVerif;
        uint128 pmPost;
        assembly {
            // paymasterAndData: [20 paymaster][16 pmVerificationGas][16 pmPostOpGas]...
            pmVerif := shr(128, mload(add(pmd, 52)))
            pmPost := shr(128, mload(add(pmd, 68)))
        }
        return keccak256(
            abi.encode(
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                op.accountGasLimits,
                op.preVerificationGas,
                op.gasFees,
                uint256(pmVerif),
                uint256(pmPost)
            )
        );
    }

    function _voucherDigestLocal(
        uint256 chainId,
        address verifyingContract,
        bytes32 stableHash,
        bytes32 subjectHash,
        uint256 maxCostWei,
        uint48 validAfter,
        uint48 validUntil,
        bytes32 voucherNonce
    ) internal pure returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("NetizenSponsorship"),
                keccak256("2"),
                chainId,
                verifyingContract
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SponsorshipVoucher(bytes32 userOpHash,bytes32 subjectHash,uint256 maxCostWei,uint48 validAfter,uint48 validUntil,bytes32 nonce)"
                ),
                stableHash,
                subjectHash,
                maxCostWei,
                validAfter,
                validUntil,
                voucherNonce
            )
        );
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator, structHash));
    }

    /// @notice Writes a 372-byte sponsored paymasterAndData onto `op` (must be called BEFORE the
    ///         account signature, because the Safe op hash covers paymasterAndData).
    function _sponsor(PackedUserOperation memory op) internal {
        op.paymasterAndData = abi.encodePacked(PAYMASTER, PM_VERIFICATION_GAS, PM_POST_OP_GAS);
        bytes32 stableHash = _hashStableFieldsLocal(op);
        assertEq(stableHash, paymaster.hashStableFields(op), "local hashStableFields != paymaster");

        uint48 validAfter = 0;
        uint48 validUntil = uint48(block.timestamp + 10 minutes);
        bytes32 voucherNonce = keccak256(abi.encode("passkey-voucher", ++voucherNonceCounter));
        bytes32 subjectHash = keccak256("roebel.app/passkey-accounts/test");
        uint256 maxCostWei = 0.01 ether;

        bytes32 digest = _voucherDigestLocal(
            block.chainid, PAYMASTER, stableHash, subjectHash, maxCostWei, validAfter, validUntil, voucherNonce
        );
        assertEq(
            digest,
            paymaster.hashSponsorshipVoucher(stableHash, subjectHash, maxCostWei, validAfter, validUntil, voucherNonce),
            "local voucher digest != paymaster"
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEST_SPONSOR_KEY, digest);
        bytes memory paymasterData = abi.encode(
            validAfter, validUntil, voucherNonce, subjectHash, maxCostWei, abi.encodePacked(r, s, v)
        );
        assertEq(paymasterData.length, 320, "paymasterData must be 320 bytes");
        op.paymasterAndData = abi.encodePacked(PAYMASTER, PM_VERIFICATION_GAS, PM_POST_OP_GAS, paymasterData);
        assertEq(op.paymasterAndData.length, 372, "paymasterAndData must be 372 bytes");
    }

    // ------------------------------------------------------------------
    // thirdweb legacy account helpers
    // ------------------------------------------------------------------

    function _handoverDigest(address legacy, SignerPermissionRequest memory req) internal pure returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Account"),
                keccak256("1"),
                uint256(100),
                legacy
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SignerPermissionRequest(address signer,uint8 isAdmin,address[] approvedTargets,uint256 nativeTokenLimitPerTransaction,uint128 permissionStartTimestamp,uint128 permissionEndTimestamp,uint128 reqValidityStartTimestamp,uint128 reqValidityEndTimestamp,bytes32 uid)"
                ),
                req.signer,
                req.isAdmin,
                keccak256(abi.encodePacked(req.approvedTargets)),
                req.nativeTokenLimitPerTransaction,
                req.permissionStartTimestamp,
                req.permissionEndTimestamp,
                req.reqValidityStartTimestamp,
                req.reqValidityEndTimestamp,
                req.uid
            )
        );
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator, structHash));
    }

    function _permissionRequest(address signer, uint8 isAdmin, uint128 start, uint128 end, bytes32 uid)
        internal
        pure
        returns (SignerPermissionRequest memory)
    {
        return SignerPermissionRequest({
            signer: signer,
            isAdmin: isAdmin,
            approvedTargets: new address[](0),
            nativeTokenLimitPerTransaction: 0,
            permissionStartTimestamp: 0,
            permissionEndTimestamp: 0,
            reqValidityStartTimestamp: start,
            reqValidityEndTimestamp: end,
            uid: uid
        });
    }

    function _signHandover(uint256 adminKey, address legacy, SignerPermissionRequest memory req)
        internal
        pure
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(adminKey, _handoverDigest(legacy, req));
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------
    // Plain EOA-owned Safe (stand-in admin / guardians)
    // ------------------------------------------------------------------

    function _deployPlainSafe(address owner, uint256 saltNonce) internal returns (address) {
        address[] memory owners = new address[](1);
        owners[0] = owner;
        bytes memory init = abi.encodeCall(
            ISafe.setup, (owners, 1, address(0), bytes(""), address(0), address(0), 0, payable(address(0)))
        );
        return ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(SAFE_L2_SINGLETON, init, saltNonce);
    }

    function _execFromPlainSafe(address safe, uint256 ownerKey, address to, uint256 value, bytes memory data)
        internal
        returns (bool)
    {
        bytes32 txHash = ISafe(safe).getTransactionHash(
            to, value, data, 0, 0, 0, 0, address(0), address(0), ISafe(safe).nonce()
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, txHash);
        return ISafe(safe).execTransaction(
            to, value, data, 0, 0, 0, 0, address(0), payable(address(0)), abi.encodePacked(r, s, v)
        );
    }

    /// @notice Probes the RIP-7212 precompile on the current fork with a known-good signature.
    function _forkHasP256Precompile() internal view returns (bool) {
        (uint256 x, uint256 y) = vm.publicKeyP256(PASSKEY_PK);
        bytes32 digest = sha256("probe");
        (bytes32 r, bytes32 s) = vm.signP256(PASSKEY_PK, digest);
        (bool ok, bytes memory ret) = P256_PRECOMPILE.staticcall(abi.encode(digest, r, s, x, y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }
}
