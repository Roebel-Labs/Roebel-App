// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {
    PackedUserOperation,
    ISafe,
    ISafeProxyFactory,
    ISocialRecoveryModule,
    IERC1271,
    ICompatibilityFallbackHandler
} from "./utils/Interfaces.sol";

/// @notice Fork proof for the ECDSA-owner Safe (expert path / recovery words as the account key):
///         the Safe's single owner is a plain EOA, the 4337 + recovery modules are enabled in ONE
///         delegatecall, and every signature is a 65-byte ECDSA signature (v 27/28).
///
/// `test_writeVector` writes `test/fixtures/ecdsa-safe-vector.json` for the Expo and web libraries.
contract EcdsaSafeTest is PasskeySafeBase {
    string internal constant PHRASE = "test test test test test test test test test test test junk";
    string internal constant VECTOR_PATH = "./test/fixtures/ecdsa-safe-vector.json";
    uint256 internal constant RECOVERY_PERIOD = 259200;
    address internal constant SINK = 0x000000000000000000000000000000000000dEaD;

    /// Safe 1.4.1: the owner is an indexed topic.
    event AddedOwner(address indexed owner);

    ISocialRecoveryModule internal srm = ISocialRecoveryModule(SOCIAL_RECOVERY);

    uint256 internal ownerKey; // key 0 of the junk phrase
    address internal owner;
    bytes internal initializer;
    address internal safe;

    function setUp() public {
        _fork();
        _takeOverSponsorSigner();
        ownerKey = vm.deriveKey(PHRASE, 0);
        owner = vm.addr(ownerKey);
        initializer = _ecdsaSafeInitializer(owner);
        safe = _predictSafe(initializer, SAFE_SALT_NONCE);
        entryPoint.depositTo{value: 1 ether}(safe);
        vm.deal(safe, 1 ether); // the Safe sends 1 wei to SINK in its ops
    }

    // ------------------------------------------------------------------ helpers

    function _ecdsaSign(uint256 key, bytes32 h) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        return abi.encodePacked(r, s, v);
    }

    /// Signs the op with a plain ECDSA key. validAfter = validUntil = 0. Checks the local hash too.
    function _signEcdsa(PackedUserOperation memory op, uint256 key) internal view returns (bytes32 opHash) {
        op.signature = abi.encodePacked(uint48(0), uint48(0));
        opHash = module4337.getOperationHash(op);
        assertEq(opHash, _safeOpHash(op, 0, 0), "local SafeOp hash != Safe4337Module.getOperationHash");
        op.signature = abi.encodePacked(uint48(0), uint48(0), _ecdsaSign(key, opHash));
    }

    /// First sponsored op: deploys the Safe (initCode) and sends 1 wei to SINK.
    function _firstOp(uint256 key) internal returns (PackedUserOperation memory op) {
        op = _buildOp(safe, 0, _safeInitCode(initializer, SAFE_SALT_NONCE), _executeUserOpCallData(SINK, 1, ""));
        _sponsor(op);
        _signEcdsa(op, key);
    }

    function _deploy() internal {
        _handleOp(_firstOp(ownerKey));
    }

    function _followUp(address sender, uint256 key, bytes memory callData) internal returns (PackedUserOperation memory op) {
        op = _buildOp(sender, entryPoint.getNonce(sender, 0), "", callData);
        _sponsor(op);
        _signEcdsa(op, key);
    }

    // ------------------------------------------------------------------ tests

    function test_predictedAddressMatches() public {
        assertEq(safe.code.length, 0, "counterfactual before deploy");
        address deployed = ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(
            SAFE_L2_SINGLETON, initializer, SAFE_SALT_NONCE
        );
        assertEq(deployed, safe, "predicted != deployed");
        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], owner);
        assertEq(ISafe(safe).getThreshold(), 1);
        assertTrue(ISafe(safe).isModuleEnabled(SAFE_4337_MODULE), "4337 module enabled");
        assertTrue(ISafe(safe).isModuleEnabled(SOCIAL_RECOVERY), "SRM enabled");
    }

    function test_sponsoredDeployAndExecute() public {
        uint256 before_ = SINK.balance;
        PackedUserOperation memory op = _firstOp(ownerKey);
        assertEq(op.signature.length, 12 + 65, "validity prefix + plain 65-byte signature");
        assertEq(op.paymasterAndData.length, 372);
        _handleOp(op);
        assertGt(safe.code.length, 0, "deployed by the first userOp");
        assertEq(SINK.balance, before_ + 1, "the op executed");
        assertEq(ISafe(safe).getOwners()[0], owner);
        // A second op from the now-deployed Safe works too.
        _handleOp(_followUp(safe, ownerKey, _executeUserOpCallData(SINK, 1, "")));
        assertEq(SINK.balance, before_ + 2);
    }

    function test_wrongKey_AA24() public {
        PackedUserOperation memory op = _firstOp(vm.deriveKey(PHRASE, 1));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        address bundler = makeAddr("bundler");
        vm.prank(bundler, bundler);
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        entryPoint.handleOps(ops, payable(bundler));
        assertEq(safe.code.length, 0, "nothing deployed");
    }

    function test_erc1271() public {
        _deploy();
        bytes32 h = keccak256("expert path erc1271");
        bytes32 messageHash = _safeMessageHash(h);
        assertEq(
            messageHash,
            ICompatibilityFallbackHandler(SAFE_4337_MODULE).getMessageHashForSafe(safe, abi.encode(h)),
            "local SafeMessage hash != CompatibilityFallbackHandler.getMessageHashForSafe"
        );
        bytes memory sig = _ecdsaSign(ownerKey, messageHash);
        assertEq(IERC1271(safe).isValidSignature(h, sig), bytes4(0x1626ba7e), "ERC-1271 magic value");

        // A different key, and the raw hash signed directly, are rejected.
        bytes memory wrongKey = _ecdsaSign(vm.deriveKey(PHRASE, 1), messageHash);
        vm.expectRevert();
        IERC1271(safe).isValidSignature(h, wrongKey);
        bytes memory raw = _ecdsaSign(ownerKey, h);
        vm.expectRevert();
        IERC1271(safe).isValidSignature(h, raw);
    }

    /// Independent SafeMessage hash: keccak(0x19 01 safeDomainSeparator keccak(SAFE_MSG_TYPEHASH, keccak(abi.encode(h)))).
    function _safeMessageHash(bytes32 h) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(keccak256("SafeMessage(bytes message)"), keccak256(abi.encode(h)))
        );
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), ISafe(safe).domainSeparator(), structHash));
    }

    function test_guardianRecoveryToNewEoa() public {
        _deploy();
        uint256 guardianKey = vm.deriveKey(PHRASE, 1);
        address guardian = vm.addr(guardianKey);
        uint256 newKey = vm.deriveKey(PHRASE, 2);
        address newEoa = vm.addr(newKey);

        // The owner adds one guardian (threshold 1) through its own sponsored userOp.
        _handleOp(
            _followUp(
                safe,
                ownerKey,
                _executeUserOpCallData(
                    SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (guardian, 1))
                )
            )
        );
        assertTrue(srm.isGuardian(safe, guardian));

        // The guardian confirms and starts the recovery to a NEW EOA; the delay applies.
        address[] memory newOwners = new address[](1);
        newOwners[0] = newEoa;
        vm.prank(guardian);
        srm.confirmRecovery(safe, newOwners, 1, true);
        assertEq(srm.getRecoveryRequest(safe).executeAfter, uint64(block.timestamp + RECOVERY_PERIOD));
        assertEq(ISafe(safe).getOwners()[0], owner, "not instant");

        vm.expectRevert(bytes("SM: recovery period still pending"));
        srm.finalizeRecovery(safe);

        vm.warp(block.timestamp + RECOVERY_PERIOD + 1);
        vm.expectEmit(true, false, false, true, safe);
        emit AddedOwner(newEoa);
        srm.finalizeRecovery(safe);
        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], newEoa);
        assertEq(ISafe(safe).getThreshold(), 1);

        // The new key's ops pass, the old key's fail with AA24.
        uint256 before_ = SINK.balance;
        _handleOp(_followUp(safe, newKey, _executeUserOpCallData(SINK, 1, "")));
        assertEq(SINK.balance, before_ + 1);

        PackedUserOperation memory oldOp = _followUp(safe, ownerKey, _executeUserOpCallData(SINK, 1, ""));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = oldOp;
        address bundler = makeAddr("bundler");
        vm.prank(bundler, bundler);
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        entryPoint.handleOps(ops, payable(bundler));
    }

    /// Guardian recovery of an expert account to a NEW phrase, the way the app does it (Task 9):
    /// a guardian confirms on chain (no execute); the recovering phone's FRESH expert Safe (owner =
    /// the new phrase's key 0, counterfactual, no deposit of its own) sends ONE sponsored op that
    /// deploys it and calls executeRecovery; after the delay the same Safe sends finalizeRecovery.
    /// The old address stays the account; the new key operates it, the old key no longer does.
    function test_freshExpertSafeRecoversExpertAccount() public {
        _deploy();
        uint256 guardianKey = vm.deriveKey(PHRASE, 1);
        address guardian = vm.addr(guardianKey);
        _handleOp(
            _followUp(
                safe,
                ownerKey,
                _executeUserOpCallData(
                    SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (guardian, 1))
                )
            )
        );

        // The new phrase (another mnemonic) → its key 0 and its counterfactual expert Safe.
        uint256 newKey = vm.deriveKey("legal winner thank year wave sausage worth useful legal winner thank yellow", 0);
        address newEoa = vm.addr(newKey);
        bytes memory freshInit = _ecdsaSafeInitializer(newEoa);
        address fresh = _predictSafe(freshInit, SAFE_SALT_NONCE);
        assertEq(fresh.code.length, 0, "fresh expert Safe is counterfactual");

        address[] memory newOwners = new address[](1);
        newOwners[0] = newEoa;
        vm.prank(guardian);
        srm.confirmRecovery(safe, newOwners, 1, false);
        assertEq(srm.getRecoveryRequest(safe).executeAfter, 0, "confirm alone starts nothing");

        // ONE op from the fresh Safe: deploy + executeRecovery(wallet, [newEoa], 1).
        PackedUserOperation memory op = _buildOp(
            fresh,
            0,
            _safeInitCode(freshInit, SAFE_SALT_NONCE),
            _executeUserOpCallData(
                SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.executeRecovery, (safe, newOwners, 1))
            )
        );
        _sponsor(op);
        _signEcdsa(op, newKey);
        _handleOp(op);
        assertGt(fresh.code.length, 0, "fresh Safe deployed by the same op");
        assertEq(srm.getRecoveryRequest(safe).executeAfter, uint64(block.timestamp + RECOVERY_PERIOD), "3-day wait");
        assertEq(ISafe(safe).getOwners()[0], owner, "not instant");

        // After the delay the fresh Safe finalizes (one more op, signed by the new words).
        vm.warp(block.timestamp + RECOVERY_PERIOD + 1);
        _handleOp(_followUp(fresh, newKey, _executeUserOpCallData(SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.finalizeRecovery, (safe)))));
        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], newEoa, "the old address now belongs to the new words");

        // The new words operate the OLD address; the old words fail with AA24.
        uint256 before_ = SINK.balance;
        _handleOp(_followUp(safe, newKey, _executeUserOpCallData(SINK, 1, "")));
        assertEq(SINK.balance, before_ + 1);
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = _followUp(safe, ownerKey, _executeUserOpCallData(SINK, 1, ""));
        address bundler = makeAddr("bundler");
        vm.prank(bundler, bundler);
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        entryPoint.handleOps(ops, payable(bundler));
    }

    /// The app's ECDSA gas-estimation stand-in (apps/expo/lib/passkey/userop.ts ECDSA_DUMMY_SIGNATURE):
    /// v = 27, low-s, a real curve point, recovering to a non-owner over any op hash.
    bytes internal constant ECDSA_DUMMY_SIGNATURE =
        hex"134a75f59d27787d05a79232d0dc26d6500f736a7d731f4016d6181a5db0918b726b8b1644daeb10c9cf161051f3f6d9ffe8625252f71cbec3904a30cbfbbece1b";

    /// Verification gas of `op` with `signature` as the EntryPoint calls it (Safe -> Safe4337Module
    /// fallback), every touched account cold, the state reverted afterwards.
    function _validationGas(PackedUserOperation memory op, bytes memory signature) internal returns (uint256 gasUsed, uint256 validationData) {
        uint256 snap = vm.snapshotState();
        op.signature = signature;
        vm.cool(safe);
        vm.cool(SAFE_4337_MODULE);
        vm.cool(SAFE_L2_SINGLETON);
        vm.prank(ENTRY_POINT);
        uint256 g = gasleft();
        (bool ok, bytes memory ret) =
            safe.call(abi.encodeWithSignature("validateUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32,uint256)", op, bytes32(0), uint256(0)));
        gasUsed = g - gasleft();
        assertTrue(ok, "validateUserOp must not revert (a bad signature returns SIG_VALIDATION_FAILED)");
        validationData = abi.decode(ret, (uint256));
        vm.revertToState(snap);
    }

    /// Final review I-2: the dummy signature the app estimates with must take the Safe's ECDSA
    /// branch (ecrecover + the cold owners[] read) and cost at least as much verification gas as
    /// the real signature, so the estimate never under-shoots. The old v = 0xff stand-in recovered
    /// address(0) on the eth_sign branch and skipped the owners[] read.
    function test_dummySignatureCoversRealVerificationGas() public {
        assertEq(ECDSA_DUMMY_SIGNATURE.length, 65, "65 bytes");
        assertEq(uint8(ECDSA_DUMMY_SIGNATURE[64]), 27, "v = 27");
        _deploy();
        PackedUserOperation memory op = _followUp(safe, ownerKey, _executeUserOpCallData(SINK, 1, ""));
        bytes memory real = op.signature;
        bytes memory dummy = abi.encodePacked(uint48(0), uint48(0), ECDSA_DUMMY_SIGNATURE);
        assertEq(dummy.length, real.length, "same layout and size as the real signature");

        // The dummy recovers to some real, non-owner address over the op hash.
        bytes32 opHash = module4337.getOperationHash(op);
        bytes32 r;
        bytes32 s;
        bytes memory d = ECDSA_DUMMY_SIGNATURE;
        assembly {
            r := mload(add(d, 0x20))
            s := mload(add(d, 0x40))
        }
        address recovered = ecrecover(opHash, 27, r, s);
        assertTrue(recovered != address(0), "recovers to a real address");
        assertTrue(recovered != owner, "not the owner");

        (uint256 realGas, uint256 realData) = _validationGas(op, real);
        (uint256 dummyGas, uint256 dummyData) = _validationGas(op, dummy);
        assertEq(realData, 0, "the real signature validates");
        assertEq(dummyData, 1, "the dummy fails validation (SIG_VALIDATION_FAILED), it does not revert");
        emit log_named_uint("validateUserOp gas, real signature", realGas);
        emit log_named_uint("validateUserOp gas, dummy signature", dummyGas);
        assertGe(dummyGas, realGas, "the dummy's verification gas covers the real signature's");

        // The old 0xff stand-in did not (documents the bug this replaces).
        (uint256 oldGas,) = _validationGas(op, abi.encodePacked(uint48(0), uint48(0), _ffs()));
        emit log_named_uint("validateUserOp gas, old 0xff stand-in", oldGas);
        assertLt(oldGas, realGas, "the old stand-in under-estimated");
    }

    function _ffs() internal pure returns (bytes memory b) {
        b = new bytes(65);
        for (uint256 i; i < 65; ++i) b[i] = 0xff;
    }

    function test_writeVector() public {
        // Fixed userOp: deploy + 1 wei to SINK, stub paymasterAndData (paymaster ++ gas limits ++ 320 zero bytes).
        PackedUserOperation memory op =
            _buildOp(safe, 0, _safeInitCode(initializer, SAFE_SALT_NONCE), _executeUserOpCallData(SINK, 1, ""));
        op.paymasterAndData = abi.encodePacked(PAYMASTER, PM_VERIFICATION_GAS, PM_POST_OP_GAS, new bytes(320));
        bytes32 safeOpHash = _signEcdsa(op, ownerKey);
        bytes memory ownerSig = _ecdsaSign(ownerKey, safeOpHash);
        assertEq(ownerSig.length, 65);
        assertEq(op.signature, abi.encodePacked(uint48(0), uint48(0), ownerSig));

        // The vector signature must really be accepted by the Safe: deploy and check ERC-1271 on the
        // fixed hash below against the real bytecode.
        _deploy();
        bytes32 h = keccak256("roebel expert path erc1271 vector");
        bytes32 messageHash = _safeMessageHash(h);
        bytes memory sig1271 = _ecdsaSign(ownerKey, messageHash);
        assertEq(IERC1271(safe).isValidSignature(h, sig1271), bytes4(0x1626ba7e), "vector ERC-1271 must verify");

        string memory userOp = string.concat(
            '{"_note":"Fixed v0.7 PackedUserOperation (deploy + 1 wei to 0x...dEaD). paymasterAndData is a 372-byte STUB. signature prefix validAfter=0, validUntil=0 then the 65-byte ECDSA signature. safeOpHash = Safe4337Module.getOperationHash(op) on the real module.",',
            '"sender":"', vm.toString(op.sender), '",',
            '"nonce":"0",',
            '"initCode":"', vm.toString(op.initCode), '",',
            '"callData":"', vm.toString(op.callData), '",',
            '"accountGasLimits":"', vm.toString(op.accountGasLimits), '",',
            '"preVerificationGas":"', vm.toString(op.preVerificationGas), '",',
            '"gasFees":"', vm.toString(op.gasFees), '",',
            '"paymasterAndData":"', vm.toString(op.paymasterAndData), '",',
            '"safeOpHash":"', vm.toString(safeOpHash), '",',
            '"ownerSignature":"', vm.toString(ownerSig), '",',
            '"userOpSignature":"', vm.toString(op.signature), '"}'
        );
        string memory out = string.concat(
            '{"_description":"ECDSA-owner Safe golden vector, written by test/EcdsaSafe.t.sol::test_writeVector against real Gnosis (chain 100) bytecode on a fork. Safe.setup(owners=[owner], threshold=1, to=SafeModuleSetup, data=enableModules([Safe4337Module, SocialRecoveryModule]), fallbackHandler=Safe4337Module, 0, 0, 0), proxy via createProxyWithNonce(SafeL2, setup, 0). All keys are TEST-ONLY (the public Hardhat junk phrase).",',
            '"chainId":"100",',
            '"phrase":"', PHRASE, '",',
            '"saltNonce":"', vm.toString(SAFE_SALT_NONCE), '",',
            '"owner":"', vm.toString(owner), '",',
            '"safeAddress":"', vm.toString(safe), '",',
            '"setupData":"', vm.toString(initializer), '",',
            '"initCode":"', vm.toString(_safeInitCode(initializer, SAFE_SALT_NONCE)), '",',
            '"userOp":', userOp, ",",
            '"erc1271":{"hash":"', vm.toString(h), '","safeMessageHash":"', vm.toString(messageHash),
            '","signature":"', vm.toString(sig1271), '"}}'
        );
        vm.writeFile(VECTOR_PATH, out);
    }
}
