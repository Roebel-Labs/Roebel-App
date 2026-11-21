# Session keys: audit gate for the deployed Gnosis modules (2026-11-21)

Read-only check, nothing done on-chain. The question: does the code deployed on Gnosis (chain 100) for each module the
passkey session-key design uses (`apps/web/src/lib/passkey/session-keys-builders.ts`) match a source commit that an
audit covered, with the audit's fixes in it?

## Method

1. **Sourcify v2** (`/server/v2/contract/100/<addr>`): all five addresses are verified. Sourcify gives the verified
   sources, compiler version and settings. Blockscout's API is behind a Cloudflare challenge, so it was not used.
2. **Find the source commit.** Each verified source tree was compared file by file, using git blob hashes, against
   every commit of the upstream repo: `erc7579/smartsessions`, `rhinestonewtf/safe7579`, `rhinestonewtf/core-modules`
   and `rhinestonewtf/checknsignatures`.
3. **Check bytecode independently.** For SmartSession, UniActionPolicy and TimeFramePolicy, the repo's committed
   build artifacts (`artifacts/*/…json` `deployedBytecode`, with the CBOR metadata stripped) were compared against
   `eth_getCode` from `rpc.gnosischain.com`.
4. **Read the audit PDFs.** The PDFs in each repo's `audits/` folder were converted to text (PyMuPDF). From each one
   we took the audited and mitigation commits, the scope, and every finding's status. We then checked with
   `git merge-base --is-ancestor` and diffs whether each audited or fixed commit is an ancestor of the deployed
   source, or the same as it.

## Results per module

### SmartSession `0x00000000002B0eCfbD0496EE71e01257dA0E37DE`: PASS

- **Verification:** Sourcify partial ("match") match; only the metadata hash differs. solc 0.8.28, 833 runs, cancun.
  Deployed in Gnosis block 37706236.
- **Source:** `erc7579/smartsessions` **v1.0.0** (tag `dc20f0b`, Dec 2024). The 21 project files are identical to
  `8244adf` (PR #150) and to **`fa4a4d78`**, the "Mitigation Hash" of the last pre-deploy audit (Renascence v2.0).
  The runtime bytecode is identical to the repo artifact from `f24dddf` ("add smart sessions deployments",
  2024-12-25) once metadata is stripped.
- **Audits covering it, all audited and mitigation commits being ancestors of the deployed source:**
  - **Cantina core**, Sep 2024, `a6fc609c`: 44 findings (7 H / 7 M / 12 L). All H/M/L were fixed and verified by
    Cantina, in PRs 19–119, all merged before v1.0.0. Two informationals remain open: 3.5.16 "ERC-7484 registry
    checks missing on calls to modules" (acknowledged) and 3.5.10 (a wording suggestion for a comment).
  - **Renascence v1.0**, Oct 2024, `b17010a5` → mitigation `1dadde95`: 2 H, 3 M, 3 L, 2 I, all resolved.
  - **Renascence v2.0 ("update")**, Dec 2024, `821a4f51` → mitigation `fa4a4d78`: M-1 and M-2 resolved. I-1 (the
    session digest does not change between the USE and ENABLE modes) is acknowledged and informational; the
    auditor notes it is not exploitable.
- **Changes after v1.0.0 that are not deployed:** `main` later hard-disabled the ERC-7484 registry
  (`useRegistry: false`), removed the 128-entry limit in AssociatedArrayLib and renamed one error. These are not
  security fixes. The ChainLight 2025-07 findings only touch policy contracts, not SmartSession. Open,
  unmerged PR #177 (`fix/1271-data`) changes the ERC-1271 signature layout; it does not affect the 4337 UserOp
  path we use.
- **Integration note:** in v1.0.0, the `enableSessions` and ENABLE-mode paths still call the registry
  `0x000000000069E2…51B2`. Our design installs through `onInstall` in **UNSAFE_ENABLE**, where
  `mode.useRegistry()` is false, so that path is consistent with this version.

### UniActionPolicy `0x0000000000714Cf48FcF88A0bFBa70d313415032`: PASS

- **Verification:** Sourcify partial match. solc 0.8.28, 833 runs, cancun. Deployed in block 47083173.
- **Source:** `UniActionPolicy.sol` is identical to v1.0.0 (`8244adf`). The only difference anywhere in the
  verified tree is one renamed struct field in `DataTypes.sol` (`permitERC4337Paymaster` → `permit4337Paymaster`),
  which is not used by this contract. The runtime bytecode is identical, metadata stripped, to the repo artifacts at
  `f24dddf`, `6bfe906` and `f5aaf867`, the 2024 and 2025 deployment builds. Against the ChainLight-audited `cd48082`,
  the only differences are an unused import, an unused error and an unused `using` statement. The current `main`
  version differs from the deployed one only by naming and by removing those unused items.
- **Audits:**
  - **Cantina external policies**, `a6fc609c`. Critical 3.1.1 "UniActionPolicy does not persist usages" was fixed
    in PR 76 (merge `6841132`). PR 76 is in v1.0.0, and the deployed `check()` writes `rule.usage.used += param`.
    Low 3.3.1 (ERC-165 selectors) was fixed in PR 107, also in v1.0.0.
  - **ChainLight 2025-07**: UniActionPolicy is in scope through PR #162. Its only mention is informational item 3
    (naming `msgSender` vs `multiplexer`), which is cosmetic.
- **Residual findings:** none open.

### TimeFramePolicy `0x0000000000D30f611fA3bf652ac6879428586930`: PASS

- **Verification:** Sourcify partial match. solc 0.8.28, 833 runs, cancun. Deployed in block 47083172.
- **Source:** identical to `erc7579/smartsessions` `main` at `e118623` / `f5aaf867` (2025-08). The runtime bytecode
  is identical, metadata stripped, to the `f5aaf867` artifact.
- **Audit:** **ChainLight Smart Sessions 2025-07** (the scope covers PR 122 `cd48082`, PR 159 `6042af1` and PR 162
  `643bc0c`; TimeFramePolicy is part of PR 122). All four findings are reported as Patched. Compared with the
  audited `cd48082`, the deployed source adds exactly the ChainLight remediations: the `validAfter <= validUntil`
  check in `initializeWithMultiplexer` (item 5) and the `multiplexer` naming (item 3). Item 6, a redundant
  condition, is still present; it has no effect. The other ChainLight findings concern SimpleGas, ValueLimit and
  ContractWhitelist, which we do not use.
- **Residual findings:** none that matter.

### Safe7579 adapter `0x7579EE8307284F293B1927136486880611F20002`: PASS (with Low notes)

- **Verification:** Sourcify **exact match**. solc 0.8.26, 200 runs, paris. Deployed in block 39978583.
- **Source:** `rhinestonewtf/safe7579` tag **v1.0.0** (`33f110f`). The 20 `src/` files are identical to v1.0.0,
  v1.0.2 and `54e65cd`.
- **Audit:** **Ackee**. Rev 1.0 at `90dd363`, fix review 1.1 at `180f0ac`, incremental review rev 2.0 at
  **`d961421`**; all three are ancestors. The diff from `d961421` to the deployed source has three parts:
  - two unused `using` lines removed (Ackee I5),
  - a typo fix (Ackee I6),
  - one added `emit Safe7579Initialized(msg.sender)` in `Initializer`.

  This is trivial and has no logic change.
- **Residual findings from Ackee:**
  - M5 "Locked Ether": partially fixed.
  - L3 "ERC-4337 factory standard violation": acknowledged. It concerns the launchpad, which we do not use.
  - W7 (unused UserOperationBuilder): not fixed, and it is not deployed.
  - W9 (`isModuleInstalled(VALIDATOR, msg.sender)` returns true): reported, unfixed, and only a standards
    deviation.
  - W10 (launchpad signature check): reported, but it is launchpad-only.
- **Newer audit not in this deployment:** ChainLight 2025-03 (v1.1) reviewed `5cac8be` → `f314e65`, which became
  v2.0.0 in Apr 2025. Its two Lows are **not patched in the deployed v1.0.0**:
  - `_isHookInstalled(address(0))` returns true;
  - `installModule` does not check the module type. Triggering this needs a privileged (self) call.

  Neither affects our flow: no hooks are installed, and the module addresses are pinned by our builders.

### OwnableValidator `0x000000000013fdB5234E4E3162a810F54d9f7E98`: FAIL (deployed code differs from what was audited)

- **Verification:** Sourcify **exact match**. solc 0.8.28, optimizer off, cancun. Deployed in block 42390846.
- **Source:** `rhinestonewtf/core-modules` `src/OwnableValidator/OwnableValidator.sol` at **`f86f209`** (2025-08-04,
  "fix: remove toEthSignedMessage on 1271"; it is still the version on `main`). The bundled
  `@rhinestone/checknsignatures` is at **`ecbadc3`** (2024-11-19, "return all signers").
- **Audit:** **Ackee core modules**. Rev 1.0 at `013a1233` (modulekit examples), fix review rev 1.1 at **`4531b2e`**
  (2024-07-03). H2 "missing threshold checks", which applies to OwnableValidator, is fixed. Revs 2.0 and 2.1 only
  covered AutoSavings, ScheduledOrders and Uniswap. The ChainLight WebAuthnValidator reports in the same repo cover
  only `WebAuthnValidator.sol`. **No audit covers OwnableValidator after `4531b2e`.**
- **Changes made after the audit that are in the deployed code** (`git diff 4531b2e f86f209`, plus the library):
  1. `isModuleType` also returns true for type 7, the stateless validator. This is what lets SmartSession use the
     module as a session validator.
  2. `onUninstall` replaces `popAll` with a paginated loop that pops each owner and emits an event for it.
  3. **The signed-hash format changed.** `validateUserOp` now prefixes `userOpHash` with the eth-signed-message
     prefix (`toEthSignedMessageHash`). `isValidSignatureWithSender` and `validateSignatureWithData`, which is the
     path SmartSession calls, now recover over the **raw** hash. Before, the prefix was applied in all three.
  4. **CheckNSignatures `ecbadc3`** ("return all signers") differs from the audited library line:
     - it parses `len/65` signatures, not N;
     - it drops the checks that the contract-signature pointer `s` lies outside the static part;
     - a failed contract signature now yields `address(0)` instead of reverting.

     Rhinestone reverted this change upstream on 2026-05-01 (`checknsignatures` PR #5). The still-**open**
     `core-modules` PR #32 ("bump checknsignatures … so the next OwnableValidator redeploy bakes in the un-bugged
     checkNSignatures") calls the deployed version buggy for **ERC-1271 smart-contract owners**.
- **Our own reading, not an audit:**
  - **For how we use it** (the owner is one device EOA, threshold 1, a 65-byte ECDSA signature, and
    `validateSignatureWithData` called from SmartSession), we found no way to forge a signature. A signer counts
    only if ECDSA recovery against the device key succeeds, or if the owner contract's `isValidSignature`
    approves. Garbage chunks recover to non-owner addresses, and signers are sorted and de-duplicated before
    counting.
  - **The bug Rhinestone describes is about functionality** for owners that are contracts. It does not affect our
    EOA session key.
  - **The hash format change matters to the client:** the session key must sign the raw `userOpHash` with v
    27/28, or use v+4 for the eth_sign path. The fork test already exercised this.

## Summary

| Module | Verified | Source commit | Same as audited/fixed commit? | Audits | Open findings |
|---|---|---|---|---|---|
| SmartSession | Sourcify partial | smartsessions v1.0.0 = `fa4a4d78` | **Exact source** (bytecode = `f24dddf` artifact) | Cantina core, Renascence v1 + v2 | Informational only (3.5.16 registry, I-1 digest) |
| UniActionPolicy | Sourcify partial | v1.0.0 (`8244adf`) | **Same code**; only an unused struct-field rename differs; bytecode = artifacts | Cantina external (C-1 fixed PR 76), ChainLight 2025-07 | None |
| TimeFramePolicy | Sourcify partial | `main` `e118623`/`f5aaf867` | **Exact source = post-ChainLight remediation** (bytecode = `f5aaf867` artifact) | ChainLight 2025-07 | None that matter (item 6, a redundant condition) |
| Safe7579 | Sourcify exact | safe7579 v1.0.0 (`33f110f`) | **Ackee rev 2.0 `d961421` + I5/I6 fixes + 1 event** | Ackee rev 1.0/1.1/2.0 | M5 partially fixed; L3/W9/W10 open; ChainLight-2025 2× Low fixed only in v2.0.0 |
| OwnableValidator | Sourcify exact | core-modules `f86f209` + checknsignatures `ecbadc3` | **Differs.** Unaudited changes in the signature path (hash format, stateless type, CheckNSignatures "return all signers", which Rhinestone has since reverted) | Ackee (up to `4531b2e`, Jul 2024) | Upstream calls the deployed CheckNSignatures buggy (ERC-1271 owners); open redeploy PR core-modules #32 |

## Ways forward for OwnableValidator (decision for Max)

1. **Accept it as a documented exception.** Record the reasoning above: no way to forge a signature for an EOA
   owner with threshold 1, and the known bug only affects contract owners. Optionally commission a small review of
   the OwnableValidator diff `4531b2e..f86f209` plus CheckNSignatures `fce5568..ecbadc3`.
2. **Wait for Rhinestone's redeploy** (core-modules PR #32) and re-check it against an audit. The validator address
   would probably change, and so would the permissionId, because `sessionValidator` is hashed into it.
3. **Use another session validator** whose deployed code matches an audited commit.

**AUDIT GATE FAIL**: SmartSession, UniActionPolicy, TimeFramePolicy and Safe7579 match audited and fixed commits,
but the deployed OwnableValidator (core-modules `f86f209` with checknsignatures `ecbadc3`) includes unaudited
changes to signature verification made after Ackee's last review (`4531b2e`), so this module needs an explicit
exception or re-review before the flag goes on.

## Decision (Max, 2026-11-21)

**OwnableValidator accepted as a documented exception.** Rationale: the post-audit changes
(4531b2e..f86f209 and checknsignatures fce5568..ecbadc3) only have a known bug for smart-contract
owners; Röbel device sessions use exactly one EOA owner, threshold 1, a 65-byte ECDSA signature
over the raw userOpHash (fork-tested in SessionKeys.t.sol). Blast radius is bounded by the
session scope (mint-only: personalMint + Röbel groupMint into the owner's own account), the
30-day expiry, revocation with one passkey op, the device-signature sponsor gate and the kill
switch. Revisit when Rhinestone redeploys a fixed, audited validator (core-modules PR #32) —
that changes the validator address and therefore the permission IDs (small builder update).
An optional paid review of the two diffs stays open.
