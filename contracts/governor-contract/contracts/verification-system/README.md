# Röbel Citizen Verification System

A decentralized social verification system for Röbel/Müritz DAO governance, enabling culture committee members to verify citizens without centralized town administration.

## 📋 Overview

### Problem
How do we verify that users are actual citizens of Röbel/Müritz (population ~5000) for DAO governance participation, without relying on centralized verification?

### Solution
Two-tier Soulbound NFT system with decentralized social verification:

1. **Attester SBT NFT** - Culture committee members who verify others
2. **Citizen SBT NFT** - Verified citizens with DAO voting rights

## 🏗️ System Architecture

### Attester SBT NFT
- **Purpose**: Culture committee members who can attest citizens
- **Minting**: Requires 2 Attester signatures
- **Revocation**: Requires 2 Attester signatures
- **Initial Bootstrap**: 3 founding committee members receive emergency mint
- **Properties**: Soulbound (non-transferable), one per wallet
- **Governance**: No direct voting rights (but should hold Citizen SBT)

### Citizen SBT NFT
- **Purpose**: Verified citizens with DAO voting rights (ERC721Votes)
- **Minting**: Requires 1 Attester + 1 Citizen signature (minimum 2 unique people)
  - Dual NFT holders explicitly choose their role via `signAsAttester`
  - Requester cannot approve their own request
- **Revocation**: Requires 1 Attester signature
- **Initial Bootstrap**: Same 3 founding members receive emergency mint
- **Properties**: Soulbound, one per wallet, ERC721Votes for governance
- **Governance**: 1 NFT = 1 vote in DAO

### Evidence System
- All requests include IPFS evidence URI
- Evidence stored as JSON: `{ name, address, reason, date }`
- Frontend displays evidence with QR code for mobile signing
- Evidence is immutable once request created

### Request Flow
1. User creates attestation request with IPFS evidence
2. Request appears in public dashboard
3. Attesters/Citizens scan QR code or click to approve
4. Signatures collected on-chain
5. Once threshold met, NFT auto-mints **immediately**
6. User receives real-time voting rights

## 📦 Smart Contracts

### AttesterNFT.sol
```solidity
- createAttestationRequest(evidenceURI) → requestId
- createRevocationRequest(target, evidenceURI) → requestId
- approveRequest(requestId)
- rejectRequest(requestId)
- emergencyMint(address) // Owner only, for bootstrap
```

### CitizenNFT.sol
```solidity
- createAttestationRequest(evidenceURI) → requestId
- createRevocationRequest(target, evidenceURI) → requestId
- approveRequest(requestId)
- rejectRequest(requestId)
- emergencyMint(address) // Owner only, for bootstrap
```

## 🚀 Deployment Instructions

### Step 1: Deploy Attester NFT
```bash
cd governor-contract
npx thirdweb deploy contracts/verification-system/AttesterNFT.sol
```

**Constructor Parameters:**
1. `name`: `"Röbel Attester"`
2. `symbol`: `"ROEBEL-ATTESTER"`
3. `initialOwner`: Your deployer wallet address (will be contract owner)

**Save the deployed address!**

### Step 2: Deploy Citizen NFT
```bash
npx thirdweb deploy contracts/verification-system/CitizenNFT.sol
```

**Constructor Parameters:**
1. `_attesterNFT`: Address of deployed AttesterNFT contract (from Step 1)
2. `initialOwner`: Your deployer wallet address (will be contract owner)

**Save the deployed address!**

### Step 3: Bootstrap Initial Attesters & Citizens

You need 3 founding wallet addresses (culture committee members).

#### Option A: Via thirdweb Dashboard
1. Go to AttesterNFT contract → Write tab
2. Call `emergencyMint(address)` three times with each founding wallet
3. Go to CitizenNFT contract → Write tab
4. Call `emergencyMint(address)` three times with the same wallets

#### Option B: Via Hardhat Script
```javascript
// scripts/bootstrap-verification.js
const attesterNFT = await ethers.getContractAt("AttesterNFT", "0x...");
const citizenNFT = await ethers.getContractAt("CitizenNFT", "0x...");

const founders = [
  "0xFounder1Address",
  "0xFounder2Address",
  "0xFounder3Address"
];

for (const founder of founders) {
  await attesterNFT.emergencyMint(founder);
  await citizenNFT.emergencyMint(founder);
}
```

### Step 4: Deploy Governor (Optional)

If you want to use CitizenNFT with governance:

```bash
npx thirdweb deploy contracts/SimpleHomeTownGovernor.sol
```

**Constructor Parameters:**
1. `_token`: Address of **CitizenNFT** (not HomeTownVotingNFT)
2. `_timelock`: TimelockController address (or `0x0000000000000000000000000000000000000000`)
3. `_initialVotingDelay`: `7200` (1 day in blocks)
4. `_initialVotingPeriod`: `50400` (7 days in blocks)
5. `_initialProposalThreshold`: `1` (1 Citizen NFT minimum)
6. `_quorumNumeratorValue`: `10` (10% quorum)

## 📊 Usage Examples

### Request Attester NFT
```javascript
// Frontend code
import { prepareContractCall } from "thirdweb";

// Upload evidence to IPFS first
const evidence = {
  name: "Max Mustermann",
  address: "Hauptstraße 1, 17207 Röbel",
  reason: "Teil des Kulturausschusses und Bürger von Röbel",
  date: new Date().toISOString()
};
const evidenceURI = await uploadToIPFS(evidence);

// Create request
const transaction = prepareContractCall({
  contract: attesterContract,
  method: "createAttestationRequest",
  params: [evidenceURI]
});
await sendTransaction(transaction);
```

### Approve Request
```javascript
const transaction = prepareContractCall({
  contract: attesterContract, // or citizenContract
  method: "approveRequest",
  params: [requestId]
});
await sendTransaction(transaction);
```

### Monitor Request Status
```javascript
import { readContract } from "thirdweb";

const request = await readContract({
  contract: attesterContract,
  method: "getRequest",
  params: [requestId]
});

console.log({
  target: request.target,
  status: request.status, // 0=Pending, 1=Approved, 2=Rejected, 3=Executed
  signatures: request.signatureCount,
  evidenceURI: request.evidenceURI
});
```

## 🔐 Security Features

1. **Soulbound NFTs**: Cannot be transferred, only minted/burned
2. **One NFT per wallet**: Each address can only hold one Attester/Citizen NFT at a time
3. **Multi-signature approval**: Prevents single-point-of-failure
4. **Self-approval prevention**: Requester cannot approve their own request
5. **Immutable evidence**: IPFS evidence cannot be changed after request creation
6. **Rejection mechanism**: Bad requests can be rejected, wallet can re-request
7. **Revocation system**: Citizens who leave town can have NFTs revoked
8. **Re-verification possible**: Revoked users can re-request after returning

## 📈 Signature Requirements

| Action | Required Signatures | Details |
|--------|-------------------|---------|
| Mint Attester NFT | 3 Attesters | 3 different Attester NFT holders |
| Revoke Attester NFT | 3 Attesters | 3 different Attester NFT holders |
| Mint Citizen NFT | 1 Attester + 1 Citizen | If Attester holds both, counts as both. Min 2 people. |
| Revoke Citizen NFT | 3 Attesters | Only Attesters can revoke Citizens |

## 🎨 Frontend Integration

### Environment Setup
```bash
cd dao-app
npm install qrcode-generator react-qr-code
```

### Contract Addresses (Update after deployment)
```typescript
// src/lib/contracts.ts
export const CONTRACTS = {
  attesterNFT: "0x...", // Your deployed AttesterNFT address
  citizenNFT: "0x...",  // Your deployed CitizenNFT address
  governor: "0x..."     // Your deployed Governor address (optional)
};
```

### Key Frontend Features to Build
1. **Verification Dashboard** (`/verification`)
   - User's verification status
   - Pending requests count
   - Quick actions

2. **Request Creation** (`/verification/request-attester`, `/verification/request-citizen`)
   - Form to input evidence data
   - Upload to IPFS
   - Submit on-chain request

3. **Request List** (`/verification/requests`)
   - List all pending attestation/revocation requests
   - Filter by type (Attester/Citizen, Attestation/Revocation)
   - Show signature progress (e.g., "2/3 signatures")

4. **Request Details** (`/verification/requests/[id]`)
   - Display evidence (parsed JSON)
   - QR code for mobile signing
   - Approve/Reject buttons
   - Real-time signature count

5. **Admin Panel** (`/admin/dashboard/verification`)
   - Bootstrap controls (emergency mint)
   - System analytics
   - All requests overview

## 🔄 Workflow Example

### Adding a New Citizen

1. **Emma (New Citizen)**:
   - Opens Röbel app
   - Navigates to "Become a Citizen"
   - Fills form: Name, Address, Reason
   - Clicks "Submit Request"
   - Evidence uploaded to IPFS
   - Request created on-chain

2. **Lisa (Attester & Citizen)**:
   - Sees Emma's request in dashboard
   - Reviews evidence
   - Scans QR code with mobile wallet
   - Signs to approve
   - Lisa's signature counts as 1 Attester + 1 Citizen (both requirements met!)

3. **System**:
   - Detects threshold reached (1 Attester + 1 Citizen)
   - Auto-mints Citizen NFT to Emma
   - Emma receives real-time voting rights
   - Emma can now vote in DAO proposals

### Revoking a Citizen

1. **Thomas (Citizen)**:
   - Creates revocation request for Michael (moved away)
   - Evidence: "Michael ist nach Berlin gezogen am 2025-01-15"

2. **1 Attester** (Lisa):
   - Reviews evidence
   - Signs to approve revocation

3. **System**:
   - Detects 1 Attester signature
   - Burns Michael's Citizen NFT
   - Michael loses voting rights
   - Michael can re-request if he returns

## 🧪 Testing Checklist

- [ ] Deploy AttesterNFT
- [ ] Deploy CitizenNFT with correct AttesterNFT address
- [ ] Emergency mint 3 Attester NFTs
- [ ] Emergency mint 3 Citizen NFTs (same wallets)
- [ ] Test Attester request creation
- [ ] Test Attester request approval (2 signatures)
- [ ] Verify NFT minted on threshold
- [ ] Test Citizen request creation
- [ ] Test Citizen request with Attester + Citizen approval
- [ ] Test rejection mechanism
- [ ] Test revocation flow
- [ ] Test re-requesting after rejection/revocation
- [ ] Verify soulbound (transfer should fail)
- [ ] Test CitizenNFT with Governor voting

## 📚 Next Steps

1. ✅ Deploy contracts to Base testnet/mainnet
2. ⏳ Build frontend verification dashboard
3. ⏳ Implement IPFS evidence upload
4. ⏳ Create QR code signing flow
5. ⏳ Integrate with existing DAO app
6. ⏳ Test with culture committee
7. ⏳ Launch to Röbel community

## 🆘 Support

### Common Issues

**Q: Can I transfer my Citizen NFT?**
A: No, all NFTs are soulbound (non-transferable).

**Q: What if I typed my name wrong?**
A: Someone can reject your request, then you can create a new one.

**Q: Can I hold multiple Citizen NFTs?**
A: No, each wallet can only hold ONE Citizen NFT.

**Q: What if an Attester becomes inactive?**
A: Other Attesters can create a revocation request to remove their Attester NFT.

**Q: Do Attesters have voting rights?**
A: Only if they also hold a Citizen NFT (which they should).

**Q: What happens if not enough people sign my request?**
A: Request stays pending. You can ask people to review it, or cancel and re-request.

### Contract Addresses

| Contract | Address | Network |
|----------|---------|---------|
| AttesterNFT | `0x...` | Base |
| CitizenNFT | `0x...` | Base |
| Governor | `0x...` | Base |

(Update after deployment)

## 📝 License

MIT License - Feel free to adapt for your own town DAO!

---

Built with ❤️ for Röbel/Müritz by the Kulturausschuss
