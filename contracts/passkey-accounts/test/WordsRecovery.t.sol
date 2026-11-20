// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {
    PackedUserOperation,
    ISafe,
    ISafeProxyFactory,
    ISocialRecoveryModule,
    ISafeWebAuthnSignerFactory
} from "./utils/Interfaces.sol";

/// @notice Recovery words as ONE guardian entry made of two EOA word addresses (threshold 2).
///
/// The words are a recovery key, not an instant key: two plain ECDSA approvals over
/// `getRecoveryHash` start the same 259200 s delay as any guardian recovery, the owner can cancel
/// (which bumps the SRM nonce and kills the old approvals), and only `finalizeRecovery` after the
/// delay changes the owner. The recovering person's fresh passkey Safe sends everything in ONE
/// sponsored userOp: `[createSigner(x2, y2), multiConfirmRecovery(wallet, [signer2], 1, sigs, true)]`.
///
/// `test_writeVector` writes `test/fixtures/words-recovery-vector.json` for the Expo library.
contract WordsRecoveryTest is PasskeySafeBase {
    address internal constant MULTI_SEND_CALL_ONLY = 0x9641d764fc13c8B624c04430C7356C1C7C8102e2;
    uint256 internal constant RECOVERY_PERIOD = 259200;
    uint256 internal constant NEW_PASSKEY_PK = 0xC0FFEE4;
    string internal constant PHRASE = "test test test test test test test test test test test junk";
    string internal constant VECTOR_PATH = "./test/fixtures/words-recovery-vector.json";

    /// Real Candide SRM events. The plan assumed a 3-arg `GuardianAdded(wallet, newGuardian, threshold)`;
    /// the deployed module emits a 2-arg `GuardianAdded` followed by a separate `ChangedThreshold`.
    event GuardianAdded(address indexed wallet, address indexed guardian);
    event ChangedThreshold(address indexed wallet, uint256 threshold);

    ISocialRecoveryModule internal srm = ISocialRecoveryModule(SOCIAL_RECOVERY);

    address internal wallet; // deployed passkey Safe being recovered
    address internal newSafe; // recovering person's counterfactual passkey Safe
    uint256 internal newX;
    uint256 internal newY;
    address internal newSigner;
    address[] internal newOwners;
    uint256[2] internal keys; // word private keys, pool-index order
    address[2] internal addrs; // word addresses, pool-index order

    function setUp() public {
        _fork();
        _takeOverSponsorSigner();
        for (uint32 i = 0; i < 2; i++) {
            keys[i] = vm.deriveKey(PHRASE, i);
            addrs[i] = vm.addr(keys[i]);
        }
        (uint256 x, uint256 y) = vm.publicKeyP256(PASSKEY_PK);
        wallet = ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(
            SAFE_L2_SINGLETON, _passkeySafeInitializer(x, y), SAFE_SALT_NONCE
        );
        entryPoint.depositTo{value: 1 ether}(wallet);

        (newX, newY) = vm.publicKeyP256(NEW_PASSKEY_PK);
        newSafe = _predictSafe(_passkeySafeInitializer(newX, newY), SAFE_SALT_NONCE);
        newSigner = ISafeWebAuthnSignerFactory(SIGNER_FACTORY).getSigner(newX, newY, VERIFIERS);
        newOwners.push(newSigner);
    }

    // ------------------------------------------------------------------ helpers

    function _walletOp(address to, bytes memory data) internal {
        PackedUserOperation memory op =
            _buildOp(wallet, entryPoint.getNonce(wallet, 0), "", _executeUserOpCallData(to, 0, data));
        _signOp(op, PASSKEY_PK, SHARED_SIGNER);
        _handleOp(op);
    }

    /// The passkey Safe adds word address 0 and 1 with threshold 2, each through its own userOp.
    function _addWordGuardians() internal {
        vm.expectEmit(true, true, false, true, SOCIAL_RECOVERY);
        emit GuardianAdded(wallet, addrs[0]);
        vm.expectEmit(true, false, false, true, SOCIAL_RECOVERY);
        emit ChangedThreshold(wallet, 1);
        _walletOp(SOCIAL_RECOVERY, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (addrs[0], 1)));
        vm.expectEmit(true, true, false, true, SOCIAL_RECOVERY);
        emit GuardianAdded(wallet, addrs[1]);
        vm.expectEmit(true, false, false, true, SOCIAL_RECOVERY);
        emit ChangedThreshold(wallet, 2);
        _walletOp(SOCIAL_RECOVERY, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (addrs[1], 2)));
    }

    function _recoveryHash() internal view returns (bytes32) {
        return srm.getRecoveryHash(wallet, newOwners, 1, srm.nonce(wallet));
    }

    function _sign(uint256 key, bytes32 rh) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, rh);
        return abi.encodePacked(r, s, v);
    }

    /// Calldata signature list, sorted by signer address ascending (the SRM requires it).
    function _sortedSigs(bytes32 rh) internal view returns (ISocialRecoveryModule.SignatureData[] memory sigs) {
        sigs = new ISocialRecoveryModule.SignatureData[](2);
        ISocialRecoveryModule.SignatureData memory a = ISocialRecoveryModule.SignatureData(addrs[0], _sign(keys[0], rh));
        ISocialRecoveryModule.SignatureData memory b = ISocialRecoveryModule.SignatureData(addrs[1], _sign(keys[1], rh));
        if (addrs[0] < addrs[1]) {
            sigs[0] = a;
            sigs[1] = b;
        } else {
            sigs[0] = b;
            sigs[1] = a;
        }
    }

    function _batch(ISocialRecoveryModule.SignatureData[] memory sigs) internal view returns (bytes memory) {
        bytes memory txs = abi.encodePacked(
            _multiSendTx(0, SIGNER_FACTORY, 0, abi.encodeCall(ISafeWebAuthnSignerFactory.createSigner, (newX, newY, VERIFIERS))),
            _multiSendTx(
                0, SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.multiConfirmRecovery, (wallet, newOwners, 1, sigs, true))
            )
        );
        return abi.encodeWithSignature(
            "executeUserOp(address,uint256,bytes,uint8)",
            MULTI_SEND_CALL_ONLY,
            uint256(0),
            abi.encodeWithSignature("multiSend(bytes)", txs),
            uint8(1)
        );
    }

    function _newSafeOp(bytes memory callData) internal returns (PackedUserOperation memory op) {
        op = _buildOp(
            newSafe,
            entryPoint.getNonce(newSafe, 0),
            _safeInitCode(_passkeySafeInitializer(newX, newY), SAFE_SALT_NONCE),
            callData
        );
        op.accountGasLimits = bytes32((uint256(VERIFICATION_GAS) << 128) | uint256(1_500_000));
        _sponsor(op);
        _signOp(op, NEW_PASSKEY_PK, SHARED_SIGNER);
    }

    function _startRecoveryOneOp() internal {
        _handleOp(_newSafeOp(_batch(_sortedSigs(_recoveryHash()))));
    }

    // ------------------------------------------------------------------ tests

    function test_wordGuardiansAdded_emitGuardianAdded() public {
        _addWordGuardians();
        assertEq(srm.guardiansCount(wallet), 2);
        assertEq(srm.threshold(wallet), 2);
        assertTrue(srm.isGuardian(wallet, addrs[0]) && srm.isGuardian(wallet, addrs[1]));
    }

    function test_wordsAloneStartRecovery_oneOp() public {
        _addWordGuardians();
        assertEq(newSafe.code.length, 0, "fresh Safe is counterfactual");
        _startRecoveryOneOp();
        assertGt(newSafe.code.length, 0, "fresh Safe deployed by the same op");
        assertGt(newSigner.code.length, 0, "per-key signer deployed by the same op");
        ISocialRecoveryModule.RecoveryRequest memory req = srm.getRecoveryRequest(wallet);
        assertEq(req.executeAfter, uint64(block.timestamp + RECOVERY_PERIOD), "3-day wait, not instant");
        assertEq(req.newOwners.length, 1);
        assertEq(req.newOwners[0], newSigner);
        // Not instant: the old owner is still in control.
        assertEq(ISafe(wallet).getOwners()[0], SHARED_SIGNER);
    }

    function test_ownerCancels_oldApprovalsDie() public {
        _addWordGuardians();
        bytes32 rh = _recoveryHash();
        uint256 nonceBefore = srm.nonce(wallet);
        ISocialRecoveryModule.SignatureData[] memory oldSigs = _sortedSigs(rh);
        _startRecoveryOneOp();

        _walletOp(SOCIAL_RECOVERY, abi.encodeCall(ISocialRecoveryModule.cancelRecovery, ()));
        assertEq(srm.getRecoveryRequest(wallet).executeAfter, 0, "request cleared");
        assertEq(srm.nonce(wallet), nonceBefore + 1, "nonce moved");

        // The same two signatures no longer match the new recovery hash.
        assertTrue(_recoveryHash() != rh);
        vm.expectRevert();
        srm.multiConfirmRecovery(wallet, newOwners, 1, oldSigs, true);

        // A fresh attempt with signatures over the new hash works again.
        srm.multiConfirmRecovery(wallet, newOwners, 1, _sortedSigs(_recoveryHash()), true);
        assertEq(srm.getRecoveryRequest(wallet).executeAfter, uint64(block.timestamp + RECOVERY_PERIOD));
    }

    function test_finalizeAfterDelay() public {
        _addWordGuardians();
        _startRecoveryOneOp();
        vm.expectRevert(bytes("SM: recovery period still pending"));
        srm.finalizeRecovery(wallet);

        vm.warp(block.timestamp + RECOVERY_PERIOD + 1);
        srm.finalizeRecovery(wallet);
        address[] memory owners = ISafe(wallet).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], newSigner);
        assertEq(ISafe(wallet).getThreshold(), 1);
    }

    function test_writeVector() public {
        _addWordGuardians();
        bytes32 rh = _recoveryHash();
        uint256 n = srm.nonce(wallet);
        ISocialRecoveryModule.SignatureData[] memory sorted = _sortedSigs(rh);
        _startRecoveryOneOp(); // proves the exact calldata below is accepted

        // Built by hand: forge's serializers cannot emit an array of objects.
        string memory guardians = string.concat(
            "[", _guardianJson(0, rh), ",", _guardianJson(1, rh), "]"
        );
        string memory out = string.concat(
            '{"_description":"Words recovery vector, written by test/WordsRecovery.t.sol::test_writeVector against real Gnosis bytecode on a fork. guardians[] is in pool-index order; the calldata sorts signatures by signer. All keys are TEST-ONLY (the public Hardhat junk phrase).",',
            '"chainId":"100",',
            '"phrase":"', PHRASE, '",',
            '"wallet":"', vm.toString(wallet), '",',
            '"newOwner":"', vm.toString(newSigner), '",',
            '"newThreshold":"1",',
            '"nonce":"', vm.toString(n), '",',
            '"recoveryHash":"', vm.toString(rh), '",',
            '"guardians":', guardians, ",",
            '"multiConfirmCalldata":"',
            vm.toString(abi.encodeCall(ISocialRecoveryModule.multiConfirmRecovery, (wallet, newOwners, 1, sorted, true))),
            '"}'
        );
        vm.writeFile(VECTOR_PATH, out);
    }

    function _guardianJson(uint256 i, bytes32 rh) internal view returns (string memory) {
        return string.concat(
            '{"index":', vm.toString(i), ',"address":"', vm.toString(addrs[i]), '","signature":"',
            vm.toString(_sign(keys[i], rh)), '"}'
        );
    }
}
