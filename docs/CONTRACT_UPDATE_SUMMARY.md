# Contract Address Update Summary

## Updated: November 10, 2025

All verification system contracts have been updated to use the new **secure bootstrap** versions.

---

## New Contract Addresses (Base Mainnet)

### Verification System (Updated)

| Contract | Old Address | New Address | Notes |
|----------|-------------|-------------|-------|
| **AttesterNFT** | `0x72A58974Fe47cE9a5e9a7f356947BeCdA1C26D2C` | `0xBF77ffdbc85F0f9Bb16eFaFA330437a0e1794d1F` | ✅ Secure bootstrap with 3 founding attesters |
| **CitizenNFT** | `0xc49003E2b834ee10CADa6bcf3b369C7b9E01d7cd` | `0x5363EF81d79acCaA6F9a8E924199E3Cf05E0D18e` | ✅ Secure bootstrap with 3 founding citizens |
| **AttesterGovernor** | `0xBa4d0DD1a0e4bF8B08e8eF39FcaEA16F9CDDb90B` | `0x5133f3B1EC54C6A212D9ddC6B3c681614bB5f5bE` | ✅ Updated |

### Semaphore System (Unchanged)

These contracts are separate and were NOT updated:
- **CitizenRegistry**: `0xB2Ec982d7318A29746862AF3fc0F8B9C4E2E86B9`
- **Semaphore Citizen NFT**: `0xD9f1D05215415ac3DeC093Cf55D2f653EF06264C`
- **AnonymousGovernor**: `0x1cA1849B640d026c6884b119013f8E72551415F7`
- **Semaphore Core**: `0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D`

---

## Files Updated

### ✅ Updated Files:

1. **`dao-app/src/lib/verification-contracts.ts`**
   - Updated `attesterNFT`: `0xBF77ffdbc85F0f9Bb16eFaFA330437a0e1794d1F`
   - Updated `citizenNFT`: `0x5363EF81d79acCaA6F9a8E924199E3Cf05E0D18e`
   - Updated `governor`: `0x5133f3B1EC54C6A212D9ddC6B3c681614bB5f5bE`

2. **`dao-app/src/lib/contracts.ts`**
   - Updated `CITIZEN_NFT_ADDRESS`: `0x5363EF81d79acCaA6F9a8E924199E3Cf05E0D18e`
   - Updated `ATTESTER_GOVERNOR_ADDRESS`: `0x5133f3B1EC54C6A212D9ddC6B3c681614bB5f5bE`

### ℹ️ Unchanged Files:

- **`dao-app/src/lib/semaphore-config.ts`** - Separate anonymous voting system

---

## Founding Members

The new contracts were deployed with secure bootstrap, minting NFTs to:

### Founding Attesters (3 wallets):
- `0xD55b555ff6407670036AbA557F0eB2Ad10B325dB`
- `0xC6197dA9b4C914Da50B3f7b678e5FBD4b8d5c65A`
- `0x4d10D8b18Dc112a5DA98CdeDc2d66781Aa46E95A`

### Founding Citizens (3 wallets):
- `0xD55b555ff6407670036AbA557F0eB2Ad10B325dB`
- `0xC6197dA9b4C914Da50B3f7b678e5FBD4b8d5c65A`
- `0x4d10D8b18Dc112a5DA98CdeDc2d66781Aa46E95A`

---

## Key Security Improvements

### ✅ Deployed with Secure Bootstrap:

1. **No Owner Backdoor**
   - `emergencyMint()` is permanently disabled
   - Owner cannot mint unlimited fake attesters/citizens
   - Prevents centralization and fraud

2. **Constructor Bootstrap**
   - 3 Attester NFTs auto-minted at deployment
   - 3 Citizen NFTs auto-minted at deployment
   - All founding members visible on-chain from block 1

3. **Two-Person Minimum**
   - One person with both NFTs counts as ONE role only
   - Requires 2 DIFFERENT wallets to approve CitizenNFT requests
   - Prevents single-person approval abuse

4. **Decentralized Governance**
   - All future members require multi-sig approval:
     - **New Attesters**: Need 3 Attester signatures
     - **New Citizens**: Need 1 Attester + 1 Citizen (2 different people)

---

## Verification Checklist

### ✅ Completed:

- [x] Updated `verification-contracts.ts` with new addresses
- [x] Updated `contracts.ts` with new addresses
- [x] Restarted Next.js dev server
- [x] Dev server running on http://localhost:3003

### 🔄 For You to Verify:

1. **Check Founding Members**:
   - Visit app and connect with one of the founding wallets
   - Should see "You have Attester NFT" or "You have Citizen NFT"
   - Verify NFT badges appear in header

2. **Test Request Creation**:
   - Create a new Citizen NFT request
   - Should save to Supabase with Irys evidence

3. **Test Multi-Sig Approval**:
   - Approve request with Attester wallet #1
   - Should see 1 Attester signature
   - Try to approve again with same wallet → Should fail
   - Approve with Citizen wallet #2 → Should auto-mint NFT

4. **Verify Emergency Mint Disabled**:
   - On BaseScan, try calling `emergencyMint(address)`
   - Should revert with: "Emergency minting permanently disabled..."

---

## BaseScan Links

View your deployed contracts:

- **AttesterNFT**: https://basescan.org/address/0xBF77ffdbc85F0f9Bb16eFaFA330437a0e1794d1F
- **CitizenNFT**: https://basescan.org/address/0x5363EF81d79acCaA6F9a8E924199E3Cf05E0D18e
- **AttesterGovernor**: https://basescan.org/address/0x5133f3B1EC54C6A212D9ddC6B3c681614bB5f5bE

---

## Dev Server Status

✅ **Running on**: http://localhost:3003

The server was restarted to load the new contract addresses. All frontend components now use the new secure contracts.

---

## Next Steps

1. Test the verification flow with founding members
2. Create your first Citizen NFT request
3. Test multi-signature approval process
4. Verify emergency mint is disabled
5. Optional: Verify contracts on BaseScan for transparency

---

## Rollback (If Needed)

If you need to revert to old contracts:

```typescript
// In verification-contracts.ts and contracts.ts:
attesterNFT: "0x72A58974Fe47cE9a5e9a7f356947BeCdA1C26D2C"
citizenNFT: "0xc49003E2b834ee10CADa6bcf3b369C7b9E01d7cd"
governor: "0xBa4d0DD1a0e4bF8B08e8eF39FcaEA16F9CDDb90B"
```

Then restart dev server.

---

## Support

If you encounter issues:
- Check wallet is connected to Base Mainnet
- Clear browser cache and reconnect wallet
- Verify contract addresses match on BaseScan
- Check console for error messages

**All systems updated and ready! 🚀**
