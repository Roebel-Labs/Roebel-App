// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ThresholdBands
/// @notice Scale-aware signature thresholds shared by AttesterNFTv2 / CitizenNFTv2.
///
/// A gate's required signer count is:
///     required = clamp( ceil(setSize * percentBps / 10000), floor, cap )
///
/// - A *percentage band* scales with the live set size (attester or citizen count),
///   bounded below by `floor` (early-stage behaviour) and above by `cap`
///   (so high-throughput gates never explode). Use `cap = type(uint16).max` for "no cap".
/// - A *fixed* threshold is just `percentBps = 0` with `floor == cap` (e.g. (0,1,1) = always 1),
///   so onboarding co-signs stay constant no matter how large the population grows.
library ThresholdBands {
    struct Band {
        uint16 percentBps; // 0..10000 (basis points)
        uint16 floor;      // >= 1
        uint16 cap;        // >= floor; type(uint16).max == no cap
    }

    function validate(Band memory b) internal pure {
        require(b.floor >= 1, "floor >= 1");
        require(b.cap >= b.floor, "cap >= floor");
        require(b.percentBps <= 10000, "bps <= 10000");
    }

    /// @notice required signer count for a gate of size `setSize`.
    function required(Band memory b, uint256 setSize) internal pure returns (uint256 r) {
        r = (setSize * uint256(b.percentBps) + 9999) / 10000; // ceilDiv
        if (r < b.floor) r = b.floor;
        if (r > b.cap) r = b.cap;
    }
}
