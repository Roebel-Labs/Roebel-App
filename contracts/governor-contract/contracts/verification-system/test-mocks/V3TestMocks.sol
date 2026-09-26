// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// TEST-ONLY mocks for AttesterNFTv3 / CitizenNFTv3. Never deploy.

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @notice Stand-in for AttesterNFTv2 / CitizenNFTv2: settable holder set + attestationSource.
contract MockV2Identity {
    mapping(address => bool) public holder;
    mapping(address => uint8) public attestationSource;

    function setHolder(address a, bool v) external { holder[a] = v; }
    function setSource(address a, uint8 s) external { attestationSource[a] = s; }
    function hasCitizenNFT(address a) external view returns (bool) { return holder[a]; }
    function hasAttesterNFT(address a) external view returns (bool) { return holder[a]; }
}

/// @notice Stand-in for a thirdweb `Account`: admins may call `execute`, which forwards the
/// call so the target sees `msg.sender == this`. Receives ERC721 like thirdweb's ERC721Holder.
contract MockLegacyAccount is IERC721Receiver {
    mapping(address => bool) public isAdmin;

    constructor(address admin) { isAdmin[admin] = true; }

    function setAdmin(address a, bool v) external {
        require(isAdmin[msg.sender], "not admin");
        isAdmin[a] = v;
    }

    function execute(address target, uint256 value, bytes calldata data) external payable returns (bytes memory) {
        require(isAdmin[msg.sender], "not admin");
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
        return ret;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @notice Safe-like contract account: owner-driven `exec` (so msg.sender == this Safe at the
/// target) and an ERC721 receiver, like a Safe with CompatibilityFallbackHandler /
/// Safe4337Module as fallback handler.
contract MockSafe is IERC721Receiver {
    address public immutable owner;
    uint256 public received;

    constructor(address _owner) { owner = _owner; }

    function exec(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "not owner");
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
        return ret;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        received++;
        return IERC721Receiver.onERC721Received.selector;
    }
}

/// @notice A contract with no ERC721 receiver hook (safeMint to it must revert).
contract MockNonReceiver {
    address public immutable owner;
    constructor(address _owner) { owner = _owner; }
    function exec(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "not owner");
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
        return ret;
    }
}

/// @notice `isAdmin` returns a non-boolean word (2): the link check must fail closed.
contract MockBadIsAdmin is IERC721Receiver {
    function isAdmin(address) external pure returns (uint256) { return 2; }
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
    function exec(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
        return ret;
    }
}
