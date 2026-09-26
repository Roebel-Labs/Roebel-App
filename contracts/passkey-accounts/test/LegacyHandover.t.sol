// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {SignerPermissionRequest, IThirdwebAccountFactory, IThirdwebAccount} from "./utils/Interfaces.sol";

/// @notice Proves, against the REAL thirdweb AccountFactory/Account bytecode on Gnosis, that a
///         contract (a Safe) can be made co-admin of a legacy thirdweb smart account via an
///         EOA-signed SignerPermissionRequest, and what happens when the EOA is later removed.
contract LegacyHandoverTest is PasskeySafeBase {
    uint256 internal constant EOA_KEY = 0xA11CE;
    uint256 internal constant SAFE_OWNER_KEY = 0xB0B;

    address internal eoa;
    IThirdwebAccount internal legacy;
    address internal safe;
    address internal recipient;

    function setUp() public {
        _fork();
        eoa = vm.addr(EOA_KEY);
        legacy = IThirdwebAccount(IThirdwebAccountFactory(TW_FACTORY).createAccount(eoa, ""));
        assertTrue(legacy.isAdmin(eoa), "EOA must be the initial admin");
        safe = _deployPlainSafe(vm.addr(SAFE_OWNER_KEY), uint256(keccak256("legacy-handover-standin")));
        recipient = makeAddr("recipient");
        vm.deal(address(legacy), 1 ether);
    }

    function _addSafeAsAdmin() internal returns (SignerPermissionRequest memory req, bytes memory sig) {
        req = _permissionRequest(
            safe, 1, uint128(block.timestamp), uint128(block.timestamp + 1 hours), keccak256("add")
        );
        sig = _signHandover(EOA_KEY, address(legacy), req);
        // The request is relayed by an unrelated address: setPermissionsForSigner is permissionless.
        vm.prank(makeAddr("relayer"));
        legacy.setPermissionsForSigner(req, sig);
    }

    function test_safeBecomesCoAdminAndCanExecute() public {
        _addSafeAsAdmin();
        assertTrue(legacy.isAdmin(safe), "Safe must be admin");
        assertTrue(legacy.isAdmin(eoa), "EOA stays admin (tranche 1 is additive)");

        uint256 before = recipient.balance;
        bool ok = _execFromPlainSafe(
            safe, SAFE_OWNER_KEY, address(legacy), 0, abi.encodeCall(IThirdwebAccount.execute, (recipient, 1 wei, ""))
        );
        assertTrue(ok, "Safe execTransaction failed");
        assertEq(recipient.balance, before + 1, "recipient must receive 1 wei from the legacy account");
    }

    function test_replayReverts() public {
        (SignerPermissionRequest memory req, bytes memory sig) = _addSafeAsAdmin();
        vm.expectRevert(bytes("!sig"));
        legacy.setPermissionsForSigner(req, sig);
    }

    function test_eoaRemovalFreezesAdminSetAndKillsErc1271() public {
        _addSafeAsAdmin();

        // Sign an ERC-1271 message BEFORE removal (valid while the EOA is admin).
        bytes32 hash = keccak256("some app message");
        bytes32 accountMsgHash = _accountMessageHash(address(legacy), hash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EOA_KEY, accountMsgHash);
        bytes memory eoaSig = abi.encodePacked(r, s, v);
        assertEq(legacy.isValidSignature(hash, eoaSig), bytes4(0x1626ba7e), "pre-removal ERC-1271 must be valid");

        SignerPermissionRequest memory removeReq = _permissionRequest(
            eoa, 2, uint128(block.timestamp), uint128(block.timestamp + 1 hours), keccak256("remove")
        );
        legacy.setPermissionsForSigner(removeReq, _signHandover(EOA_KEY, address(legacy), removeReq));

        assertFalse(legacy.isAdmin(eoa), "EOA must be removed");
        assertTrue(legacy.isAdmin(safe), "Safe must still be admin");

        // Safe still controls the legacy account.
        uint256 before = recipient.balance;
        assertTrue(
            _execFromPlainSafe(
                safe,
                SAFE_OWNER_KEY,
                address(legacy),
                0,
                abi.encodeCall(IThirdwebAccount.execute, (recipient, 1 wei, ""))
            )
        );
        assertEq(recipient.balance, before + 1);

        // The EOA can no longer call execute directly.
        vm.prank(eoa);
        vm.expectRevert(bytes("Account: not admin or EntryPoint."));
        legacy.execute(recipient, 1 wei, "");

        // ERC-1271 loss: the legacy account only ECDSA-recovers, so after removal it cannot
        // validate the EOA's signatures any more (real bytecode reverts with
        // "Account: caller not approved target.").
        try legacy.isValidSignature(hash, eoaSig) returns (bytes4 magic) {
            assertTrue(magic != bytes4(0x1626ba7e), "post-removal ERC-1271 must NOT be valid");
        } catch Error(string memory reason) {
            assertEq(reason, "Account: caller not approved target.");
        }
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
}
