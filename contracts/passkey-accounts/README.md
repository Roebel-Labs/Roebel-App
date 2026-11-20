# passkey-accounts — Gnosis fork proofs

Foundry fork tests that prove the whole tranche-1 passkey path against the **real
deployed bytecode on Gnosis (chain 100)**. No contracts are deployed from here and no
Safe / thirdweb sources are vendored: `test/utils/Interfaces.sol` holds minimal
hand-written interfaces (+ `test/utils/SessionInterfaces.sol` for the ERC-7579 stack), each checked against the verified source on Blockscout.

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
| `WordsRecovery.t.sol` | **Recovery words = one guardian entry of two EOA addresses** (BIP-39 `test … junk`, `vm.deriveKey` index 0 and 1, threshold 2). The passkey Safe adds them through its own userOps; the real SRM emits `GuardianAdded(address indexed wallet, address indexed guardian)` and a separate `ChangedThreshold(address indexed wallet, uint256 threshold)` (NOT a 3-arg `GuardianAdded`). A fresh counterfactual passkey Safe then sends ONE sponsored userOp `[createSigner, multiConfirmRecovery(wallet, [signer2], 1, [sig0, sig1] sorted by signer, true)]` with plain 65-byte ECDSA signatures over `getRecoveryHash`; the request exists with `executeAfter == now + 259200` (not instant, owner unchanged). The owner's `cancelRecovery` clears it and bumps the nonce, so the same signatures revert; `finalizeRecovery` before 3 days reverts, after it `getOwners() == [signer2]`. Writes `test/fixtures/words-recovery-vector.json`. |
| `EcdsaSafe.t.sol` | **ECDSA-owner Safe (expert path / recovery words as the account key)**: `Safe.setup(owners=[EOA], 1, SafeModuleSetup, enableModules([Safe4337Module, SocialRecoveryModule]), fallbackHandler=Safe4337Module)` (ONE delegatecall, no MultiSend, no shared signer) matches `createProxyWithNonce`; a sponsored first userOp deploys the Safe and executes with a plain 65-byte ECDSA signature (v 27/28) over `Safe4337Module.getOperationHash`; another key gets `AA24`; ERC-1271 `isValidSignature(h, sig)` returns `0x1626ba7e` for an ECDSA signature over the Safe's `SafeMessage` hash of `abi.encode(h)` (the raw hash or a wrong key revert); a guardian recovery to a NEW EOA (`confirmRecovery` then `finalizeRecovery` after 3 days) leaves `getOwners() == [newEoa]`, emits `AddedOwner(newEoa)`, the new key's ops pass and the old key's fail. Writes `test/fixtures/ecdsa-safe-vector.json`. |
| `PasskeyDetach.t.sol` | **"thirdweb trennen" (detach)**: after the sponsored handover (passkey Safe co-admin) and 2 guardians (threshold 2) added via the Safe's own userOps, the EOA signs `SignerPermissionRequest{signer: eoa, isAdmin: 2}` and the passkey Safe submits it as ONE sponsored userOp (single CALL, value 0, target = legacy). Afterwards `getAllAdmins() == [safe]`, the Safe still drives `legacy.execute` via a sponsored op, the EOA's direct `execute` reverts, and the EOA's ERC-1271 signature (valid before) is dead. Negative: replay reverts `!sig`; the removed EOA's new add-admin request reverts `!sig`; and the chain itself **does** accept the EOA removing the Safe (`isAdmin:2, signer: safe`) while the EOA is still admin, so the server policy must reject any detach whose `signer` is not the EOA. |
| `SessionKeys.t.sol` | **Session keys** (spec `docs/superpowers/specs/2026-09-27-passkey-session-keys-design.md`), on Max's REAL passkey Safe `0xe3d1…2deb` (only cheat: the SharedSigner's (x, y) is swapped for a test passkey via `vm.store`; guardians impersonated with `vm.prank`). ONE sponsored passkey op on the current Safe4337Module path migrates it to Safe7579 (enable adapter as module + fallback handler, `initializeAccount` with SmartSession + 3 sessions, registry off, Safe4337Module disabled); the passkey stays the root (Safe owner, nonce key 0 → `Safe.checkSignatures`). A secp256k1 session key (OwnableValidator) then sends sponsored ops with NO passkey: `legacy.execute(Hub.personalMint)`, `legacy.execute(Hub.groupMint(Röbel group))`, `legacy.execute(Hub.safeTransferFrom(Münzen))` ≤ 50 per transfer / ≤ 100 per session (UniActionPolicy), 30-day expiry (TimeFramePolicy → AA22). 11 out-of-scope shapes fail with the exact SmartSession reason (PolicyViolation / NoPoliciesSet / PolicyCheckReverted) or AA24; revoke-all = 1 passkey op; renew/grant = 1 passkey op (uninstall+reinstall, or install); social recovery still works (sessions survive it → the new passkey revokes); ERC-1271 afterwards needs a 20-byte zero validator prefix. |
| `CounterfactualLegacy.t.sol` | The real v2 citizen `0xEbf3…5227` has no code on Gnosis but `hasCitizenNFT == true`; `AccountFactory.getAddress(0x21e7…0e90, "")` (admin read from Base) equals it; anyone can `createAccount(admin, "")`, which deploys the EIP-1167 Account proxy with the original admin; non-empty data gives another address. |
| `SafeCircles.t.sol` | **A passkey Safe is a Circles v2 human** (pinned to Gnosis block 49325978): existing human `0xdF3e…5f3F` (~6519 own CRC) `trust`s the fresh Safe; the Safe's sponsored deploy userOp `Hub.registerHuman(inviter, digest)` makes `isHuman(safe)` true; after `vm.warp(+1 days)` ONE sponsored batch userOp `[Hub.personalMint(), NameRegistry.updateMetadataDigest(d)]` (MultiSendCallOnly) raises the Safe's own CRC balance and stores the digest. |

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

## Words recovery vector — `test/fixtures/words-recovery-vector.json`

Written by `WordsRecoveryTest::test_writeVector` (deterministic). Copied to
`apps/expo/lib/passkey/__tests__/words-recovery-vector.json`. Fields: `phrase`, `wallet`, `newOwner`,
`newThreshold`, `nonce`, `recoveryHash`, `guardians[2]` (`index`, `address`, `signature`; **pool-index
order**) and `multiConfirmCalldata` (full `multiConfirmRecovery(wallet, [newOwner], 1, sigs, true)` calldata,
signatures **sorted by signer address ascending**). Expo `signWordApprovals` must reproduce `guardians`
byte-for-byte; `encodeMultiConfirmRecovery` must reproduce the calldata.

## ECDSA Safe vector — `test/fixtures/ecdsa-safe-vector.json`

Written by `EcdsaSafeTest::test_writeVector` (deterministic). Copied to
`apps/expo/lib/passkey/__tests__/ecdsa-safe-vector.json` and `apps/web/src/lib/passkey/__tests__/ecdsa-safe-vector.json`.
Owner = key 0 of the public `test … junk` phrase. Fields: `owner`, `safeAddress`, `setupData`, `initCode`,
`userOp` (fixed op with stub `paymasterAndData`, `safeOpHash`, `ownerSignature` = 65 bytes, `userOpSignature` =
`validAfter ++ validUntil ++ ownerSignature`) and `erc1271` (`hash`, `safeMessageHash`, `signature`). TypeScript must
reproduce `safeAddress`, `setupData`, `initCode`, `safeOpHash`, both signatures and `safeMessageHash` byte-for-byte.
