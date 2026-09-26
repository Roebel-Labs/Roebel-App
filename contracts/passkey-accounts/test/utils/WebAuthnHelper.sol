// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.24;

/// @title WebAuthnHelper
/// @notice Builds WebAuthn assertion data exactly the way the deployed
///         SafeWebAuthnSharedSigner 0.2.1 / WebAuthn library re-derives it:
///         - clientDataJSON = `{"type":"webauthn.get","challenge":"<b64url(challenge)>",` ++ fields ++ `}`
///           (challenge = 32 bytes, base64url WITHOUT padding = 43 chars)
///         - signed message  = sha256(authenticatorData ++ sha256(clientDataJSON))
///         - WebAuthn sig    = abi.encode(bytes authenticatorData, string clientDataFields, uint256 r, uint256 s)
///         - Safe contract signature (one owner, v = 0):
///             r = uint256(uint160(owner)) | s = 65 (offset of the dynamic part) | v = 0x00
///             ++ uint256(len(webauthnSig)) ++ webauthnSig
///         - Safe4337Module userOp signature = uint48 validAfter ++ uint48 validUntil ++ safeSignatures
library WebAuthnHelper {
    /// @dev secp256r1 group order n.
    uint256 internal constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    /// @dev Default additional client-data fields (everything after the challenge, minus the closing brace).
    string internal constant DEFAULT_CLIENT_DATA_FIELDS = '"origin":"https://roebel.app"';

    bytes internal constant B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    /// @notice base64url encoding without padding.
    function base64Url(bytes memory data) internal pure returns (string memory) {
        uint256 len = data.length;
        if (len == 0) return "";
        uint256 outLen = (len * 8 + 5) / 6;
        bytes memory out = new bytes(outLen);
        uint256 bitBuf;
        uint256 bitCount;
        uint256 j;
        for (uint256 i = 0; i < len; i++) {
            bitBuf = (bitBuf << 8) | uint8(data[i]);
            bitCount += 8;
            while (bitCount >= 6) {
                bitCount -= 6;
                out[j++] = B64URL[(bitBuf >> bitCount) & 0x3f];
            }
        }
        if (bitCount > 0) {
            out[j++] = B64URL[(bitBuf << (6 - bitCount)) & 0x3f];
        }
        return string(out);
    }

    /// @notice authenticatorData = sha256(rpId) ++ flags ++ uint32 signCount (no attested data / extensions).
    ///         flags 0x05 = UP | UV (UV is REQUIRED by the Safe signer).
    function authenticatorData(string memory rpId, uint8 flags, uint32 signCount) internal pure returns (bytes memory) {
        return abi.encodePacked(sha256(bytes(rpId)), bytes1(flags), bytes4(signCount));
    }

    function clientDataJson(bytes32 challenge, string memory clientDataFields) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '{"type":"webauthn.get","challenge":"',
                base64Url(abi.encodePacked(challenge)),
                '",',
                clientDataFields,
                "}"
            )
        );
    }

    /// @notice The digest the authenticator's ECDSA-P256 signature covers (already sha256'd = prehash).
    function signingDigest(bytes memory authData, string memory clientDataJSON) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(authData, sha256(bytes(clientDataJSON))));
    }

    function lowS(uint256 s) internal pure returns (uint256) {
        return s > P256_N / 2 ? P256_N - s : s;
    }

    function encodeWebAuthnSignature(bytes memory authData, string memory clientDataFields, uint256 r, uint256 s)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(authData, clientDataFields, r, s);
    }

    /// @notice Safe `checkNSignatures` contract-signature layout for exactly ONE owner.
    function safeContractSignature(address owner, bytes memory contractSig) internal pure returns (bytes memory) {
        return abi.encodePacked(
            bytes32(uint256(uint160(owner))), bytes32(uint256(65)), uint8(0), uint256(contractSig.length), contractSig
        );
    }

    /// @notice Final `PackedUserOperation.signature` for the Safe4337Module.
    function userOpSignature(uint48 validAfter, uint48 validUntil, bytes memory safeSignatures)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(validAfter, validUntil, safeSignatures);
    }
}
