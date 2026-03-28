# Proposal Migration Issue

## Problem Summary

Votes are not displaying on proposals because the proposal was created on the **old Governor contract**, but the frontend is now querying the **new Governor contract**.

## Root Cause

### Old Governor Contract
- **Address:** `0xB81757b747D75089C589c057Ba41fc3D7D32f27e`
- This contract has your existing proposal
- Votes were cast on this contract
- Events are being emitted on this contract

### New Governor Contract
- **Address:** `0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A`
- Frontend is now querying this contract
- This contract does NOT have your old proposal
- Result: `proposalVotes` returns `undefined`

## Evidence from Console Logs

```javascript
Proposal State Debug: {
  proposalId: '0x6961f7af346bdbbb3a51d06828d4b73b916bce54a9b3c84ca9b31c0eb2c576d6',
  blockchainState: undefined,  // ❌ Can't find proposal on new contract
  supabaseState: undefined,
  effectiveState: undefined,
  isLoadingState: false,
}
```

The proposal ID exists in Supabase, but when querying the blockchain with the new Governor address, it returns `undefined`.

## Solutions

### Solution 1: Recreate the Proposal on New Governor Contract (RECOMMENDED)

**Steps:**
1. Go to http://localhost:3003/proposals/create
2. Create the same proposal again
3. This will create it on the new Governor contract (`0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A`)
4. Votes will work correctly

**Pros:**
- Clean start with new contract
- All features work correctly
- Consistent with CitizenNFT v2

**Cons:**
- Need to recreate proposal
- Old votes are lost (but they were on old contract anyway)

### Solution 2: Temporarily Support Both Contracts

**Implementation:**
Add logic to check which contract the proposal was created on:

```typescript
// Check if proposal exists on new or old governor
const oldGovernorContract = getContract({
  client,
  address: "0xB81757b747D75089C589c057Ba41fc3D7D32f27e",
  chain: base,
});

// Try new contract first, fallback to old if not found
const effectiveGovernorContract = proposalState !== undefined
  ? governorContract
  : oldGovernorContract;
```

**Pros:**
- Keeps old proposal accessible
- No data loss

**Cons:**
- More complex code
- Maintains dependency on old contract
- Not recommended long-term

### Solution 3: Manual Migration (Complex)

Programmatically recreate proposals from old contract on new contract. This is complex and not recommended.

## Recommended Action

**Create a new proposal on the new Governor contract.**

This is the cleanest approach and ensures:
- ✅ Votes display correctly
- ✅ All features work with new contracts
- ✅ Consistent with CitizenNFT v2 deployment
- ✅ No legacy contract dependencies

## How to Verify Which Contract a Proposal Uses

1. Check Supabase `proposals` table
2. Look at `governor_contract_address` column
3. If it's the old address (`0xB81757b747D75089C589c057Ba41fc3D7D32f27e`), votes won't appear in new UI

## Quick Fix for Testing

If you just want to test the voting UI quickly, you can:

1. **Temporarily switch back to old Governor:**
   ```typescript
   // In dao-app/src/lib/contracts.ts
   export const ATTESTER_GOVERNOR_ADDRESS = "0xB81757b747D75089C589c057Ba41fc3D7D32f27e"; // Old
   ```

2. **Test voting**

3. **Switch back to new Governor:**
   ```typescript
   export const ATTESTER_GOVERNOR_ADDRESS = "0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A"; // New
   ```

But for production, **create new proposals on the new Governor contract**.

---

**Date:** 2025-11-10
**Issue:** Contract migration causing vote display problems
**Resolution:** Recreate proposals on new Governor contract
