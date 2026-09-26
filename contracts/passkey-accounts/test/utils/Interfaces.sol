// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

// Minimal hand-written interfaces for the contracts DEPLOYED on Gnosis (chain 100).
// Every signature below was checked against the verified source on Blockscout
// (2026-09-26). Nothing here is vendored; the fork tests run the real bytecode.

/// @dev ERC-4337 v0.7 PackedUserOperation (eth-infinitism v0.7).
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits; // verificationGasLimit (hi 128) | callGasLimit (lo 128)
    uint256 preVerificationGas;
    bytes32 gasFees; // maxPriorityFeePerGas (hi 128) | maxFeePerGas (lo 128)
    bytes paymasterAndData;
    bytes signature;
}

/// @dev EntryPoint v0.7 at 0x0000000071727De22E5E9d8BAf0edAc6f37da032.
interface IEntryPointV07 {
    function handleOps(PackedUserOperation[] calldata ops, address payable beneficiary) external;
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
    function getUserOpHash(PackedUserOperation calldata userOp) external view returns (bytes32);
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

/// @dev thirdweb `SignerPermissionRequest` (IAccountPermissions).
struct SignerPermissionRequest {
    address signer;
    uint8 isAdmin;
    address[] approvedTargets;
    uint256 nativeTokenLimitPerTransaction;
    uint128 permissionStartTimestamp;
    uint128 permissionEndTimestamp;
    uint128 reqValidityStartTimestamp;
    uint128 reqValidityEndTimestamp;
    bytes32 uid;
}

/// @dev thirdweb AccountFactory 0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00 (BaseAccountFactory).
interface IThirdwebAccountFactory {
    function createAccount(address admin, bytes calldata data) external returns (address);
    function getAddress(address adminSigner, bytes calldata data) external view returns (address);
    function accountImplementation() external view returns (address);
}

/// @dev thirdweb Account (impl 0xf22175c80c6e074c171811c59c6c0087e2a6a346), EntryPoint v0.6.
interface IThirdwebAccount {
    function setPermissionsForSigner(SignerPermissionRequest calldata req, bytes calldata signature) external;
    function verifySignerPermissionRequest(SignerPermissionRequest calldata req, bytes calldata signature)
        external
        view
        returns (bool success, address signer);
    function isAdmin(address account) external view returns (bool);
    function getAllAdmins() external view returns (address[] memory);
    function execute(address target, uint256 value, bytes calldata data) external;
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata data) external;
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4);
}

/// @dev Safe 1.4.1 (SafeL2 singleton 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762).
interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 nonce
    ) external view returns (bytes32);
    function nonce() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
    function isModuleEnabled(address module) external view returns (bool);
}

/// @dev SafeProxyFactory 1.4.1 at 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67.
interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
    function proxyCreationCode() external pure returns (bytes memory);
}

/// @dev MultiSend 1.4.1 at 0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526 (delegatecall only).
interface IMultiSend {
    function multiSend(bytes memory transactions) external payable;
}

/// @dev SafeModuleSetup v0.3.0 at 0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47 (delegatecall only).
interface ISafeModuleSetup {
    function enableModules(address[] calldata modules) external;
}

/// @dev Safe4337Module v0.3.0 at 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226 (EntryPoint v0.7).
interface ISafe4337Module {
    function executeUserOp(address to, uint256 value, bytes memory data, uint8 operation) external;
    function executeUserOpWithErrorString(address to, uint256 value, bytes memory data, uint8 operation) external;
    function getOperationHash(PackedUserOperation calldata userOp) external view returns (bytes32);
    function domainSeparator() external view returns (bytes32);
    function SUPPORTED_ENTRYPOINT() external view returns (address);
}

/// @dev SafeWebAuthnSharedSigner 0.2.1 at 0x94a4F6affBd8975951142c3999aEAB7ecee555c2.
///      `verifiers` is the P256.Verifiers user type = uint176.
interface ISafeWebAuthnSharedSigner {
    struct Signer {
        uint256 x;
        uint256 y;
        uint176 verifiers;
    }

    function configure(Signer memory signer) external;
    function getConfiguration(address account) external view returns (Signer memory);
}

/// @dev SafeWebAuthnSignerFactory 0.2.1 at 0x1d31F259eE307358a26dFb23EB365939E8641195.
interface ISafeWebAuthnSignerFactory {
    function getSigner(uint256 x, uint256 y, uint176 verifiers) external view returns (address);
    function createSigner(uint256 x, uint256 y, uint176 verifiers) external returns (address);
    function isValidSignatureForSigner(bytes32 message, bytes calldata signature, uint256 x, uint256 y, uint176 verifiers)
        external
        view
        returns (bytes4 magicValue);
}

/// @dev Candide SocialRecoveryModule at 0x38275826E1933303E508433dD5f289315Da2541c.
interface ISocialRecoveryModule {
    struct RecoveryRequest {
        uint256 guardiansApprovalCount;
        uint256 newThreshold;
        uint64 executeAfter;
        address[] newOwners;
    }

    function addGuardianWithThreshold(address guardian, uint256 threshold) external;
    function confirmRecovery(address wallet, address[] calldata newOwners, uint256 newThreshold, bool execute)
        external;
    function executeRecovery(address wallet, address[] calldata newOwners, uint256 newThreshold) external;
    function finalizeRecovery(address wallet) external;
    function cancelRecovery() external;
    function isGuardian(address wallet, address guardian) external view returns (bool);
    function guardiansCount(address wallet) external view returns (uint256);
    function threshold(address wallet) external view returns (uint256);
    function getRecoveryRequest(address wallet) external view returns (RecoveryRequest memory);
    function getRecoveryApprovals(address wallet, address[] calldata newOwners, uint256 newThreshold)
        external
        view
        returns (uint256);
}

/// @dev NetizenVerifyingPaymaster at 0x11ed03Db610c88b010FfE38B13142D3657f2E84f (voucher v2).
interface INetizenVerifyingPaymaster {
    function sponsorSigner() external view returns (address);
    function getDeposit() external view returns (uint256);
    function entryPoint() external view returns (address);
    function hashStableFields(PackedUserOperation calldata userOp) external pure returns (bytes32);
    function hashSponsorshipVoucher(
        bytes32 userOpHash,
        bytes32 subjectHash,
        uint256 maxCostWei,
        uint48 validAfter,
        uint48 validUntil,
        bytes32 nonce
    ) external view returns (bytes32);
    function usedVoucherNonces(address sender, bytes32 voucherNonce) external view returns (bool);
}
