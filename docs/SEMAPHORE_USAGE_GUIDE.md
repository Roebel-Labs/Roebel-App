# 🚀 Semaphore System - Complete Usage Guide

## 📍 Your Deployed Contracts (Base Mainnet)

```
Citizen Registry:        0xB2Ec982d7318A29746862AF3fc0F8B9C4E2E86B9
Citizen NFT (Roebel):    0xD9f1D05215415ac3DeC093Cf55D2f653EF06264C
Anonymous Governor:       0x1cA1849B640d026c6884b119013f8E72551415F7
Citizen Group ID:        7
Network:                 Base Mainnet (Chain ID: 8453)
```

---

## 🎯 Testing the Complete Flow (You as First Citizen)

### **Phase 1: Generate Your Identity**

1. **Start the frontend**:
   ```bash
   cd dao-app
   npm run dev
   ```

2. **Visit**: http://localhost:3000/semaphore

3. **Click**: "Generate Identity"

4. **On `/semaphore/identity` page**:
   - Click "Generate New Identity"
   - Your Semaphore identity is created locally
   - **COPY your Identity Commitment** (the long number)
   - **IMPORTANT**: Click "Export Encrypted Backup" and save it!
   - Store backup password safely

**What you have now**:
- ✅ Anonymous identity stored in browser
- ✅ Identity commitment (to share with admin)
- ✅ Encrypted backup (in case you lose browser data)

---

### **Phase 2: Add Yourself as Admin (On-Chain)**

Since you're the first citizen AND the admin, you'll add your own commitment to the registry:

#### **Option A: Using thirdweb Dashboard** (Easiest)

1. **Go to**: https://thirdweb.com/base/0xB2Ec982d7318A29746862AF3fc0F8B9C4E2E86B9

2. **Connect your wallet** (the admin wallet)

3. **Click "Write Contract"**

4. **Find `addCitizen` function**:
   - `identityCommitment`: Paste your commitment from Phase 1
   - `citizenAddress`: Your wallet address
   - Click "Execute"

5. **Confirm transaction** in your wallet

#### **Option B: Using Hardhat Script**

```javascript
// scripts/add-citizen.js
const { ethers } = require("hardhat");

async function main() {
  const registryAddress = "0xB2Ec982d7318A29746862AF3fc0F8B9C4E2E86B9";
  const registry = await ethers.getContractAt("CitizenRegistry", registryAddress);

  const commitment = "YOUR_IDENTITY_COMMITMENT_HERE";
  const yourAddress = "YOUR_WALLET_ADDRESS";

  const tx = await registry.addCitizen(commitment, yourAddress);
  await tx.wait();

  console.log("✅ Citizen added!");
  console.log("Transaction:", tx.hash);
}

main();
```

#### **Option C: Using Remix**

1. Go to https://remix.ethereum.org
2. Load `CitizenRegistry.sol`
3. Connect to Base Mainnet
4. Load contract at `0xB2Ec982d7318A29746862AF3fc0F8B9C4E2E86B9`
5. Call `addCitizen(commitment, address)`

**Verify it worked**:
```javascript
// On thirdweb dashboard, call:
citizenCount() // Should return 1
isCitizen(yourCommitment) // Should return true
```

---

### **Phase 3: Check Your Status**

1. **Visit**: http://localhost:3000/semaphore/status

2. **Connect wallet**

3. **See**: "✅ Registered Citizen" status

**What this checks**:
- Reads from CitizenRegistry contract
- Verifies your commitment is on-chain
- Shows you're part of the Semaphore group

---

### **Phase 4: (Optional) Mint Citizen NFT Anonymously**

This proves you're a citizen without revealing which one!

#### **Prerequisites**:
- You need to build the NFT minting UI (I can add this)
- OR use contract directly

#### **Using Contract Directly**:

The NFT minting requires generating a Semaphore proof. Here's the flow:

```typescript
import { loadIdentity } from "@/lib/semaphore";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

// 1. Load your identity
const identity = loadIdentity();

// 2. Create group (with your commitment as only member for now)
const group = new Group(7, 20); // groupId=7, depth=20
group.addMember(BigInt(yourCommitment));

// 3. Generate proof
const message = hashAddressToField(yourWalletAddress);
const proof = await generateProof(identity, group, message, 7n);

// 4. Call mintWithProof on NFT contract
await citizenNFT.mintWithProof(
  proof.merkleTreeDepth,
  proof.merkleTreeRoot,
  proof.nullifier,
  proof.message,
  proof.merkleTreeSiblings,
  proof.points
);
```

**Result**: You get an NFT that proves citizenship without revealing your identity!

---

### **Phase 5: Create Anonymous Proposal**

#### **Prerequisites for Proof Generation**:

**IMPORTANT**: To generate proofs, you need the complete Semaphore group membership list. Since we can't easily fetch this from events yet, here's how to handle it:

**Option 1: Track Members Off-Chain** (Recommended for MVP)
```typescript
// Store in localStorage or simple DB
const knownMembers = [
  BigInt("yourCommitment1"),
  BigInt("yourCommitment2"),
  // ... add each citizen as they're registered
];
```

**Option 2: Use Subgraph** (Production)
- Deploy a subgraph that indexes `MemberAdded` events
- Query all citizens from subgraph
- Build group from that data

**For your first test** (single citizen):
```typescript
// You only have yourself in the group
const group = new Group(7, 20);
group.addMember(BigInt(yourCommitment));
```

#### **Create Proposal**:

1. **Visit**: http://localhost:3000/semaphore/proposals/create

2. **Fill in**:
   - Title: "Test Proposal"
   - Description: "Testing anonymous governance"
   - Target: Any contract address (or 0x0)
   - Value: 0
   - Calldata: 0x

3. **Click "Generate Proof"**:
   - System loads your identity
   - Creates group with known members
   - Generates ZK proof

4. **Click "Submit Proposal"**:
   - Proof is sent to AnonymousGovernor
   - Proposal created anonymously!

**Verify**:
- Proposal appears in list
- No one knows you created it
- You can see proposal ID and status

---

### **Phase 6: Vote Anonymously**

1. **Visit**: Proposal page

2. **Choose**: For / Against / Abstain

3. **Click "Vote"**:
   - System generates vote proof
   - Binds to specific proposal
   - Uses unique nullifier

4. **Submit vote**:
   - Vote counted anonymously
   - Nullifier prevents double-voting

**Check results**:
- See vote tallies (For: 1, Against: 0, Abstain: 0)
- Cannot see WHO voted
- Only that votes were cast

---

## 🔧 Technical Implementation Status

### ✅ **Completed**:
- Smart contracts deployed to Base Mainnet
- Configuration file with all addresses
- Contract interaction utilities
- Proof generation library
- Identity management
- Landing page (`/semaphore`)
- Identity generation page (`/semaphore/identity`)

### 🚧 **Remaining Pages to Build**:

#### **High Priority** (For Testing):
1. `/semaphore/status` - Check citizen status
2. `/semaphore/proposals` - List proposals
3. `/semaphore/proposals/create` - Create proposals
4. `/semaphore/proposals/[id]` - View & vote on proposals

#### **Medium Priority** (For Full System):
5. `/semaphore/apply` - Application form
6. `/semaphore/admin` - Admin dashboard
7. `/semaphore/admin/applications` - Review applications
8. `/semaphore/admin/citizens` - Manage citizens

---

## 📝 Quick Commands

### **Add Citizen (Admin)**:
```typescript
// Using thirdweb SDK
import { getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { client } from "@/app/client";
import { base } from "thirdweb/chains";

const registry = getContract({
  client,
  address: "0xB2Ec982d7318A29746862AF3fc0F8B9C4E2E86B9",
  chain: base,
});

const tx = prepareContractCall({
  contract: registry,
  method: "function addCitizen(uint256, address)",
  params: [commitment, address],
});

await sendTransaction({ transaction: tx, account });
```

### **Check Citizen Count**:
```typescript
import { readContract } from "thirdweb";

const count = await readContract({
  contract: registry,
  method: "function citizenCount() view returns (uint256)",
  params: [],
});

console.log("Total citizens:", count.toString());
```

### **Check if Registered**:
```typescript
const isRegistered = await readContract({
  contract: registry,
  method: "function isCitizen(uint256) view returns (bool)",
  params: [commitment],
});

console.log("Is citizen:", isRegistered);
```

---

## 🐛 Troubleshooting

### **"Identity not found"**
- Generate new identity at `/semaphore/identity`
- Check localStorage for `hometown-dao-identity`

### **"Not registered as citizen"**
- Verify commitment was added to CitizenRegistry
- Call `isCitizen(commitment)` on contract
- Check transaction was successful on BaseScan

### **"Proof generation failed"**
- Ensure group has correct members
- Verify group root matches on-chain
- Check identity is valid
- Ensure commitment is in group

### **"Nullifier already used"**
- You've already voted/minted with this proof
- Each proof can only be used once
- This is expected behavior (prevents double-voting)

---

## 🔐 Security Best Practices

### **Identity Management**:
- ✅ **DO**: Export encrypted backup immediately
- ✅ **DO**: Store backup in multiple secure locations
- ✅ **DO**: Use strong password for encryption
- ❌ **DON'T**: Share identity secret with anyone
- ❌ **DON'T**: Store identity unencrypted

### **Admin Operations**:
- ✅ **DO**: Verify citizen documents thoroughly
- ✅ **DO**: Keep records of verifications
- ✅ **DO**: Use multi-sig for admin wallet (production)
- ❌ **DON'T**: Add unverified citizens
- ❌ **DON'T**: Share admin private keys

### **Proof Generation**:
- ✅ **DO**: Generate proofs in browser (never server)
- ✅ **DO**: Verify proofs on-chain
- ✅ **DO**: Check nullifiers aren't reused
- ❌ **DON'T**: Cache or store proofs
- ❌ **DON'T**: Reuse same proof multiple times

---

## 📊 System Limits

- **Max Citizens**: Limited by Semaphore group size (~2^20 = 1M+)
- **Voting Period**: 7 days (configurable)
- **Proposal Threshold**: 1 citizen (configurable)
- **Quorum**: 10% of citizens must vote
- **Support Threshold**: 51% support required to pass

---

## 🎯 Next Steps After Testing

### **Short Term**:
1. Add remaining UI pages (proposals, voting)
2. Implement application form
3. Build admin review interface
4. Add event indexing for group sync

### **Medium Term**:
1. Deploy subgraph for event indexing
2. Add IPFS for document storage
3. Implement automated KYC integration
4. Mobile-responsive improvements

### **Long Term**:
1. Multi-tier citizenship (different voting weights)
2. Delegation via ZK proofs
3. Reputation system (anonymous)
4. Integration with existing DAO systems

---

## 💬 Support

**Questions?**
- Check the main SEMAPHORE_README.md
- Review deployment guide
- Check Semaphore docs: https://docs.semaphore.pse.dev/

**Issues?**
- Verify contract addresses
- Check network (Base Mainnet)
- Ensure wallet has Base ETH for gas

---

**You're ready to test! Start with Phase 1 and work through each phase.** 🚀

The system is functional - you just need to build the remaining UI pages or interact with contracts directly for now.
