// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

import {PasskeySafeBase} from "./utils/PasskeySafeBase.sol";
import {IThirdwebAccountFactory, IThirdwebAccount} from "./utils/Interfaces.sol";

interface ICitizenNFTv2 {
    function hasCitizenNFT(address account) external view returns (bool);
}

/// @notice A REAL counterfactual CitizenNFTv2 holder on Gnosis: its thirdweb account was never
///         deployed on chain 100, yet `hasCitizenNFT` is true (a mapping, no code needed). The
///         sponsor policy lets a migration batch start with the permissionless
///         `AccountFactory.createAccount(admin, "")` when `factory.getAddress(admin, "") == legacy`.
///         The admin EOA was read from the same account's deployment on Base (`getAllAdmins`).
contract CounterfactualLegacyTest is PasskeySafeBase {
    address internal constant CITIZEN_NFT_V2 = 0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5;
    address internal constant HOLDER = 0xEbf3C1694FBD80b1a7ab8F82e19A1291Cd795227;
    address internal constant HOLDER_ADMIN = 0x21e70901AbC2656641d08F4eB326484b5Df50e90;
    bytes internal constant LEGACY_PROXY_CODE =
        hex"363d3d373d3d3d363d73f22175c80c6e074c171811c59c6c0087e2a6a3465af43d82803e903d91602b57fd5bf3";

    function setUp() public {
        _fork();
    }

    function test_counterfactualHolderIsCitizenAndDeployable() public {
        assertEq(HOLDER.code.length, 0, "holder must still be counterfactual on Gnosis");
        assertTrue(ICitizenNFTv2(CITIZEN_NFT_V2).hasCitizenNFT(HOLDER), "v2 citizen without code");
        assertEq(IThirdwebAccountFactory(TW_FACTORY).getAddress(HOLDER_ADMIN, ""), HOLDER, "factory.getAddress");

        // Anyone (here: a random relayer, in production the passkey Safe's userOp) may deploy it.
        vm.prank(makeAddr("relayer"));
        address deployed = IThirdwebAccountFactory(TW_FACTORY).createAccount(HOLDER_ADMIN, "");
        assertEq(deployed, HOLDER);
        assertEq(keccak256(HOLDER.code), keccak256(LEGACY_PROXY_CODE), "EIP-1167 proxy to the Account impl");
        assertTrue(IThirdwebAccount(HOLDER).isAdmin(HOLDER_ADMIN), "admin is the original EOA");
        assertTrue(ICitizenNFTv2(CITIZEN_NFT_V2).hasCitizenNFT(HOLDER), "citizenship unchanged");

        // Non-empty data yields another address: the policy only allows data == 0x.
        assertTrue(IThirdwebAccountFactory(TW_FACTORY).getAddress(HOLDER_ADMIN, hex"01") != HOLDER);
    }
}
