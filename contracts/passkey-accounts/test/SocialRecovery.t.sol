// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {PackedUserOperation, ISafe, ISocialRecoveryModule, ISafeWebAuthnSignerFactory} from "./utils/Interfaces.sol";

/// @notice Proves guardian-based passkey rotation with the deployed Candide SocialRecoveryModule
///         (recoveryPeriod 259200 s) on a passkey Safe, driven by real WebAuthn-signed userOps.
contract SocialRecoveryTest is PasskeySafeBase {
    uint256 internal constant NEW_PASSKEY_PK = 0xC0FFEE2;
    uint256 internal constant RECOVERY_PERIOD = 259200;
    uint256 internal constant G1_KEY = 0x6001;
    uint256 internal constant G2_KEY = 0x6002;
    uint256 internal constant G3_KEY = 0x6003;

    ISocialRecoveryModule internal srm = ISocialRecoveryModule(SOCIAL_RECOVERY);

    address internal safe;
    address internal g1;
    address internal g2;
    address internal g3;
    address internal newOwner;
    address[] internal newOwners;

    function setUp() public {
        _fork();
        (uint256 x, uint256 y) = vm.publicKeyP256(PASSKEY_PK);
        bytes memory initializer = _passkeySafeInitializer(x, y);
        safe = _predictSafe(initializer, SAFE_SALT_NONCE);

        // Unsponsored here: the Safe pays from its EntryPoint deposit.
        entryPoint.depositTo{value: 1 ether}(safe);

        g1 = _deployPlainSafe(vm.addr(G1_KEY), 1);
        g2 = _deployPlainSafe(vm.addr(G2_KEY), 2);
        g3 = _deployPlainSafe(vm.addr(G3_KEY), 3);

        // Op 0 deploys the passkey Safe and adds G1; ops 1-2 add G2, G3; final threshold 2.
        _passkeyOp(
            PASSKEY_PK,
            SHARED_SIGNER,
            _safeInitCode(initializer, SAFE_SALT_NONCE),
            SOCIAL_RECOVERY,
            0,
            abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (g1, 1))
        );
        _passkeyOp(
            PASSKEY_PK, SHARED_SIGNER, "", SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (g2, 1))
        );
        _passkeyOp(
            PASSKEY_PK, SHARED_SIGNER, "", SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.addGuardianWithThreshold, (g3, 2))
        );
        assertEq(srm.guardiansCount(safe), 3);
        assertEq(srm.threshold(safe), 2);
        assertTrue(srm.isGuardian(safe, g1) && srm.isGuardian(safe, g2) && srm.isGuardian(safe, g3));

        // New passkey on a new device -> its own signer proxy (SafeWebAuthnSignerFactory).
        (uint256 x2, uint256 y2) = vm.publicKeyP256(NEW_PASSKEY_PK);
        newOwner = ISafeWebAuthnSignerFactory(SIGNER_FACTORY).createSigner(x2, y2, VERIFIERS);
        newOwners.push(newOwner);

        // Two guardians confirm (msg.sender = guardian Safe), then anyone starts the delay.
        _confirm(g1, G1_KEY);
        _confirm(g2, G2_KEY);
        assertEq(srm.getRecoveryApprovals(safe, newOwners, 1), 2);
        srm.executeRecovery(safe, newOwners, 1);
        assertEq(srm.getRecoveryRequest(safe).executeAfter, uint64(block.timestamp + RECOVERY_PERIOD));
    }

    function _confirm(address guardianSafe, uint256 key) internal {
        assertTrue(
            _execFromPlainSafe(
                guardianSafe,
                key,
                SOCIAL_RECOVERY,
                0,
                abi.encodeCall(ISocialRecoveryModule.confirmRecovery, (safe, newOwners, 1, false))
            )
        );
    }

    function _passkeyOp(uint256 pk, address owner, bytes memory initCode, address to, uint256 value, bytes memory data)
        internal
    {
        PackedUserOperation memory op =
            _buildOp(safe, entryPoint.getNonce(safe, 0), initCode, _executeUserOpCallData(to, value, data));
        _signOp(op, pk, owner);
        _handleOp(op);
    }

    function test_guardiansRotatePasskeyAfterDelay() public {
        vm.expectRevert(bytes("SM: recovery period still pending"));
        srm.finalizeRecovery(safe);

        vm.warp(block.timestamp + RECOVERY_PERIOD + 1);
        srm.finalizeRecovery(safe);

        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], newOwner, "owner must be the new passkey signer");
        assertEq(ISafe(safe).getThreshold(), 1);

        // The NEW passkey now controls the Safe ...
        address recipient = makeAddr("recipient");
        vm.deal(safe, 1 wei);
        _passkeyOp(NEW_PASSKEY_PK, newOwner, "", recipient, 1 wei, "");
        assertEq(recipient.balance, 1);

        // ... and the OLD passkey (via the SharedSigner) no longer does.
        PackedUserOperation memory op =
            _buildOp(safe, entryPoint.getNonce(safe, 0), "", _executeUserOpCallData(recipient, 0, ""));
        _signOp(op, PASSKEY_PK, SHARED_SIGNER);
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        entryPoint.handleOps(ops, payable(makeAddr("bundler")));
    }

    function test_ownerCancelsRecoveryDuringDelay() public {
        // The legitimate owner (old passkey) cancels via its own userOp before the delay ends.
        _passkeyOp(PASSKEY_PK, SHARED_SIGNER, "", SOCIAL_RECOVERY, 0, abi.encodeCall(ISocialRecoveryModule.cancelRecovery, ()));
        assertEq(srm.getRecoveryRequest(safe).executeAfter, 0);

        vm.warp(block.timestamp + RECOVERY_PERIOD + 1);
        vm.expectRevert(bytes("SM: no ongoing recovery"));
        srm.finalizeRecovery(safe);

        address[] memory owners = ISafe(safe).getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], SHARED_SIGNER, "owner unchanged");
    }
}
