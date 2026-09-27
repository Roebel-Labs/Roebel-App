// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {PackedUserOperation} from "./Interfaces.sol";

// Minimal hand-written interfaces for the ERC-7579 session-key stack DEPLOYED on Gnosis
// (chain 100). Every signature/struct below was checked against the verified source on
// Blockscout (2026-09-27). Nothing is vendored; the fork tests run the real bytecode.
//
//   Safe7579 adapter      0x7579EE8307284F293B1927136486880611F20002  (Rhinestone, solc 0.8.26)
//   SmartSession          0x00000000002B0eCfbD0496EE71e01257dA0E37DE  (Rhinestone+Biconomy, solc 0.8.28)
//   OwnableValidator      0x000000000013fdB5234E4E3162a810F54d9f7E98  (ISessionValidator, ECDSA)
//   UniActionPolicy       0x0000000000714Cf48FcF88A0bFBa70d313415032
//   TimeFramePolicy       0x0000000000D30f611fA3bf652ac6879428586930

/// @dev Safe7579 DataTypes.sol
struct ModuleInit {
    address module;
    bytes initData;
}

/// @dev Safe7579 DataTypes.sol (registry typed as IERC7484 there; ABI = address)
struct RegistryInit {
    address registry;
    address[] attesters;
    uint8 threshold;
}

/// @dev ERC-7579 Execution (batch mode element)
struct Execution {
    address target;
    uint256 value;
    bytes callData;
}

/// @dev Safe7579 adapter, reached as the Safe's fallback handler (and enabled as a Safe module).
interface ISafe7579 {
    function execute(bytes32 mode, bytes calldata executionCalldata) external;
    function installModule(uint256 moduleType, address module, bytes calldata initData) external;
    function uninstallModule(uint256 moduleType, address module, bytes calldata deInitData) external;
    function isModuleInstalled(uint256 moduleType, address module, bytes calldata additionalContext)
        external
        view
        returns (bool);
    function initializeAccount(
        ModuleInit[] calldata validators,
        ModuleInit[] calldata executors,
        ModuleInit[] calldata fallbacks,
        ModuleInit[] calldata hooks,
        RegistryInit calldata registryInit
    ) external;
    function getSafeOp(PackedUserOperation calldata userOp, address entryPoint)
        external
        view
        returns (bytes memory operationData, uint48 validAfter, uint48 validUntil, bytes memory signatures);
    function domainSeparator() external view returns (bytes32);
    function getNonce(address safe, address validator) external view returns (uint256);
    function isValidSignature(bytes32 hash, bytes calldata data) external view returns (bytes4);
}

/// @dev Safe 1.4.1 owner/module management (all `authorized` = self-calls).
interface ISafeAdmin {
    function enableModule(address module) external;
    function disableModule(address prevModule, address module) external;
    function setFallbackHandler(address handler) external;
    function getModulesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory array, address next);
    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
}

// ---- SmartSession DataTypes.sol ----

struct PolicyData {
    address policy;
    bytes initData;
}

struct ActionData {
    bytes4 actionTargetSelector;
    address actionTarget;
    PolicyData[] actionPolicies;
}

struct ERC7739Context {
    bytes32 appDomainSeparator;
    string[] contentNames;
}

struct ERC7739Data {
    ERC7739Context[] allowedERC7739Content;
    PolicyData[] erc1271Policies;
}

struct Session {
    address sessionValidator;
    bytes sessionValidatorInitData;
    bytes32 salt;
    PolicyData[] userOpPolicies;
    ERC7739Data erc7739Policies;
    ActionData[] actions;
    bool permitERC4337Paymaster;
}

interface ISmartSession {
    function getPermissionId(Session calldata session) external pure returns (bytes32);
    function getPermissionIDs(address account) external view returns (bytes32[] memory);
    function removeSession(bytes32 permissionId) external;
    function enableSessions(Session[] calldata sessions) external returns (bytes32[] memory);
    function isInitialized(address smartAccount) external view returns (bool);
}

// ---- UniActionPolicy ----

struct LimitUsage {
    uint256 limit;
    uint256 used;
}

/// @dev condition: 0 EQUAL, 1 GREATER_THAN, 2 LESS_THAN, 3 GREATER_THAN_OR_EQUAL,
///      4 LESS_THAN_OR_EQUAL, 5 NOT_EQUAL, 6 IN_RANGE. `offset` is counted from the byte AFTER
///      the 4-byte selector of the checked calldata; the rule reads 32 bytes there.
struct ParamRule {
    uint8 condition;
    uint64 offset;
    bool isLimited;
    bytes32 ref;
    LimitUsage usage;
}

struct ParamRules {
    uint256 length;
    ParamRule[16] rules;
}

struct ActionConfig {
    uint256 valueLimitPerUse;
    ParamRules paramRules;
}

// ---- Circles v2 Hub (0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8) ----

interface ICirclesHub {
    function personalMint() external;
    function groupMint(address group, address[] calldata collateralAvatars, uint256[] calldata amounts, bytes calldata data)
        external;
    function trust(address trustReceiver, uint96 expiry) external;
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function calculateIssuance(address human) external view returns (uint256, uint256, uint256);
    function isHuman(address human) external view returns (bool);
    function isTrusted(address truster, address trustee) external view returns (bool);
}

interface ISocialRecoveryGuardians {
    function getGuardians(address wallet) external view returns (address[] memory);
}
