// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {PackedUserOperation, ICirclesHub, ICirclesNameRegistry} from "./utils/Interfaces.sol";

/// @notice A passkey Safe is accepted by the live Circles v2 Hub as a human: an existing human
///         trusts the fresh Safe, the Safe's sponsored userOp `registerHuman(inviter, digest)` makes
///         `isHuman(safe)` true, and a day later one batched userOp `[personalMint(),
///         updateMetadataDigest(d)]` mints and syncs the profile. Pinned to a fork block so the
///         inviter's balance cannot drift.
contract SafeCirclesTest is PasskeySafeBase {
    address internal constant HUB = 0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8;
    address internal constant NAME_REGISTRY = 0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474;
    address internal constant MULTI_SEND_CALL_ONLY = 0x9641d764fc13c8B624c04430C7356C1C7C8102e2;
    /// Existing Circles human with ~6519 own CRC at FORK_BLOCK (>= the 96 CRC an invitation costs).
    address internal constant INVITER = 0xdF3e3e4Fd42D6fE99e3313E6A88437b53b3e5f3F;
    uint256 internal constant FORK_BLOCK = 49_325_978;

    ICirclesHub internal hub = ICirclesHub(HUB);
    uint256 internal x;
    uint256 internal y;
    bytes internal initializer;
    address internal safe;

    function setUp() public {
        vm.createSelectFork("gnosis", FORK_BLOCK);
        assertEq(block.chainid, 100, "not Gnosis");
        (x, y) = vm.publicKeyP256(PASSKEY_PK);
        initializer = _passkeySafeInitializer(x, y);
        safe = _predictSafe(initializer, SAFE_SALT_NONCE);
        _takeOverSponsorSigner();
    }

    function _sponsoredOp(bytes memory initCode, bytes memory callData) internal returns (PackedUserOperation memory op) {
        op = _buildOp(safe, entryPoint.getNonce(safe, 0), initCode, callData);
        _sponsor(op);
        _signOp(op, PASSKEY_PK, SHARED_SIGNER);
    }

    function test_passkeySafeJoinsCirclesAndMints() public {
        assertTrue(hub.isHuman(INVITER), "inviter must be a human at the pinned block");
        assertGe(hub.balanceOf(INVITER, uint256(uint160(INVITER))), 96 ether, "inviter needs >= 96 CRC");
        assertFalse(hub.isHuman(safe));

        // The inviter trusts the (still counterfactual) Safe.
        vm.prank(INVITER);
        hub.trust(safe, type(uint96).max);

        // Op 1 (deploys the Safe): registerHuman(inviter, digest).
        bytes32 digest = keccak256("roebel-profile-v1");
        _handleOp(
            _sponsoredOp(
                _safeInitCode(initializer, SAFE_SALT_NONCE),
                _executeUserOpCallData(HUB, 0, abi.encodeCall(ICirclesHub.registerHuman, (INVITER, digest)))
            )
        );
        assertTrue(hub.isHuman(safe), "Safe must be a Circles human");

        // Op 2, a day later: [personalMint(), updateMetadataDigest(d2)] as ONE batch.
        vm.warp(block.timestamp + 1 days);
        uint256 id = uint256(uint160(safe));
        uint256 before = hub.balanceOf(safe, id);
        bytes32 digest2 = keccak256("roebel-profile-v2");
        bytes memory txs = abi.encodePacked(
            _multiSendTx(0, HUB, 0, abi.encodeCall(ICirclesHub.personalMint, ())),
            _multiSendTx(0, NAME_REGISTRY, 0, abi.encodeCall(ICirclesNameRegistry.updateMetadataDigest, (digest2)))
        );
        _handleOp(
            _sponsoredOp(
                "",
                abi.encodeWithSignature(
                    "executeUserOp(address,uint256,bytes,uint8)",
                    MULTI_SEND_CALL_ONLY,
                    uint256(0),
                    abi.encodeWithSignature("multiSend(bytes)", txs),
                    uint8(1)
                )
            )
        );
        assertGt(hub.balanceOf(safe, id), before, "personalMint must raise the Safe's own CRC");
        assertEq(ICirclesNameRegistry(NAME_REGISTRY).getMetadataDigest(safe), digest2, "profile digest synced");
    }
}
