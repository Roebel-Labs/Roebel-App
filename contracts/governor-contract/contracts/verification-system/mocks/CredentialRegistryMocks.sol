// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

/// @notice Test-only stand-ins for CredentialRegistry. Never deployed.

/// @dev One instance serves as CitizenNFT, AttesterNFT and OrgRegistry's attester set.
contract CredMockIdentity {
    mapping(address => bool) public hasCitizenNFT;
    mapping(address => bool) public hasAttesterNFT;
    uint256 public attesterCount;

    function setCitizen(address account, bool on) external {
        hasCitizenNFT[account] = on;
    }

    function setAttester(address account, bool on) external {
        if (hasAttesterNFT[account] == on) return;
        hasAttesterNFT[account] = on;
        if (on) attesterCount++;
        else attesterCount--;
    }
}

/// @dev A contract account that implements no receiver interface (no onERC1155Received).
contract CredMockPlainAccount {
    function exec(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }
}

/// @dev An OrgRegistry whose answers are set freely (an owner-controlled or broken
///      replacement registry). `rolesRevert` makes roleOf/isOrgOwner revert.
contract CredMockOrgRegistry {
    struct Org {
        address safe;
        uint64 generation;
        uint64 registeredAt;
        string metadataURI;
    }

    mapping(bytes32 => bool) public isRegistered;
    mapping(bytes32 => Org) private _orgs;
    mapping(bytes32 => mapping(address => uint8)) private _roles;
    mapping(bytes32 => mapping(address => bool)) private _owners;
    bool public rolesRevert;

    function setOrg(bytes32 orgId, address safe, uint64 generation, bool registered) external {
        isRegistered[orgId] = registered;
        _orgs[orgId] = Org(safe, generation, uint64(block.timestamp), "");
    }

    function setRole(bytes32 orgId, address account, uint8 role) external {
        _roles[orgId][account] = role;
    }

    function setOrgOwner(bytes32 orgId, address account, bool on) external {
        _owners[orgId][account] = on;
    }

    function setRolesRevert(bool on) external {
        rolesRevert = on;
    }

    function getOrg(bytes32 orgId) external view returns (Org memory) {
        return _orgs[orgId];
    }

    function roleOf(bytes32 orgId, address account) external view returns (uint8) {
        require(!rolesRevert, "broken");
        return _roles[orgId][account];
    }

    function isOrgOwner(bytes32 orgId, address account) external view returns (bool) {
        require(!rolesRevert, "broken");
        return _owners[orgId][account];
    }
}
