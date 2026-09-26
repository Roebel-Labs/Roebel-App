# passkey-accounts — Gnosis fork proofs

Foundry fork tests that prove the whole tranche-1 passkey path against the **real
deployed bytecode on Gnosis (chain 100)**. No contracts are deployed from here and no
Safe / thirdweb sources are vendored: `test/utils/Interfaces.sol` holds minimal
hand-written interfaces, each checked against the verified source on Blockscout.

Spec: `docs/superpowers/specs/2026-09-26-passkey-sovereign-accounts-design.md`
Plan: `docs/superpowers/plans/2026-09-26-passkey-accounts-tranche-1.md` (Task 1)

## Setup

```bash
cd contracts/passkey-accounts
forge install foundry-rs/forge-std --no-git   # lib/ is gitignored
forge test -vvv                               # forks https://gnosis-rpc.publicnode.com
```

Foundry ≥ 1.5.1 (needs `vm.publicKeyP256` / `vm.signP256`). `via_ir = true` (stack depth).

## What each test proves

| Test contract | Proves |
|---|---|
| `LegacyHandover.t.sol` | A Safe becomes co-admin of a legacy thirdweb `Account` via an EOA-signed EIP-712 `SignerPermissionRequest{isAdmin:1}` (domain `Account`/`1`/100/account) relayed by anyone; the Safe can then call `execute`; a replay reverts `!sig`; after the EOA signs its own removal (`isAdmin:2`) the Safe keeps control, the EOA's direct `execute` reverts, and the account **loses ERC-1271** (reverts `Account: caller not approved target.`). |
| `PasskeySafeSponsored.t.sol` | Counterfactual passkey Safe (owner SafeWebAuthnSharedSigner, Safe4337Module + SocialRecoveryModule enabled, fallback handler Safe4337Module) matches `createProxyWithNonce`; WebAuthn-signed v0.7 userOps sponsored by the live NetizenVerifyingPaymaster (voucher v2, 372-byte `paymasterAndData`, sponsor key swapped via `vm.store` on slot 3) deploy the Safe and (a) transfer 1 wei, (b) submit the **handover** to the legacy account (value 0), then drive `legacy.execute`; a wrong passkey fails `AA24`; the P-256 verifier packing works with the FCL fallback; our voucher encoding reproduces `test/fixtures/voucher-vector.json` (copied from netizen_labs); writes the golden vector. |
| `SocialRecovery.t.sol` | Passkey Safe adds 3 guardian Safes (threshold 2) through its own userOps; 2 guardians `confirmRecovery(..., false)`; `executeRecovery` starts the 259200 s delay; `finalizeRecovery` before the delay reverts; after it, the owner is the new passkey's `SafeWebAuthnSignerFactory` signer, the new passkey can sign userOps and the old one gets `AA24`. Negative: the owner's `cancelRecovery` userOp during the delay makes finalize revert `SM: no ongoing recovery`. |
| `GuardianErc1271.t.sol` | **ERC-1271 works on a passkey Safe**: `isValidSignature(h, sig)` returns `0x1626ba7e` when the WebAuthn challenge is the Safe's EIP-712 `SafeMessage` hash of `abi.encode(h)` (Safe4337Module v0.3.0 inherits CompatibilityFallbackHandler 1.4.1); wrong key / raw-hash challenge revert. Guardian passkey Safes approve a Candide `getRecoveryHash` off-chain; the recovering person's NEW passkey Safe submits one sponsored op (deploy + `SignerFactory.createSigner(newKey)` + `multiConfirmRecovery(..., execute=true)`), then a sponsored `finalizeRecovery`; afterwards the wallet signs userOps and 1271 messages through the per-key signer. A COUNTERFACTUAL guardian Safe cannot sign off-chain (`SM: Invalid guardian signature`) and confirms on-chain instead (its own sponsored deploy + `confirmRecovery`). Approvals for other owners or after `invalidateNonce` are rejected. Writes `test/fixtures/recovery-vector.json`. |
| `CounterfactualLegacy.t.sol` | The real v2 citizen `0xEbf3…5227` has no code on Gnosis but `hasCitizenNFT == true`; `AccountFactory.getAddress(0x21e7…0e90, "")` (admin read from Base) equals it; anyone can `createAccount(admin, "")`, which deploys the EIP-1167 Account proxy with the original admin; non-empty data gives another address. |

## P-256 precompile note

Foundry's fork EVM (1.5.1, `cancun`) does **not** implement the RIP-7212 precompile at
`0x100`, so on the fork every WebAuthn verification runs through the FCL fallback
(`0xA86e…5DBA`) — i.e. the fork measures the worst-case gas. Live Gnosis **does** have
`0x100` (a `cast call` with a valid signature returns `1`). The verifier packing
`(0x0100 << 160) | FCL` covers both.

## Golden vector contract — `test/fixtures/passkey-safe-vector.json`

Written by `PasskeySafeSponsoredTest::test_writeVector` (deterministic; re-running it
must produce an identical file). **Task 3 TypeScript must reproduce, byte-for-byte:**

- `safeAddress`, `setupData` (Safe `setup` initializer) and `initCode` from `x`, `y`, `verifiers`, `saltNonce`
- `handover.digest` (EIP-712 `SignerPermissionRequest`, verified against the real Account via
  `verifySignerPermissionRequest`) and `handover.signature` (RFC 6979, key `eoaPrivateKey`)
- `userOp.safeOpHash` for the fixed userOp (`Safe4337Module.getOperationHash` on the real module)
- `webauthn.webAuthnSignature`, `webauthn.safeSignature`, `webauthn.userOpSignature` for the fixed
  (`authenticatorData`, `clientDataJSONHex`, `r`, `s`) — verified on the real
  `SafeWebAuthnSignerFactory.isValidSignatureForSigner`

`clientDataJSON` is stored as hex (`clientDataJSONHex`) because forge's JSON writer
re-parses JSON-looking strings into objects. All keys in the vector are test-only.
