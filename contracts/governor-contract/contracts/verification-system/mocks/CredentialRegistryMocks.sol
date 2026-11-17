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
