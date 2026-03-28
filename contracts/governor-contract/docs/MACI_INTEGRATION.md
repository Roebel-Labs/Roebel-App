# MACI Integration for Hometown DAO

## Overview

This implementation integrates **MACI (Minimal Anti-Collusion Infrastructure)** with your HomeTown DAO to enable **private, collusion-resistant voting** while maintaining your soulbound NFT-based membership model.

## Architecture

```
HomeTownVotingNFT (Soulbound NFT)
       ↓
NFTVotesChecker (MACI Gatekeeper)
       ↓
MACI Poll (Encrypted Voting)
       ↓
Coordinator (Off-chain Tallying + ZK Proofs)
       ↓
HomeTownMaciGovernor (Execution)
```

## Contracts Created

### Core Contracts

1. **HomeTownMaciGovernor.sol** - Main governance contract
   - Creates proposals
   - Deploys MACI polls
   - Verifies tallies
   - Executes passed proposals

2. **NFTVotesChecker.sol** - Signup gatekeeper
   - Validates HomeTownVotingNFT ownership
   - Prevents duplicate signups
   - Works with soulbound NFTs

3. **NFTVoiceCreditsProxy.sol** - Voice credits allocator
   - Assigns 1 voice credit per NFT
   - Enables 1 NFT = 1 vote model

### Interface Contracts

Located in `contracts/maci/interfaces/`:
- `IMACI.sol` - MACI core interface
- `IPoll.sol` - Poll contract interface
- `ITally.sol` - Tally contract interface
- `ISignUpGatekeeper.sol` - Gatekeeper interface
- `IInitialVoiceCreditProxy.sol` - Voice credits interface

## Prerequisites

Before deploying, you need:

### 1. MACI Infrastructure (Deploy First!)

You must deploy the full MACI stack on your target chain (Base, Base Sepolia, etc.):

**Required MACI Contracts:**
- MACI.sol (core registry)
- PollFactory.sol
- MessageProcessorFactory.sol
- TallyFactory.sol
- Verifier contracts (for ZK proofs)
- VkRegistry (verification keys)

**How to Deploy MACI:**

```bash
# Clone MACI repository
git clone https://github.com/privacy-scaling-explorations/maci.git
cd maci

# Install dependencies
pnpm install

# Configure circuits (edit circuits/circuits.json)
# Set parameters for your DAO size:
{
  "STATE_TREE_DEPTH": 7,        // 2^7 = 128 voters max
  "MESSAGE_TREE_DEPTH": 7,      // 2^7 = 128 messages max
  "VOTE_OPTIONS_TREE_DEPTH": 2  // 2^2 = 4 vote options
}

# Compile circuits (takes 2-6 hours!)
pnpm build-circuits

# Generate zKeys (proving/verification keys)
pnpm setup:zkeys

# Deploy MACI contracts to your chain
# Follow MACI deployment guide: https://maci.pse.dev/docs/deployment
```

**Important Notes:**
- Circuit parameters are **immutable after deployment**
- Choose STATE_TREE_DEPTH based on max expected voters
- Larger trees = longer proving time and more memory needed

### 2. Coordinator Setup

The coordinator is a **trusted service** that tallies votes off-chain and generates ZK proofs.

**Coordinator Responsibilities:**
- Generate and secure keypair
- Download encrypted messages from blockchain
- Decrypt and process votes
- Generate ZK-SNARK proofs of correct tallying
- Submit proofs to Tally contract

**Setup Coordinator Service:**

```bash
# Option 1: Use official MACI coordinator
git clone https://github.com/privacy-scaling-explorations/maci-coordinator
cd maci-coordinator
pnpm install

# Generate coordinator keypair
pnpm generate-keypair
# Save private key securely (NEVER share or commit!)
# Public key will be used in governor deployment

# Option 2: Use MACI CLI
pnpm maci-cli genMaciKeypair
```

**Security Notes:**
⚠️ **Coordinator private key is CRITICAL**
- Store in secure key management system (AWS KMS, HashiCorp Vault, etc.)
- Never commit to git or share
- Compromise = coordinator can see all votes (but cannot fake results)
- Loss = cannot tally votes (poll becomes unusable)

## Deployment Steps

### Phase 1: Deploy MACI Infrastructure

1. **Deploy MACI contracts** (see Prerequisites above)
2. **Note contract addresses:**
   - MACI contract address
   - Verifier address
   - VkRegistry address

### Phase 2: Deploy Hometown DAO Contracts

1. **Deploy or use existing HomeTownVotingNFT:**

```bash
cd governor-contract
npx thirdweb deploy

# Or if already deployed, note the address
```

2. **Optional: Deploy TimelockController:**

```solidity
// Constructor parameters:
uint256 minDelay = 2 days;  // Minimum delay before execution
address[] proposers = [/* addresses that can propose */];
address[] executors = [/* addresses that can execute */];
address admin = /* your admin address */;

TimelockController timelock = new TimelockController(
    minDelay,
    proposers,
    executors,
    admin
);
```

3. **Deploy HomeTownMaciGovernor:**

```bash
npx thirdweb deploy
```

**Constructor Parameters:**
```solidity
_maci: 0x... // MACI contract address from Phase 1
_votingNFT: 0x... // HomeTownVotingNFT address
_timelock: 0x... // TimelockController address (or 0x0 for none)
_coordinatorPubKey: {
    x: 123..., // Coordinator public key X coordinate
    y: 456...  // Coordinator public key Y coordinate
}
_settings: {
    votingDelay: 86400,        // 1 day (in seconds)
    votingPeriod: 604800,      // 7 days (in seconds)
    proposalThreshold: 1,      // 1 NFT required to propose
    quorumNumerator: 10,       // 10% quorum
    supportThreshold: 51       // 51% support required
}
```

### Phase 3: Configuration

1. **Grant permissions (if using Timelock):**

```solidity
// Governor can propose to timelock
timelock.grantRole(PROPOSER_ROLE, address(governor));

// Governor can execute through timelock
timelock.grantRole(EXECUTOR_ROLE, address(governor));
```

2. **Fund governor for gas (if needed):**

```bash
# Send ETH to governor for executing proposals
cast send <GOVERNOR_ADDRESS> --value 1ether
```

## Usage Guide

### For Proposers

**1. Create a Proposal:**

```solidity
// Prepare actions to execute if passed
HomeTownMaciGovernor.Action[] memory actions;
actions[0] = HomeTownMaciGovernor.Action({
    target: 0x...,  // Contract to call
    value: 0,       // ETH to send
    data: abi.encodeWithSignature("functionName()")
});

// Create proposal
uint256 proposalId = governor.propose(
    "Proposal: Fund town library with 10 ETH",
    actions
);

// Note the proposalId and pollAddress from ProposalCreated event
```

**What Happens:**
- Governor validates you own ≥1 NFT
- Deploys NFTVotesChecker (gatekeeper)
- Deploys NFTVoiceCreditsProxy
- Deploys MACI Poll
- Links proposal to poll
- Emits ProposalCreated event

### For Voters

**1. Generate MACI Keypair (One-Time Setup):**

```javascript
// In your frontend (dao-app)
import { Keypair } from 'maci-domainobjs';

// Generate keypair (store securely!)
const maciKeypair = new Keypair();
const privKey = maciKeypair.privKey.serialize();
const pubKey = maciKeypair.pubKey.serialize();

// Save to encrypted local storage or wallet
localStorage.setItem('maci_privkey', privKey);
```

**2. Sign Up to Vote:**

```solidity
// Get poll address from proposal
address pollAddress = governor.proposals(proposalId).pollAddress;
IPoll poll = IPoll(pollAddress);

// Sign up with your MACI public key
poll.signUp(
    IMACI.PubKey(pubKeyX, pubKeyY),
    bytes(""), // gatekeeper data (empty for NFT check)
    bytes("")  // voice credit data (empty)
);
```

**What Happens:**
- Poll calls NFTVotesChecker.register()
- Checker validates you own HomeTownVotingNFT
- If valid, you're registered with 1 voice credit
- You can now vote

**3. Cast Your Vote:**

```javascript
// Create vote command
const command = {
    stateIndex: 1, // Your index in state tree (from signup)
    newPubKey: pubKey, // Your MACI public key
    voteOptionIndex: 0, // 0=For, 1=Against, 2=Abstain
    newVoteWeight: 1, // Spend 1 voice credit
    nonce: 1, // Increment for each vote change
    pollId: proposalId,
    salt: randomSalt
};

// Sign command with your MACI private key
const signature = command.sign(maciPrivKey);

// Encrypt command with coordinator's public key
const message = command.encrypt(
    signature,
    sharedKey // ECDH shared key with coordinator
);

// Submit encrypted vote on-chain
await poll.publishMessage(message, ephemeralPubKey);
```

**What Happens:**
- Your vote is encrypted before going on-chain
- No one can see how you voted (looks like gibberish)
- You can change your vote anytime before voting ends
- Last vote counts (enables anti-collusion)

**4. Change Your Vote (Optional):**

```javascript
// Simply publish a new message with incremented nonce
command.nonce = 2; // Next nonce
command.voteOptionIndex = 1; // Change to Against

// Sign, encrypt, and publish again
// Previous vote is invalidated
```

### For Coordinator

**1. Wait for Voting Period to End:**

```bash
# Check if voting ended
cast call <POLL_ADDRESS> "getDeployTimeAndDuration()"
```

**2. Merge Message Trees:**

```bash
# After poll ends, merge the message accumulator queue
# This prepares data for processing

pnpm maci-cli mergeMessages \
    --poll <POLL_ID> \
    --maci-address <MACI_ADDRESS>
```

**3. Process Messages and Generate Proofs:**

```bash
# Download and decrypt all messages
# Generate ZK proofs of correct processing

pnpm maci-cli genProofs \
    --poll-id <POLL_ID> \
    --coordinator-privkey <YOUR_PRIVKEY> \
    --maci-address <MACI_ADDRESS> \
    --output-dir ./proofs/
```

**This step:**
- Downloads all encrypted messages from blockchain
- Decrypts each message with coordinator private key
- Processes votes (last vote per user counts)
- Generates zk-SNARK proofs
- **May take 10 minutes to 2 hours depending on poll size**

**4. Submit Tally to Chain:**

```bash
# Submit tally commitment and proofs
pnpm maci-cli tally \
    --poll-id <POLL_ID> \
    --tally-file ./proofs/tally.json \
    --proof ./proofs/proof.json \
    --maci-address <MACI_ADDRESS>
```

**What Happens:**
- Tally contract receives vote counts
- Verifier contract checks ZK proof
- If valid, tally is accepted
- Proposal can now be executed

### For Executors

**1. Check if Proposal Can Execute:**

```solidity
bool canExecute = governor.canExecute(proposalId);
// Returns true if:
// - Voting period ended
// - Tally submitted and verified
// - Quorum met (≥10% participation)
// - Support met (≥51% voted For)
```

**2. Execute Proposal:**

```solidity
governor.execute(proposalId);
```

**What Happens:**
- Governor checks tally results
- Validates quorum and support thresholds
- Executes all actions in proposal
- Emits ProposalExecuted event

## Security Considerations

### Trust Model

**What Coordinator CAN Do:**
✅ See all votes (after decryption)
✅ Delay tallying (but cannot fake results)

**What Coordinator CANNOT Do:**
❌ Censor votes (all votes are on-chain)
❌ Fake votes (voter signatures prevent this)
❌ Change tally (ZK proof verification would fail)
❌ Hide votes (all messages publicly visible, just encrypted)

### Privacy Guarantees

**Vote Privacy:**
- Votes are encrypted with coordinator's public key
- Only coordinator can decrypt (using private key)
- Individual votes never revealed publicly
- Only aggregated tally is published

**Anti-Collusion:**
- Voters can change their vote anytime
- No way to prove final vote to briber
- Makes vote buying economically irrational

**Verifiability:**
- Anyone can verify ZK proofs
- Cannot fake tally without valid proof
- Blockchain provides audit trail

### Soulbound NFT Security

Your soulbound NFTs add an extra security layer:

✅ **Prevents NFT-based vote buying**
   - Cannot transfer NFTs
   - Cannot lend voting power

✅ **One person, one vote**
   - Each address can only receive one NFT
   - Enforced by `_hasCitizenNFT` mapping

✅ **Combined with MACI**
   - Two-layer anti-collusion
   - Layer 1: Soulbound (can't transfer vote)
   - Layer 2: MACI (can't prove vote)

## Monitoring & Analytics

### Track Proposal Status

```solidity
// Get proposal details
Proposal memory proposal = governor.getProposal(proposalId);

console.log("Poll Address:", proposal.pollAddress);
console.log("Start Time:", proposal.startTime);
console.log("End Time:", proposal.endTime);
console.log("Executed:", proposal.executed);
```

### Check Voting Progress

```solidity
IPoll poll = IPoll(proposal.pollAddress);
uint256 numSignups = poll.numSignUps();
console.log("Voters registered:", numSignups);
```

### View Results (After Tallying)

```solidity
ITally tally = ITally(proposal.tallyAddress);

if (tally.isTallied()) {
    uint256 votesFor = tally.results(0);
    uint256 votesAgainst = tally.results(1);
    uint256 votesAbstain = tally.results(2);

    console.log("For:", votesFor);
    console.log("Against:", votesAgainst);
    console.log("Abstain:", votesAbstain);
}
```

## Troubleshooting

### Common Issues

**1. "OnlyMACI" error during signup**
- Ensure gatekeeper.setMaciInstance() was called
- Check you're calling from correct poll address

**2. "NoNFTOwnership" error**
- Verify address owns HomeTownVotingNFT
- Check NFT hasn't been revoked

**3. "AlreadyRegistered" error**
- Each address can only signup once per poll
- Cannot signup again even if vote changed

**4. "TallyNotComplete" error**
- Coordinator hasn't submitted tally yet
- Wait for coordinator to finish processing

**5. ZK proof generation fails**
- Check circuit parameters match deployed circuits
- Ensure enough RAM (16GB+ recommended)
- Verify .ptau file downloaded correctly

## Gas Costs

Approximate gas costs on Base:

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| Create proposal | ~500k-1M | Deploys poll + helpers |
| Sign up to vote | ~200k | One-time per poll |
| Cast vote | ~150k | Each vote/change |
| Execute proposal | ~100k-500k | Depends on actions |

**Optimization Tips:**
- Batch signups if possible
- Use efficient action encoding
- Consider gasless transactions for voters

## Next Steps

1. **Deploy to Testnet (Base Sepolia)**
   - Test full flow with small group
   - Verify coordinator setup works
   - Practice vote tallying

2. **Educate Community**
   - Explain MACI benefits
   - Create voting tutorials
   - Run demo proposals

3. **Security Audit**
   - Before mainnet, consider professional audit
   - Focus on governor logic and permissions
   - Test coordinator security

4. **Frontend Integration**
   - Build UI for proposal creation
   - Add MACI keypair management
   - Create voting interface
   - Show real-time results

5. **Monitoring Setup**
   - Track proposal creation
   - Alert when tallying needed
   - Monitor execution success

## Resources

- **MACI Documentation**: https://maci.pse.dev/
- **MACI GitHub**: https://github.com/privacy-scaling-explorations/maci
- **Aragon MACI Plugin**: https://github.com/privacy-scaling-explorations/maci-voting-plugin-aragon
- **MACI Technical Report**: https://github.com/privacy-scaling-explorations/technical-reports/blob/main/reports/Applied_ZKP_Primitives/MACI/MACI.md

## Support

For questions or issues:
1. Review this documentation
2. Check MACI official docs
3. Open issue in this repository
4. Join MACI Discord/Telegram for coordinator help

---

**Built with privacy and security in mind for Hometown DAO** 🏛️🔐
