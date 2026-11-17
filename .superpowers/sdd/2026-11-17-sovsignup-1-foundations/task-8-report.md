# Task 8 report

## Fork proof
`contracts/passkey-accounts/test/SafeCircles.t.sol`, pinned to Gnosis block 49325978; inviter `0xdF3e3e4Fd42D6fE99e3313E6A88437b53b3e5f3F` (isHuman, ~6519 own CRC).
Flow: inviter `trust(safe, max)` -> sponsored deploy op `registerHuman(inviter,digest)` -> `isHuman(safe)` true -> warp +1 day -> one sponsored MultiSendCallOnly op `[personalMint, updateMetadataDigest]` -> own CRC balance rises, `getMetadataDigest(safe)==digest2`.
RED: first run compile error (address checksum), then revert on my wrong getter name `avatarToMetadataDigest` (all chain calls had succeeded; the NameRegistry getter is `getMetadataDigest`). GREEN: `forge test --match-contract SafeCircles -vvv` -> `[PASS] test_passkeySafeJoinsCirclesAndMints() (gas: 1598519)`.
No chain revert: the Hub accepts a Safe as a Circles human.

## App walk (Step 3) - no blocker found, no app code changed
- RoebelTalerProvider.onboard / findMyInvitation: keyed only to `gnosisAccount.address` (an address); `findMyInvitation(addr)` reads trusts/humans/balances by address, `isOnboarded` = `Hub.isHuman(address)`. Nothing reads a thirdweb account. Sends go via `sendTransaction({account: gnosisAccount})`, which is the adapter on a passkey session.
- lib/muenzen-claim.ts: guest (`member:false`) gets `personalMint` only; groupMint only when `member`. A failed membership read throws. Added unit tests through `claimMuenzenAsOneBatch` with `isGroupMember:false` on a Safe identity: one call, personalMint, no `0x6cb498e5` selector; and nothing sent when nothing accrued (no groupMint sweep).
- useCirclesProfileSync: `gnosisAccount` from `useGnosisWallet`, an adapter on a passkey session; address-keyed `getPublishedDigest`; `updateMetadataDigest` is one of the 4 sponsored guest calls.
- app/edit-profile.tsx:147: resync only if `circles.published`, and on a passkey wallet only when name/bio/photo changed; failure is caught (best effort). Fine for a guest.
- Residual (not code): `send` (safeTransferFrom) stays citizen-only/unsponsored for guests, by design.

## Tests
- `jest lib/__tests__/muenzen-claim.test.ts`: 12 passed (2 new). eslint: 0 errors (8 pre-existing import/first warnings).

## Files
contracts/passkey-accounts/test/SafeCircles.t.sol (new), test/utils/Interfaces.sol (ICirclesHub, ICirclesNameRegistry), README.md (row), apps/expo/lib/__tests__/muenzen-claim.test.ts.
