# Secure Bootstrap Deployment Guide

## Overview

The verification system has been updated with **secure bootstrap** to prevent fraud and centralization.

### Key Security Improvements:

✅ **No Owner Backdoor**: Emergency mint is permanently disabled after deployment
✅ **Constructor Bootstrap**: 3 founding members per contract are minted at deployment
✅ **Transparent**: All founding members visible on-chain from block 1
✅ **Decentralized**: All future members require multi-sig approval
✅ **Two-Person Minimum**: One person with both NFTs counts as ONE role only

---

## Contracts Modified

### 1. **AttesterNFT.sol**
- Added `address[3] memory foundingAttesters` to constructor
- Auto-mints 3 Attester NFTs in constructor
- `emergencyMint()` now reverts permanently

### 2. **CitizenNFT.sol**
- Added `address[3] memory foundingCitizens` to constructor
- Auto-mints 3 Citizen NFTs in constructor
- `emergencyMint()` now reverts permanently
- Fixed signature logic: one person = one role (Attester priority)
- Requires 2 DIFFERENT people to approve requests

---

## Deployment Instructions (Remix)

### Prerequisites

Before deployment, prepare:
1. **3 Founding Attester Wallet Addresses**
2. **3 Founding Citizen Wallet Addresses**
3. Your deployer wallet with ETH on Base network

### Step 1: Deploy AttesterNFT

**File**: `contracts/verification-system/AttesterNFT.sol`

**Constructor Parameters**:
```solidity
initialOwner: "0xYourDeployerWallet"
name: "Roebel Attester"
symbol: "ROEBEL-ATTESTER"
foundingAttesters: ["0xAttester1", "0xAttester2", "0xAttester3"]
```

**Example**:
```solidity
initialOwner: 0x1234...abcd
name: Roebel Attester
symbol: ROEBEL-ATTESTER
foundingAttesters: [
  "0xAlice...",
  "0xBob...",
  "0xCarol..."
]
```

**Result**:
- Contract deploys
- 3 Attester NFTs minted to founding addresses
- `emergencyMint()` is permanently disabled

**Copy the deployed contract address!**

---

### Step 2: Deploy CitizenNFT

**File**: `contracts/CitizenNFT.sol`

**Constructor Parameters**:
```solidity
_attesterNFT: "0xDeployedAttesterNFTAddress"  // From Step 1
foundingCitizens: ["0xCitizen1", "0xCitizen2", "0xCitizen3"]
```

**Example**:
```solidity
_attesterNFT: 0x5678...ef01  // Deployed AttesterNFT address
foundingCitizens: [
  "0xDave...",
  "0xEve...",
  "0xFrank..."
]
```

**Result**:
- Contract deploys
- 3 Citizen NFTs minted to founding addresses
- `emergencyMint()` is permanently disabled
- System is fully operational

**Copy the deployed contract address!**

---

### Step 3: Update Frontend

**File**: `dao-app/src/lib/verification-contracts.ts`

Update the contract addresses:

```typescript
export const VERIFICATION_CONTRACTS = {
  attesterNFT: "0xYourNewAttesterNFTAddress", // From Step 1
  citizenNFT: "0xYourNewCitizenNFTAddress",   // From Step 2
  governor: "0xBa4d0DD1a0e4bF8B08e8eF39FcaEA16F9CDDb90B", // Keep existing
};
```

---

## Verification Checklist

After deployment, verify:

### AttesterNFT Contract:
- [ ] Total supply = 3
- [ ] 3 founding attesters have NFTs (check balanceOf)
- [ ] Call `emergencyMint(anyAddress)` → Should revert with message
- [ ] Call `hasAttesterNFT(foundingAddress)` → Should return `true`

### CitizenNFT Contract:
- [ ] Total supply = 3
- [ ] 3 founding citizens have NFTs (check balanceOf)
- [ ] Call `emergencyMint(anyAddress)` → Should revert with message
- [ ] Call `hasCitizenNFT(foundingAddress)` → Should return `true`
- [ ] Call `getApproverCount(0)` → Should return `0` (no requests yet)

### Test Multi-Sig Flow:
1. Create a new Citizen NFT request with one of the founding citizens
2. Approve with Attester wallet #1 → Check signatures increase
3. Try to approve again with same wallet → Should fail
4. Approve with Citizen wallet #2 → Should auto-mint NFT

---

## Security Features

### 1. **No Backdoor Minting**
```solidity
function emergencyMint(address) external pure {
    revert("Emergency minting permanently disabled...");
}
```
- Owner cannot mint unlimited NFTs
- Prevents fraud and fake attesters/citizens

### 2. **Constructor Bootstrap**
```solidity
constructor(..., address[3] memory foundingAttesters) {
    for (uint256 i = 0; i < 3; i++) {
        // Auto-mint to founding members
    }
}
```
- All founding members on-chain from block 1
- Transparent and immutable

### 3. **Two-Person Minimum**
```solidity
if (_hasRequiredSignatures(requestId) &&
    _requestApprovers[requestId].length >= 2) {
    _executeRequest(requestId);
}
```
- One person with both NFTs = one signature only
- Requires 2 different wallets to approve

### 4. **Single Role Per Person**
```solidity
if (isAttester) {
    req.attesterSignatures++;  // Count as Attester only
} else if (isCitizen) {
    req.citizenSignatures++;   // Count as Citizen only if NOT Attester
}
```
- Attester NFT takes priority over Citizen NFT
- Prevents double-counting from same wallet

---

## Deployment on Base Mainnet

### Network Details:
- **Chain ID**: 8453
- **RPC URL**: https://mainnet.base.org
- **Block Explorer**: https://basescan.org

### Gas Estimation:
- AttesterNFT deployment: ~2-3M gas (~$5-10)
- CitizenNFT deployment: ~3-4M gas (~$8-15)

### Post-Deployment:
1. Verify contracts on BaseScan (optional but recommended)
2. Update frontend with new addresses
3. Test with founding members
4. Announce to community

---

## Founding Member Responsibilities

### Founding Attesters (3 wallets):
- Can immediately create and approve requests
- Can approve new Attester requests (need 3 signatures)
- Can approve new Citizen requests (need 1 Attester + 1 Citizen)

### Founding Citizens (3 wallets):
- Can approve new Citizen requests (need 1 Attester + 1 Citizen)
- Can create revocation requests
- Can participate in DAO governance (voting)

### Important:
- **DO NOT LOSE PRIVATE KEYS** - NFTs are soulbound and cannot be transferred
- Founding members should delegate votes to self for DAO voting power
- Test the multi-sig flow immediately after deployment

---

## Troubleshooting

### Error: "Invalid founding attester address"
- Make sure all 3 addresses are valid Ethereum addresses
- Cannot be `0x0000000000000000000000000000000000000000`

### Error: "Owner cannot be founding attester"
- Deployer wallet cannot be one of the founding attesters
- Use different wallets for founding members

### Emergency mint still works
- Make sure you deployed the UPDATED contracts
- Check contract code in Remix matches the modified files

### Frontend not showing new contracts
- Clear browser cache
- Check `verification-contracts.ts` has correct addresses
- Restart dev server

---

## Support

If you encounter issues:
1. Check contract addresses in frontend match deployed addresses
2. Verify all 6 founding members received NFTs
3. Test emergencyMint reverts as expected
4. Check BaseScan for transaction details

**System is now decentralized and secure!** 🎉
