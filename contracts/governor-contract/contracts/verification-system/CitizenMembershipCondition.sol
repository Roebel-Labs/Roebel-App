// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.28;

/// @notice Circles v2 BaseGroup membership-condition interface
/// (aboutcircles/circles-groups: src/membership-conditions/IMembershipCondition.sol).
interface IMembershipCondition {
    function passesMembershipCondition(address avatar) external returns (bool);
}

interface ICitizenNFT {
    function hasCitizenNFT(address account) external view returns (bool);
}

/// @title CitizenMembershipCondition
/// @notice Gates a Circles "Röbel" BaseGroup so ONLY verified Röbel citizens (holders of
/// the soulbound CitizenNFT) can join the group — i.e. only citizens can convert their
/// personal CRC into the Röbel-Taler group token (RCRC). Modeled on Circles' own
/// IsHumanCondition, but checks CitizenNFT.hasCitizenNFT instead of hub.isHuman.
///
/// This controls GROUP ACCESS (membership), which is separate from the mint POLICY
/// (token mint/burn/redeem mechanics). Pair this with the STANDARD Base Mint Policy.
contract CitizenMembershipCondition is IMembershipCondition {
    /// @notice Röbel CitizenNFT on Gnosis (soulbound; 1 = verified citizen).
    ICitizenNFT public immutable citizenNFT;

    constructor(address _citizenNFT) {
        require(_citizenNFT != address(0), "citizenNFT=0");
        citizenNFT = ICitizenNFT(_citizenNFT);
    }

    /// @notice Passes iff `avatar` holds a Röbel CitizenNFT.
    function passesMembershipCondition(address avatar) external view returns (bool) {
        return citizenNFT.hasCitizenNFT(avatar);
    }
}
