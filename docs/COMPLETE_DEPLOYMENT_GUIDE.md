# Complete DAO Deployment Guide

## Overview

This guide walks you through deploying all three contracts for your Röbel/Müritz DAO verification and governance system.

## 📋 Prerequisites

Before you start:
- [ ] Node.js installed (v18 or v20 recommended)
- [ ] thirdweb CLI installed: `npm install -g thirdweb`
- [ ] thirdweb API key ready
- [ ] Wallet with Base mainnet ETH for deployment
- [ ] **3 founding Attester wallet addresses** (trusted community leaders)
- [ ] **3 founding Citizen wallet addresses** (initial verified citizens)

## 🏗️ Architecture

```
AttesterNFT (Deployed first)
    ↓
CitizenNFT (Depends on AttesterNFT address)
    ↓
AttesterGovernor (Depends on both NFT addresses)
```

**Governance Model:**
- **Attesters** = Can create proposals (but need Citizen NFT to vote)
- **Citizens** = Can vote on proposals (but need Attester NFT to propose)
- **Dual holders** = Full governance rights (can propose AND vote)

---

## 🚀 Step 1: Deploy AttesterNFT

### What is AttesterNFT?
Soulbound NFT for culture committee members who can verify citizens. Requires 2 Attester signatures to mint new Attesters.

### Compilation

```bash
cd governor-contract
npx hardhat clean
npx hardhat compile
```

**Expected output:** ✅ Compiled successfully

### Deployment

```bash
npx thirdweb deploy -k YOUR_SECRET_KEY
```

Select: `AttesterNFT`

### Constructor Parameters

When prompted, enter:

1. **initialOwner**: `0xYourWalletAddress`
   - Your wallet address that will own the contract

2. **name**: `"Roebel Attester"`
   - Display name for the NFT collection

3. **symbol**: `"ROEBEL-ATTESTER"`
   - Ticker symbol for the NFT

4. **foundingAttesters**: `["0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28", "0x2518b7C515c3fFe2eAB45033534ccFbec7d21452", "0xa7406861b5a5d542c7ffB35a5837E1ADfbBE92B7"]`
   - **IMPORTANT**: 3 trusted community leader addresses
   - These 3 people will get Attester NFTs immediately
   - They cannot be the same as `initialOwner`
   - Cannot be zero addresses

### Example Values

```javascript
{
  "initialOwner": "0x1234567890123456789012345678901234567890",
  "name": "Roebel Attester",
  "symbol": "ROEBEL-ATTESTER",
  "foundingAttesters": [
    "0xFounder1Address...",
    "0xFounder2Address...",
    "0xFounder3Address..."
  ]
}
```

### After Deployment

✅ **Save the deployed AttesterNFT address!**

Example: `0xDC9e7C03d354F78475E8bC35a166A784319C56ae`

### Verify Deployment

Check on BaseScan:
- 3 NFTs minted to founding attesters
- Token IDs: 0, 1, 2
- Contract verified and readable

---

## 🚀 Step 2: Deploy CitizenNFT

### What is CitizenNFT?
Soulbound NFT with voting power for verified Röbel citizens. Requires 1 Attester + 1 Citizen signature to mint new Citizens.

### Deployment

```bash
npx thirdweb deploy -k YOUR_SECRET_KEY
```

Select: `CitizenNFT`

### Constructor Parameters

When prompted, enter:

1. **_attesterNFT**: `0xYourAttesterNFTAddress`
   - **From Step 1** - The AttesterNFT contract address you just deployed

2. **initialOwner**: `0xYourWalletAddress`
   - Your wallet address that will own the contract

3. **foundingCitizens**: `["0xAddress1", "0xAddress2", "0xAddress3"]`
   - **IMPORTANT**: 3 verified citizen addresses
   - These 3 people will get Citizen NFTs immediately
   - Can be the same as founding attesters (to give them voting rights)
   - Can be different addresses for pure voters

### Example Values

```javascript
{
  "_attesterNFT": "0xDC9e7C03d354F78475E8bC35a166A784319C56ae", // From Step 1
  "initialOwner": "0x1234567890123456789012345678901234567890",
  "foundingCitizens": [
    "0xCitizen1Address...",
    "0xCitizen2Address...",
    "0xCitizen3Address..."
  ]
}
```

### Recommendation: Give Attesters Voting Rights

To ensure Attesters can participate in governance, make founding citizens the SAME as founding attesters:

```javascript
{
  "_attesterNFT": "0xDC9e7C03d354F78475E8bC35a166A784319C56ae",
  "initialOwner": "0x1234567890123456789012345678901234567890",
  "foundingCitizens": [
    "0xFounder1Address...", // Same as AttesterNFT founder
    "0xFounder2Address...", // Same as AttesterNFT founder
    "0xFounder3Address..."  // Same as AttesterNFT founder
  ]
}
```

This gives them both Attester + Citizen NFTs = Full governance rights!

### After Deployment

✅ **Save the deployed CitizenNFT address!**

Example: `0xB7B767f472200C3240bd5cab33df801Bbe1519D5`

### Verify Deployment

Check on BaseScan:
- 3 NFTs minted to founding citizens
- Token IDs: 0, 1, 2
- Voting power delegated (if they self-delegated)
- Contract verified and readable

---

## 🚀 Step 3: Deploy AttesterGovernor

### What is AttesterGovernor?
DAO governance contract where Attesters create proposals and Citizens vote.

### Deployment

```bash
npx thirdweb deploy -k YOUR_SECRET_KEY
```

Select: `AttesterGovernor`

### Constructor Parameters

When prompted, enter:

1. **_attesterNFT**: `0xYourAttesterNFTAddress`
   - **From Step 1** - The AttesterNFT contract address

2. **_citizenNFT**: `0xYourCitizenNFTAddress`
   - **From Step 2** - The CitizenNFT contract address

3. **_timelock**: `0x0000000000000000000000000000000000000000`
   - Use zero address if you don't want timelock delays
   - Or deploy a TimelockController first and use its address

4. **_initialVotingDelay**: `7200`
   - Blocks until voting starts (~1 day on Base)
   - Type: `uint48`

5. **_initialVotingPeriod**: `50400`
   - Blocks for voting duration (~7 days on Base)
   - Type: `uint32`

6. **_quorumNumeratorValue**: `10`
   - Percentage of voters required for quorum (10%)
   - Type: `uint256`

### Example Values

```javascript
{
  "_attesterNFT": "0xDC9e7C03d354F78475E8bC35a166A784319C56ae",      // From Step 1
  "_citizenNFT": "0xB7B767f472200C3240bd5cab33df801Bbe1519D5",       // From Step 2
  "_timelock": "0x0000000000000000000000000000000000000000",        // No timelock
  "_initialVotingDelay": 7200,                                      // ~1 day
  "_initialVotingPeriod": 50400,                                    // ~7 days
  "_quorumNumeratorValue": 10                                       // 10% quorum
}
```

### Parameter Explanation

**Voting Delay (7200 blocks):**
- Base block time: ~2 seconds
- 7200 blocks × 2 seconds = 14,400 seconds = ~4 hours
- Gives people time to review proposals before voting starts

**Voting Period (50400 blocks):**
- 50400 blocks × 2 seconds = 100,800 seconds = ~28 hours
- For a true 7 days, use: `302,400` blocks

**Quorum (10%):**
- If you have 10 Citizens, at least 1 must vote
- If you have 100 Citizens, at least 10 must vote

### After Deployment

✅ **Save the deployed AttesterGovernor address!**

Example: `0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A`

### Verify Deployment

Check the contract:
- Can call `canPropose(attesterAddress)` → returns `true`
- Can call `getVotes(citizenAddress)` → returns `0` (until they delegate)
- Voting delay and period match your settings

---

## 🔧 Step 4: Update Frontend

### Edit Contract Addresses

Open: `dao-app/src/lib/verification-contracts.ts`

Update with your deployed addresses:

```typescript
export const VERIFICATION_CONTRACTS = {
  attesterNFT: "0xYourAttesterNFTAddress",  // From Step 1
  citizenNFT: "0xYourCitizenNFTAddress",    // From Step 2
  governor: "0xYourGovernorAddress",        // From Step 3
};
```

### Test Frontend

```bash
cd dao-app
npm run dev
```

Open: `http://localhost:3000`

**Testing checklist:**
- [ ] Connect wallet
- [ ] Check verification status (should show if you have NFTs)
- [ ] Create attestation request
- [ ] Approve requests (if you're a founder)
- [ ] Create proposal (if you're an Attester)
- [ ] Vote on proposals (if you're a Citizen with delegated votes)

---

## ✅ Post-Deployment Checklist

### Immediate Actions

1. **Founding Attesters: Self-delegate voting power**
   ```
   - Go to Profile page
   - Click "Activate Voting Rights"
   - Sign transaction
   ```

2. **Test Verification Flow**
   ```
   - Create test attestation request
   - Have 3 attesters approve it
   - Verify NFT minted correctly
   ```

3. **Test Governance Flow**
   ```
   - Attester creates proposal
   - Citizens vote
   - Check quorum and results
   ```

### Security Checks

- [ ] Verify founding attesters received NFTs
- [ ] Verify founding citizens received NFTs
- [ ] Test that non-attesters CANNOT create proposals
- [ ] Test that non-citizens have 0 voting power
- [ ] Verify contract ownership is correct
- [ ] Check that emergency mint is disabled

### Documentation

Update your records with:
- [ ] All 3 contract addresses
- [ ] Deployment transaction hashes
- [ ] BaseScan verification links
- [ ] List of founding attesters
- [ ] List of founding citizens

---

## 🔍 Where to Find Your Values

### Founding Attester Addresses

These should be **trusted community leaders** who will:
- Review and approve new Attester applications
- Create governance proposals
- Maintain the culture committee

**How to choose:**
- Long-standing community members
- Active participants in community decisions
- Trusted by other members
- Understand DAO values and mission

### Founding Citizen Addresses

These should be **verified community members** who will:
- Vote on governance proposals
- Approve new Citizen applications
- Participate in decision-making

**Recommendation:**
Use the SAME addresses as founding attesters to give them full governance rights (proposal creation + voting).

### Getting Wallet Addresses

1. **MetaMask**: Copy address from wallet
2. **Coinbase Wallet**: Tap "Receive" → Copy address
3. **WalletConnect**: Connect to app → Copy address

**Format:** Must be Ethereum address (42 characters, starts with `0x`)

**Example:** `0x1234567890123456789012345678901234567890`

---

## ❌ Common Issues

### Issue: "Invalid founding attester address"

**Cause:** One of the addresses is `0x0000000000000000000000000000000000000000`

**Fix:** Ensure all 3 addresses are valid, non-zero Ethereum addresses

### Issue: "Owner cannot be founding attester"

**Cause:** `initialOwner` is the same as one of the `foundingAttesters`

**Fix:** Use a different address for `initialOwner`, OR accept that the owner won't get a founding NFT

### Issue: Voting power is 0 even after getting Citizen NFT

**Cause:** Citizens must **delegate their voting power** to activate it

**Fix:**
1. Go to Profile page
2. Click "Activate Voting Rights"
3. Sign delegation transaction
4. Voting power will now show as 1

### Issue: Cannot create proposals even with Attester NFT

**Cause:** Make sure:
1. You have the Attester NFT (check on BaseScan)
2. You're connected with the correct wallet
3. The governor contract address is correct

**Fix:** Check `canPropose(yourAddress)` on the governor contract

---

## 📊 Deployed Contracts (Example)

Based on your current deployment:

| Contract | Address | Network |
|----------|---------|---------|
| AttesterNFT | `0xDC9e7C03d354F78475E8bC35a166A784319C56ae` | Base Mainnet |
| CitizenNFT | `0xB7B767f472200C3240bd5cab33df801Bbe1519D5` | Base Mainnet |
| AttesterGovernor | `0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A` | Base Mainnet |

**BaseScan Links:**
- AttesterNFT: https://basescan.org/address/0xDC9e7C03d354F78475E8bC35a166A784319C56ae
- CitizenNFT: https://basescan.org/address/0xB7B767f472200C3240bd5cab33df801Bbe1519D5
- AttesterGovernor: https://basescan.org/address/0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A

---

## 🎯 Quick Reference

### Deployment Order
1. AttesterNFT (no dependencies)
2. CitizenNFT (needs AttesterNFT address)
3. AttesterGovernor (needs both NFT addresses)

### Key Parameters
- **Founding Attesters**: 3 trusted community leaders
- **Founding Citizens**: 3 verified members (can be same as attesters)
- **Voting Delay**: 7200 blocks (~1 day)
- **Voting Period**: 50400 blocks (~7 days)
- **Quorum**: 10% of Citizens must vote

### Governance Rights
- **Attester only**: Can propose ❌ Can vote
- **Citizen only**: Can propose | ✅ Can vote (after delegation)
- **Both NFTs**: ✅ Can propose | ✅ Can vote

---

## 📝 Notes

- All NFTs are **soulbound** (non-transferable)
- Emergency mint is **permanently disabled** (fraud prevention)
- Delegation must be done **manually** by each Citizen
- Proposals require **Attester NFT** to create
- Voting requires **Citizen NFT** + delegation

**Date Created:** 2025-11-12
**Author:** Claude Code Assistant
