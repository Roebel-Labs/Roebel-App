# Semaphore-Based Citizen Verification System - Deployment Guide

## Overview

This system enables **privacy-preserving citizen identification** for your hometown DAO using **Semaphore v4** zero-knowledge proofs. Citizens can participate in governance anonymously while maintaining sybil resistance.

## Architecture

### Smart Contracts

1. **CitizenRegistry.sol** - Manages verified citizens using Semaphore groups
2. **CitizenVerificationNFT.sol** - Soulbound NFT for verified citizens (optional)
3. **AnonymousGovernor.sol** - Privacy-preserving governance with anonymous voting

### How It Works

```
1. Off-chain Verification → 2. Citizen Generates Identity → 3. Admin Adds to Registry
                    ↓
4. Citizen Proves Citizenship (ZK Proof) → 5. Anonymous Voting → 6. Proposal Execution
```

## Prerequisites

### 1. Deploy Semaphore Contract

Semaphore v4 must be deployed on your target chain. Check available deployments:

- **Base Sepolia (Testnet)**: `0x...` (check official docs)
- **Base Mainnet**: `0x...` (check official docs)

Or deploy your own:
```bash
# Install Semaphore CLI
npm install -g @semaphore-protocol/cli

# Create Semaphore project
semaphore create semaphore-contracts --template hardhat

# Deploy Semaphore
cd semaphore-contracts
npx hardhat run scripts/deploy.js --network base-sepolia
```

**Official Semaphore Deployments**: https://docs.semaphore.pse.dev/deployed-contracts

---

## Deployment Steps

### Step 1: Deploy CitizenRegistry

**Purpose**: Creates and manages the Semaphore group for verified citizens.

**Parameters**:
- `_semaphore`: Address of deployed Semaphore contract
- `_owner`: Town administrator address (controls citizen verification)

**Using thirdweb**:
```bash
cd governor-contract
npx thirdweb deploy
```

Select `CitizenRegistry.sol` and provide:
- Semaphore address: `0xYourSemaphoreAddress`
- Owner address: `0xYourAdminAddress`

**Note the deployed address**: `CITIZEN_REGISTRY_ADDRESS`

**What it does**:
- Creates a new Semaphore group on deployment
- Stores `citizenGroupId` for the hometown
- Only owner can add/remove citizens

---

### Step 2: (Optional) Deploy CitizenVerificationNFT

**Purpose**: Issues soulbound NFTs to citizens who prove membership anonymously.

**Parameters**:
- `_name`: "Hometown Citizen NFT"
- `_symbol`: "CITIZEN"
- `_semaphore`: Semaphore contract address
- `_citizenRegistry`: Address from Step 1
- `_citizenGroupId`: Get from CitizenRegistry.citizenGroupId()
- `_owner`: Admin address

**Using thirdweb**:
```bash
npx thirdweb deploy
```

Select `CitizenVerificationNFT.sol`

**Note the deployed address**: `CITIZEN_NFT_ADDRESS`

---

### Step 3: Deploy AnonymousGovernor

**Purpose**: Enables anonymous proposal creation and voting.

**Parameters**:
- `_semaphore`: Semaphore contract address
- `_citizenRegistry`: Address from Step 1
- `_citizenGroupId`: Get from CitizenRegistry.citizenGroupId()
- `_timelock`: TimelockController address (or `0x0` for none)
- `_votingDelay`: `86400` (1 day in seconds)
- `_votingPeriod`: `604800` (7 days in seconds)
- `_proposalThreshold`: `1` (minimum 1 citizen to propose)
- `_quorumPercentage`: `10` (10% of citizens must vote)
- `_supportThreshold`: `51` (51% support required to pass)
- `_owner`: Admin address

**Using thirdweb**:
```bash
npx thirdweb deploy
```

Select `AnonymousGovernor.sol`

**Note the deployed address**: `ANONYMOUS_GOVERNOR_ADDRESS`

---

## Post-Deployment Configuration

### Get Citizen Group ID

```javascript
// Call on CitizenRegistry
const groupId = await citizenRegistry.citizenGroupId();
console.log("Citizen Group ID:", groupId);
```

### Verify Semaphore Group

```javascript
// Check group was created
const root = await citizenRegistry.getGroupRoot();
const depth = await citizenRegistry.getGroupDepth();
console.log("Merkle Root:", root);
console.log("Tree Depth:", depth);
```

---

## Citizen Onboarding Flow

### Off-Chain Verification Process

**Step 1: Citizen Identity Verification (Off-Chain)**

Choose your verification method:

#### Option A: In-Person Verification
- Citizen visits town hall with government ID
- Admin verifies identity and residency
- Admin records verification in database

#### Option B: Video KYC (Recommended for Remote)
- Citizen submits application with documents
- Video call verification session
- Document verification (ID + utility bill/address proof)

#### Option C: Vouching System
- Existing verified citizens vouch for new members
- Requires N vouches (e.g., 3 citizens)
- Admin reviews and approves

### Step 2: Citizen Generates Semaphore Identity

**Frontend Implementation** (see Frontend Setup section):

```typescript
import { Identity } from "@semaphore-protocol/identity";

// Citizen generates identity locally (never leaves their device)
const identity = new Identity();

// Get identity commitment (public, shareable)
const commitment = identity.commitment.toString();

// Store identity securely in browser (encrypted)
localStorage.setItem("semaphore-identity", identity.toString());

// Share commitment with admin for registration
console.log("Identity Commitment:", commitment);
```

**Security**: The identity secret (nullifier + trapdoor) NEVER leaves the citizen's device.

### Step 3: Admin Adds Citizen to Registry

**Single Citizen**:
```javascript
await citizenRegistry.addCitizen(
  identityCommitment,  // From Step 2
  citizenAddress       // Optional: for tracking
);
```

**Batch Registration** (Gas Efficient):
```javascript
const commitments = [commitment1, commitment2, commitment3];
await citizenRegistry.addCitizensBatch(commitments);
```

### Step 4: Citizen Mints NFT (Optional)

If using CitizenVerificationNFT, citizen can mint anonymously:

```typescript
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

// Get group data
const group = new Group(citizenGroupId, treeDepth);
// ... add members from contract

// Generate proof
const proof = await generateProof(identity, group, message, scope);

// Mint NFT anonymously
await citizenNFT.mintWithProof(
  proof.merkleTreeDepth,
  proof.merkleTreeRoot,
  proof.nullifier,
  proof.message,
  proof.merkleTreeSiblings,
  proof.points
);
```

---

## Governance Usage

### Creating Anonymous Proposals

```typescript
import { generateProof } from "@semaphore-protocol/proof";

// 1. Prepare proposal
const targets = [targetContract];
const values = [0];
const calldatas = [encodedFunctionCall];
const description = "Proposal: Build new community center";

// 2. Generate Semaphore proof
const message = hashMessage(description); // Hash of proposal
const proof = await generateProof(identity, group, message, citizenGroupId);

// 3. Submit proposal anonymously
await anonymousGovernor.proposeAnonymous(
  targets,
  values,
  calldatas,
  description,
  proof.merkleTreeDepth,
  proof.merkleTreeRoot,
  proof.nullifier,
  proof.message,
  proof.merkleTreeSiblings,
  proof.points
);
```

**Result**: Proposal is created, but no one knows which citizen created it!

### Casting Anonymous Votes

```typescript
// 1. Get proposal ID
const proposalId = await anonymousGovernor.hashProposal(
  targets, values, calldatas, descriptionHash
);

// 2. Choose vote: 0=Against, 1=For, 2=Abstain
const support = 1; // For

// 3. Generate vote-specific message
const proposalNullifier = await anonymousGovernor.proposalNullifiers(proposalId);
const message = hashVote(proposalId, support, proposalNullifier);

// 4. Generate proof
const proof = await generateProof(identity, group, message, citizenGroupId);

// 5. Cast vote anonymously
await anonymousGovernor.castVoteAnonymous(
  proposalId,
  support,
  "I support this proposal", // Optional reason
  proof.merkleTreeDepth,
  proof.merkleTreeRoot,
  proof.nullifier,
  proof.message,
  proof.merkleTreeSiblings,
  proof.points
);
```

**Result**: Vote is counted, but no one knows who voted or how!

---

## Frontend Setup

### Install Dependencies

```bash
cd dao-app
npm install @semaphore-protocol/identity @semaphore-protocol/group @semaphore-protocol/proof
```

### Key Frontend Components Needed

1. **Identity Generation Page** (`/generate-identity`)
   - Generate Semaphore identity
   - Display commitment for admin registration
   - Securely store identity in browser

2. **Admin Verification Portal** (`/admin/verify-citizens`)
   - Review citizen applications
   - Add commitments to CitizenRegistry
   - Batch registration interface

3. **Anonymous Proposal Creation** (`/governance/propose`)
   - Proposal form
   - Proof generation
   - Submit to AnonymousGovernor

4. **Anonymous Voting Interface** (`/governance/vote/[id]`)
   - View proposal details
   - Generate vote proof
   - Cast anonymous vote

---

## Security Considerations

### Identity Storage

**DO**:
- Store identity encrypted in browser localStorage
- Use secure key derivation (password-based)
- Backup identity securely (encrypted export)

**DON'T**:
- Store identity on server
- Share identity secret with anyone
- Transmit identity over insecure channels

### Off-Chain Verification

**Best Practices**:
- Multi-factor verification (ID + address proof)
- Video verification for remote citizens
- Periodic re-verification (annual)
- Fraud detection mechanisms

### Smart Contract Security

**Auditing**:
- Semaphore v4 is audited by PSE team
- Review custom contracts before mainnet
- Test on testnet extensively

**Access Control**:
- Only admin can add/remove citizens
- Use multi-sig for admin role (recommended)
- Implement emergency pause mechanisms

---

## Testing on Testnet

### 1. Deploy to Base Sepolia

```bash
# Set environment variables
export PRIVATE_KEY="your_private_key"
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

# Deploy contracts
npx thirdweb deploy --network base-sepolia
```

### 2. Test Citizen Registration

```javascript
// Test adding citizen
const testCommitment = "123456789..."; // Example commitment
await citizenRegistry.addCitizen(testCommitment, testAddress);

// Verify
const isCitizen = await citizenRegistry.isCitizen(testCommitment);
console.log("Is Citizen:", isCitizen); // Should be true
```

### 3. Test Anonymous Voting

Use the frontend to:
1. Generate test identity
2. Register as citizen (admin)
3. Create proposal
4. Cast vote anonymously
5. Verify vote was counted

---

## Gas Costs Estimation

| Operation | Estimated Gas | Cost (@ 0.5 gwei) |
|-----------|--------------|-------------------|
| Deploy CitizenRegistry | ~2M | $0.50 |
| Add Single Citizen | ~200k | $0.05 |
| Add 10 Citizens (Batch) | ~800k | $0.20 |
| Deploy AnonymousGovernor | ~3M | $0.75 |
| Create Proposal | ~500k | $0.12 |
| Cast Vote | ~400k | $0.10 |

**Note**: ZK proof verification is more expensive than regular voting (~2x gas).

---

## Troubleshooting

### "Invalid Proof" Error

**Causes**:
- Wrong group ID
- Outdated merkle tree root
- Invalid identity commitment
- Incorrect message hash

**Solution**:
```javascript
// Always fetch latest group data before generating proof
const groupData = await fetchGroupData(citizenGroupId);
const group = new Group(citizenGroupId, treeDepth, groupData.members);
```

### "Already Voted" Error

**Cause**: Nullifier was already used for this proposal

**Solution**: Each citizen can only vote once per proposal (by design)

### "Not Active" Error

**Cause**: Voting period hasn't started or has ended

**Check**:
```javascript
const state = await anonymousGovernor.state(proposalId);
// 0=Pending, 1=Active, 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed
```

---

## Advanced Features

### Removing Citizens

```javascript
// Get merkle proof for the commitment
const proof = await generateMerkleProof(identityCommitment, groupId);

// Remove citizen
await citizenRegistry.removeCitizen(
  identityCommitment,
  proof.siblings
);
```

### Updating Governance Parameters

```javascript
// Update quorum (only owner)
await anonymousGovernor.updateQuorum(15); // 15%

// Update support threshold
await anonymousGovernor.updateSupportThreshold(60); // 60%
```

### Querying Vote Results

```javascript
const [forVotes, againstVotes, abstainVotes] =
  await anonymousGovernor.proposalVoteCounts(proposalId);

console.log(`For: ${forVotes}, Against: ${againstVotes}, Abstain: ${abstainVotes}`);
```

---

## Next Steps

1. ✅ Deploy contracts to testnet
2. ✅ Build frontend verification portal
3. ✅ Test citizen onboarding flow
4. ✅ Test anonymous proposal creation
5. ✅ Test anonymous voting
6. ✅ Audit contracts (if mainnet)
7. ✅ Deploy to mainnet
8. ✅ Launch citizen registration campaign

---

## Resources

- **Semaphore Documentation**: https://docs.semaphore.pse.dev/
- **Semaphore GitHub**: https://github.com/semaphore-protocol/semaphore
- **OpenZeppelin Governor**: https://docs.openzeppelin.com/contracts/4.x/governance
- **thirdweb Deploy**: https://portal.thirdweb.com/deploy

---

## Support

For issues or questions:
- Semaphore Discord: https://discord.gg/6mSdGHnstH
- OpenZeppelin Forum: https://forum.openzeppelin.com/
- GitHub Issues: [Your Repository]

---

**Built with:**
- Semaphore v4.14.0
- OpenZeppelin Contracts v4.9.6
- thirdweb SDK v3.8.0
