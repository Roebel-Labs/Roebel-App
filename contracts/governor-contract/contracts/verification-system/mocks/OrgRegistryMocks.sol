// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

/// @notice Test-only stand-ins for OrgRegistry. Never deployed.

/// @dev Minimal Safe: fixed owners, any owner may execute a call as the Safe.
contract MockSafe {
    mapping(address => bool) public isOwner;

    constructor(address[] memory owners) {
        for (uint256 i = 0; i < owners.length; i++) isOwner[owners[i]] = true;
    }

    function exec(address target, bytes calldata data) external returns (bytes memory) {
        require(isOwner[msg.sender], "not owner");
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}

/// @dev Attester set with a settable roster.
contract MockAttesterSet {
    mapping(address => bool) public hasAttesterNFT;
    uint256 public attesterCount;

    function set(address account, bool on) external {
        if (hasAttesterNFT[account] == on) return;
        hasAttesterNFT[account] = on;
        if (on) attesterCount++;
        else attesterCount--;
    }
}

/// @dev Hostile Safe whose isOwner returns one byte (malformed ABI).
contract MockMalformedSafe {
    fallback(bytes calldata) external returns (bytes memory) {
        return hex"01";
    }

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
