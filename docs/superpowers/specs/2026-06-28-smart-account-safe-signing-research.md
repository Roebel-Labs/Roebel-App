# Research: thirdweb Smart Account as a Gnosis Safe owner — signing transactions & messages

- **Date:** 2026-06-28
- **Status:** Reference (hard-won; informs the GK signing implementation + fallbacks)
- **Context:** The Gemeinschaftskasse Safe (2-of-4, Gnosis, v1.4.1) has thirdweb smart-account owners. Off-chain ERC-1271 contract signatures from thirdweb smart accounts are rejected by this Safe / the Transaction Service. We need smart accounts to co-sign BOTH transactions and messages from the dashboard.

## Why off-chain ERC-1271 from a thirdweb smart account is rejected

The Safe's `checkSignatures` → `checkContractSignature` calls `owner.isValidSignature(dataHash, contractSig)` with the **raw** `dataHash`. thirdweb's smart account `isValidSignature` does NOT validate against the raw hash — it re-wraps it in an **`AccountMessage` EIP-712 envelope**:
```
domain = { name: "Account", version: "1", chainId, verifyingContract: smartAccountAddress }
types  = { AccountMessage: [{ name: "message", type: "bytes" }] }
message = { message: abi.encode(rawHash) }
```
So the EOA admin must sign `keccak256(eip712(AccountMessage{message: abi.encode(theHashSafeWillPass)}))`. Calling thirdweb `account.signMessage({ message: { raw: hash } })` produces exactly this. Two failure modes we hit: (1) signing/validating the wrong hash; (2) **double-wrapping** — marking the inner `EthSafeSignature` as `isContractSignature=true` produced a 259-byte nested blob the service rejected; the fix is a plain inner sig → correct 162-byte contract-signature layout (already in `assembleSenderSignature`).

## Transactions — `approveHash` + pre-validated (CHOSEN, working)

- Pre-validated signature (65 bytes): `r = ownerAddress left-padded to 32` · `s = 32 zero bytes` · `v = 0x01`. `checkNSignatures` sees `v==1` and checks `approvedHashes[owner][dataHash]`.
- A smart-account owner calls `approveHash(safeTxHash)` **on-chain, gaslessly** (thirdweb `prepareContractCall` + `sendTransaction` → UserOp via bundler/paymaster).
- The **Safe Transaction Service auto-indexes the `ApproveHash` event** as a confirmation (`APPROVED_HASH` type) — no off-chain POST strictly required, but the tx must be proposed so the service knows it.
- At execution, assemble all signatures (off-chain confirmations + synthesized pre-validated sigs for on-chain approvers — we read `approvedHashes[owner][safeTxHash]` directly). This is exactly what `safe-server.ts encodeExecution` does.

## Messages — options (one of these; needs a LIVE test to pick)

A Safe off-chain message hash the contract validates is:
`messageHash = keccak256(0x1901 || safe.domainSeparator() || keccak256(SAFE_MSG_TYPEHASH || keccak256(abi.encode(_dataHash))))`
where `SAFE_MSG_TYPEHASH = keccak256("SafeMessage(bytes message)")`. The Transaction Service's `message.messageHash` IS this hash; `isValidSignature(_dataHash, sig)` → `checkSignatures(messageHash, ..., sig)`.

- **Option A (SHIPPED first — mirrors txs):** smart-account owner `approveHash(messageHash)` on-chain + submit a **pre-validated** signature via `addMessageSignature(messageHash, preValidatedSig)`. Works at the contract level (`checkNSignatures` accepts v=1 for any approved hash). **Open question:** does the Transaction Service accept/store a v=1 sig on the *message* endpoint and include it in `preparedSignature`? → confirm with the live Monerium test.
- **Option B (robust fallback):** `SignMessageLib.signMessage(message)` via a **delegatecall** Safe transaction (gnosis v1.4.1 SignMessageLib `0xd53cd0aB83D845Ac265BE939c57F53AD838012c9`). Sets `safe.signedMessages[hash]` → `isValidSignature(hash, "")` returns the magic value permanently. Uses the existing tx flow (owners approveHash the delegatecall tx). Caveat: this is a separate on-chain mechanism — it makes `isValidSignature` valid on-chain, but may NOT complete the off-chain Transaction-Service message Monerium created (depends on how Monerium polls).
- **Option C (off-chain ERC-1271 done right):** EOA admin signs the wrapped `messageHash` (`account.signMessage({message:{raw: messageHash}})`), build a contract signature (v=0, plain inner, NOT double-wrapped), `addMessageSignature(messageHash, contractSig)`. The Transaction Service verifies by eth_call to the smart account's `isValidSignature` — works only if the smart account is deployed and the wrapping is exact.

## Bottom line
- Transactions: `approveHash` (done, works).
- Messages: try **A** (consistency + minimal); if the Transaction Service rejects the pre-validated message sig, fall back to **C** (correct ERC-1271 wrapping) or **B** (SignMessageLib delegatecall). The live Monerium message is the decisive test.

Sources: docs.safe.global (smart-account-signatures, protocol-kit message/tx signature guides, approveHash/checkNSignatures references, transaction-service architecture), thirdweb js `wallets/smart/lib/signing.ts` (AccountMessage wrapping), EIP-1271, ERC-7739, safe-smart-account `CompatibilityFallbackHandler.sol` / `Safe.sol` v1.4.1.
