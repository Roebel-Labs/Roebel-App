# Blockchain Transaction Diagnostics Guide

## Overview

Added comprehensive diagnostic logging to track blockchain transactions and identify why transactions aren't appearing on BaseScan.

---

## What Was Added

### 1. Contract Verification on Page Load

**File**: `dao-app/src/app/verifizierung/nachweis/[id]/page.tsx`

**New Diagnostic Checks**:
```typescript
useEffect(() => {
  async function verifyContracts() {
    // Check if contracts are deployed and have data
    const attesterCount = await readContract({ /* requestCount */ });
    const citizenCount = await readContract({ /* requestCount */ });

    // Check if user has required NFTs
    const hasAttester = await readContract({ /* hasAttesterNFT */ });
    const hasCitizen = await readContract({ /* hasCitizenNFT */ });
  }
}, [account]);
```

**Console Output to Watch For**:
```
✅ [Nachweis] AttesterNFT requestCount: 1
✅ [Nachweis] CitizenNFT requestCount: 1
✅ [Nachweis] User hasAttesterNFT: true
✅ [Nachweis] User hasCitizenNFT: false
```

### 2. Enhanced Transaction Logging

**Files**:
- `dao-app/src/app/verifizierung/nachweis/[id]/page.tsx` (approveRequest)
- `dao-app/src/app/verifizierung/buerger-beantragen/page.tsx` (createAttestationRequest)

**Transaction Success Logging**:
```typescript
onSuccess: (result) => {
  console.log("✅ Transaction successful:", {
    transactionHash: result.transactionHash,
    blockNumber: result.blockNumber,
    blockHash: result.blockHash,
    from: result.from,
    to: result.to,
  });
  console.log("🔗 View on BaseScan:", `https://basescan.org/tx/${result.transactionHash}`);
}
```

**Transaction Error Logging**:
```typescript
onError: (error) => {
  console.error("❌ Transaction failed:", {
    message: error.message,
    code: error?.code,
    reason: error?.reason,
    data: error?.data,
    stack: error.stack,
  });
}
```

---

## How to Use These Diagnostics

### Step 1: Check Contract Deployment

Open the detail page (`/verifizierung/nachweis/0?contract=citizen`) and check console:

**Expected Output (Contracts Deployed Correctly)**:
```
🔍 [Nachweis] Verifying contract deployment...
✅ [Nachweis] AttesterNFT requestCount: 1
✅ [Nachweis] CitizenNFT requestCount: 1
✅ [Nachweis] User hasAttesterNFT: true
✅ [Nachweis] User hasCitizenNFT: false
```

**Problem Indicators**:
```
❌ [Nachweis] Contract verification failed: Error: Contract not deployed
```
→ **Diagnosis**: Contracts don't exist at the specified addresses

```
✅ [Nachweis] AttesterNFT requestCount: 0
✅ [Nachweis] CitizenNFT requestCount: 0
```
→ **Diagnosis**: Contracts deployed but no requests created yet

```
✅ [Nachweis] User hasAttesterNFT: false
✅ [Nachweis] User hasCitizenNFT: false
```
→ **Diagnosis**: User doesn't have any NFTs (not a founding member)

### Step 2: Test Creating a Request

Go to `/verifizierung/buerger-beantragen` and create a request.

**Expected Output (Success)**:
```
✅ [Bürger] Transaction successful: {
  transactionHash: "0xabc123...",
  blockNumber: 12345678,
  ...
}
🔗 [Bürger] View on BaseScan: https://basescan.org/tx/0xabc123...
⏳ [Bürger] Waiting for receipt...
📄 Receipt received: {...}
✅ Extracted Request ID: 0
💾 Storing evidence in Supabase...
✅ Evidence stored in Supabase: {...}
```

**Problem Indicators**:
```
❌ [Bürger] Transaction failed: {
  message: "execution reverted: Already has Citizen NFT",
  ...
}
```
→ **Diagnosis**: User already has a Citizen NFT

```
❌ [Bürger] Transaction failed: {
  message: "insufficient funds for gas",
  ...
}
```
→ **Diagnosis**: Gasless transactions not working, user needs ETH

```
❌ [Bürger] Transaction failed: {
  message: "network error",
  ...
}
```
→ **Diagnosis**: RPC connection issue or wrong network

### Step 3: Test Approving a Request

Go to `/verifizierung/nachweis/0?contract=citizen` and click "Unterschreiben".

**Expected Output (Success)**:
```
🖊️ [Nachweis] Starting signature... {
  requestId: "0",
  isAttester: true,
  isCitizen: false,
  contractType: "citizen",
  signingContract: "CitizenNFT"
}
📝 [Nachweis] Signing as Bürger...
✅ [Nachweis] Signature successful! {
  transactionHash: "0xdef456...",
  blockNumber: 12345679,
  ...
}
🔗 [Nachweis] View on BaseScan: https://basescan.org/tx/0xdef456...
```

**Problem Indicators**:
```
❌ [Nachweis] Signature failed: {
  message: "execution reverted: Already approved",
  ...
}
```
→ **Diagnosis**: User already signed this request

```
❌ [Nachweis] Signature failed: {
  message: "execution reverted: Request not pending",
  ...
}
```
→ **Diagnosis**: Request already executed or rejected

```
❌ [Nachweis] Signature failed: {
  message: "execution reverted: Must be Attester or Citizen to approve",
  ...
}
```
→ **Diagnosis**: User doesn't have required NFT

---

## Common Issues & Solutions

### Issue 1: Contracts Not Deployed

**Symptoms**:
```
❌ [Nachweis] Contract verification failed: Error: Contract not deployed
```

**Solution**:
1. Verify contract addresses in `dao-app/src/lib/verification-contracts.ts`
2. Check BaseScan manually:
   - AttesterNFT: https://basescan.org/address/0xDC9e7C03d354F78475E8bC35a166A784319C56ae
   - CitizenNFT: https://basescan.org/address/0x8e0D66Bd2Fe804912EcB9604b041e814Ea1ddBC9
3. If contracts don't exist, redeploy via Remix

### Issue 2: Founding Members Not Minted

**Symptoms**:
```
✅ [Nachweis] User hasAttesterNFT: false
✅ [Nachweis] User hasCitizenNFT: false
```

**Solution**:
1. Check if constructor was called correctly during deployment
2. Verify the 3 founding member addresses used during deployment
3. Query `balanceOf(address)` on BaseScan for each founding member
4. If no NFTs minted, redeploy with correct addresses

### Issue 3: Gasless Transactions Not Working

**Symptoms**:
```
❌ Transaction failed: {
  message: "insufficient funds for gas",
  code: "INSUFFICIENT_FUNDS"
}
```

**Solution**:
1. Check thirdweb client ID in `.env.local`
2. Verify gasless relayer is enabled for Base Mainnet in thirdweb dashboard
3. Try transaction with `gasless: false` (user pays gas) to test if contract logic works
4. Check thirdweb dashboard for gasless transaction quota/limits

### Issue 4: Request Count is 0

**Symptoms**:
```
✅ [Nachweis] AttesterNFT requestCount: 0
✅ [Nachweis] CitizenNFT requestCount: 0
```

**Diagnosis**: No requests have been created on-chain yet

**Solution**:
1. Create a test request via UI
2. Check console for transaction hash
3. Verify transaction on BaseScan
4. If transaction succeeded but requestCount still 0, there's a contract bug

### Issue 5: Request Data Shows Zeros

**Symptoms**:
```
✅ [Nachweis] Got request data: [address, address, 0, 0, url, 0n, 0n, timestamp]
```
where `0n` for signatures means no approvals yet.

**Diagnosis**: Request exists but has no signatures

**Solution**:
1. Check if `hasUserSigned` returns false (expected if not signed)
2. Try signing the request
3. Check console for approval transaction success
4. Re-fetch request data to see if signatures incremented

---

## Manual Verification Checklist

Use this checklist to manually verify the system:

### Contracts
- [ ] AttesterNFT exists on BaseScan at `0xDC9e7C03d354F78475E8bC35a166A784319C56ae`
- [ ] CitizenNFT exists on BaseScan at `0x8e0D66Bd2Fe804912EcB9604b041e814Ea1ddBC9`
- [ ] Governor exists on BaseScan at `0xB81757b747D75089C589c057Ba41fc3D7D32f27e`

### Founding Members
- [ ] Founding Attester 1 (`0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28`) has Attester NFT
- [ ] Founding Attester 2 (`0xa7406861b5a5d542c7ffB35a5837E1ADfbBE92B7`) has Attester NFT
- [ ] Founding Attester 3 (`0x2518b7C515c3fFe2eAB45033534ccFbec7d21452`) has Attester NFT
- [ ] Founding Citizen 1 has Citizen NFT
- [ ] Founding Citizen 2 has Citizen NFT
- [ ] Founding Citizen 3 has Citizen NFT

### Transactions
- [ ] Can create attestation request (transaction appears on BaseScan)
- [ ] Can approve request as Attester (transaction appears on BaseScan)
- [ ] Can approve request as Citizen (transaction appears on BaseScan)
- [ ] Request signature counts increment after approval
- [ ] NFT auto-mints when 1 Attester + 1 Citizen approve (2 different people)

### UI/UX
- [ ] Request list shows correct count (from Supabase)
- [ ] Request detail page shows blockchain data (signatures, status)
- [ ] Approval button disabled after signing
- [ ] Success message shown after transaction confirms
- [ ] BaseScan link provided in console logs

---

## Next Steps

1. **Open browser console** and navigate to `/verifizierung/nachweis/0?contract=citizen`
2. **Check diagnostic output** - Does it show contracts deployed? User has NFTs?
3. **Try creating a request** - Does transaction succeed? Get transaction hash?
4. **Try approving a request** - Does signature work? See it on BaseScan?
5. **Report findings** - Share console logs showing where the process fails

---

## BaseScan Quick Links

**Contracts**:
- AttesterNFT: https://basescan.org/address/0xDC9e7C03d354F78475E8bC35a166A784319C56ae
- CitizenNFT: https://basescan.org/address/0x8e0D66Bd2Fe804912EcB9604b041e814Ea1ddBC9
- Governor: https://basescan.org/address/0xB81757b747D75089C589c057Ba41fc3D7D32f27e

**Founding Members** (Check "Token Holdings" tab):
- Member 1: https://basescan.org/address/0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28
- Member 2: https://basescan.org/address/0xa7406861b5a5d542c7ffB35a5837E1ADfbBE92B7
- Member 3: https://basescan.org/address/0x2518b7C515c3fFe2eAB45033534ccFbec7d21452

When you get a transaction hash from console, visit:
`https://basescan.org/tx/YOUR_TRANSACTION_HASH`
