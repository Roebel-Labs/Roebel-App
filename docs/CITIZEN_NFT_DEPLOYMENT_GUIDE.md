# CitizenNFT v2 Deployment Guide

## Summary of Changes

### Smart Contract Changes
✅ **Updated CitizenNFT.sol** with role selection and increased security:
- Added `signAsAttester` parameter to `approveRequest()` function
- Changed signature requirements from **1 Attester + 1 Citizen** to **1 Attester + 2 Citizens**
- Changed minimum unique signers from **2 people** to **3 people**
- Dual NFT holders can now explicitly choose which role to sign as
- Updated event emission to include `signedAsAttester` parameter

### Frontend Changes
✅ **Removed event polling** - Success shown immediately after transaction submission
✅ **Updated UI** to show new signature requirements (1 Attester + 2 Citizens)
✅ **Added role selection** for dual NFT holders (Attester vs Citizen)
✅ **Updated contract ABI** to include new `signAsAttester` parameter

## Why These Changes?

### Security Problem (FIXED)
**OLD SYSTEM:** 1 Attester + 1 Citizen (minimum 2 people)
- ❌ One person with both NFTs could approve new citizens alone
- ❌ Vulnerable to single-person decision making

**NEW SYSTEM:** 1 Attester + 2 Citizens (minimum 3 people)
- ✅ Requires broader community consensus
- ✅ Prevents one dual-holder from approving alone
- ✅ Ensures at least 2 pure Citizens must agree
- ✅ Dual holders can choose their role explicitly

### UX Problem (FIXED)
**OLD SYSTEM:** Event polling after transaction
- ❌ UI kept showing "polling..." even after Blockscout showed success
- ❌ Smart account transactions don't need polling (they succeed or fail immediately)

**NEW SYSTEM:** Immediate success display
- ✅ Success shown as soon as transaction submitted
- ✅ Cleaner user experience
- ✅ Matches actual smart account behavior

## Deployment Steps

### Step 1: Compile Smart Contract

```bash
cd governor-contract
npx hardhat clean
npx hardhat compile
```

**Expected output:** Compiled successfully without errors

### Step 2: Deploy New CitizenNFT Contract

```bash
cd governor-contract
npx thirdweb deploy -k YOUR_SECRET_KEY
```

**Parameters to provide during deployment:**

1. **_attesterNFT**: `0xDC9e7C03d354F78475E8bC35a166A784319C56ae` (existing AttesterNFT address)
2. **initialOwner**: Your wallet address
3. **foundingCitizens**: Array of 3 addresses for founding citizens
   ```
   ["0xAddress1", "0xAddress2", "0xAddress3"]
   ```

**IMPORTANT:** Save the new deployed contract address!

### Step 3: Update Frontend Contract Address

Edit `dao-app/src/lib/verification-contracts.ts`:

```typescript
export const VERIFICATION_CONTRACTS = {
  attesterNFT: "0xDC9e7C03d354F78475E8bC35a166A784319C56ae", // Keep same
  citizenNFT: "0xB7B767f472200C3240bd5cab33df801Bbe1519D5",  // ✅ UPDATED (CitizenNFT v2)
  governor: "0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A",    // ✅ UPDATED
};
```

### Step 4: Test the Frontend

```bash
cd dao-app
npm run dev
```

**Manual testing checklist:**
- [ ] Create a new attestation request
- [ ] Wallet with only Attester NFT: Should auto-select "Attester" role
- [ ] Wallet with only Citizen NFT: Should auto-select "Citizen" role
- [ ] Wallet with both NFTs: Should show role selection (Attester / Citizen)
- [ ] Signature counts display: "0/1" for Attester, "0/2" for Citizens
- [ ] After signing: Success shown immediately (no polling)
- [ ] Transaction link to Blockscout works
- [ ] Request auto-executes after 1 Attester + 2 Citizens sign (3 people minimum)

### Step 5: Deploy Frontend (Optional)

If deploying to production:

```bash
cd dao-app
npm run build
npm start
```

## Migration Notes

### What Happens to Old Requests?

All existing attestation requests on the **old CitizenNFT contract** (0x8e0D66Bd2Fe804912EcB9604b041e814Ea1ddBC9) will remain there.

**NEW CONTRACT:** CitizenNFT v2 is now deployed at `0xB7B767f472200C3240bd5cab33df801Bbe1519D5`

**Options:**
1. **Ignore old requests** - Start fresh with new contract
2. **Manual migration** - Recreate important requests on new contract
3. **Dual tracking** - Keep both contracts accessible (not recommended)

**Recommendation:** Start fresh. The old contract had a security vulnerability.

### Who Needs to Re-Request?

**Founding Citizens:** Will be automatically minted to the new contract (specified in deployment).

**Other Citizens:** Anyone who was waiting for approval on the old contract needs to create a new request on the new contract.

## Testing Scenarios

### Scenario 1: Pure Attester Signs
1. Wallet holds only Attester NFT
2. UI auto-selects "Attester" role
3. Signs request
4. Attester count: 0/1 → 1/1 ✅
5. Citizen count: 0/2 (unchanged)

### Scenario 2: Pure Citizen Signs
1. Wallet holds only Citizen NFT
2. UI auto-selects "Citizen" role
3. Signs request
4. Citizen count: 0/2 → 1/2
5. Attester count: 0/1 (unchanged)

### Scenario 3: Dual Holder Signs as Attester
1. Wallet holds both NFTs
2. UI shows role selection
3. User selects "Als Bescheiniger unterschreiben"
4. Signs request
5. Attester count: 0/1 → 1/1 ✅
6. Citizen count: 0/2 (unchanged)

### Scenario 4: Dual Holder Signs as Citizen
1. Wallet holds both NFTs
2. UI shows role selection
3. User selects "Als Bürger unterschreiben"
4. Signs request
5. Citizen count: 0/2 → 1/2
6. Attester count: 0/1 (unchanged)

### Scenario 5: Auto-Execute (Happy Path)
1. Person A (Attester only): Signs as Attester → 1/1 Attester ✅
2. Person B (Citizen only): Signs as Citizen → 1/2 Citizens
3. Person C (Citizen only): Signs as Citizen → 2/2 Citizens ✅
4. **Auto-execute:** NFT minted to requester! 🎉
5. **Requirement met:** 3 different people signed (A, B, C)

### Scenario 6: Security Test (Blocked)
1. Person A (holds both NFTs): Signs as Attester → 1/1 Attester ✅
2. Person A tries to sign again → ❌ **Blocked:** "Already approved"
3. System requires 2 more people (Citizens) to approve
4. **Security maintained:** One person cannot approve alone

## Rollback Plan

If deployment fails or issues arise:

1. **Keep old contract address** in verification-contracts.ts:
   ```typescript
   citizenNFT: "0x8e0D66Bd2Fe804912EcB9604b041e814Ea1ddBC9"
   ```

2. **Revert frontend ABI** to old version (remove `signAsAttester` parameter):
   ```typescript
   "function approveRequest(uint256 requestId)" // Old version
   ```

3. **Old contract remains functional** - No data loss

## Contract Verification (Optional)

To verify the new contract on BaseScan:

```bash
cd governor-contract
npx hardhat verify --network base NEW_CITIZEN_NFT_ADDRESS \
  "0xDC9e7C03d354F78475E8bC35a166A784319C56ae" \
  "YOUR_WALLET_ADDRESS" \
  '["0xFoundingCitizen1","0xFoundingCitizen2","0xFoundingCitizen3"]'
```

## Files Changed

### Smart Contract
- ✅ `governor-contract/contracts/verification-system/CitizenNFT.sol`

### Frontend
- ✅ `dao-app/src/app/verifizierung/nachweis/[id]/page.tsx` (main changes)
- ✅ `dao-app/src/lib/verification-contracts.ts` (updated ABI)
- ❌ `dao-app/src/hooks/useEventPolling.ts` (DELETED)

### Still TODO
- ⚠️ Update signature display in other components:
  - `dao-app/src/components/verification/RequestCard.tsx`
  - `dao-app/src/app/verifizierung/antraege/page.tsx`

## Support & Questions

If you encounter issues:

1. **Check dev server logs** for TypeScript errors
2. **Check browser console** for transaction errors
3. **View on Blockscout** to verify transaction status
4. **Check contract events** to see signature counts

## Success Criteria

✅ Contract compiles without errors
✅ Contract deploys successfully
✅ Frontend compiles without TypeScript errors
✅ Role selection UI works for dual NFT holders
✅ Signature counts show "1 Attester + 2 Citizens" requirement
✅ Success shown immediately after transaction (no polling)
✅ Requests auto-execute after 3 people sign

---

**Date:** 2025-11-10
**Version:** CitizenNFT v2.0
**Breaking Changes:** Yes (requires contract redeployment)
