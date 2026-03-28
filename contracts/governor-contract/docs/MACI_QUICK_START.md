# MACI Quick Start Guide

## 🚀 TL;DR

This adds **private voting** to your Hometown DAO using MACI (Minimal Anti-Collusion Infrastructure).

**What you get:**
- ✅ Encrypted votes (no one sees how you voted)
- ✅ Anti-bribery (can change vote anytime)
- ✅ ZK-proven results (verifiable but private)
- ✅ Soulbound NFT gating (existing model maintained)

## Prerequisites Checklist

Before deploying, you need:

- [ ] MACI contracts deployed on your chain (Base/Sepolia)
- [ ] Coordinator service running (Node.js + private key)
- [ ] ZK circuits compiled (2-6 hours, one-time)
- [ ] HomeTownVotingNFT deployed
- [ ] ~2-5 ETH for deployment gas

## Deployment (30 Minutes)

### Step 1: Deploy MACI Infrastructure

```bash
# Clone and setup MACI
git clone https://github.com/privacy-scaling-explorations/maci.git
cd maci && pnpm install

# Configure for your DAO size (edit circuits/circuits.json)
# For 100 voters: STATE_TREE_DEPTH = 7

# Compile circuits (long!)
pnpm build-circuits && pnpm setup:zkeys

# Deploy MACI to Base Sepolia
# (Follow MACI deployment guide)
```

**Note addresses:**
- MACI: `0x...`
- Verifier: `0x...`
- VkRegistry: `0x...`

### Step 2: Generate Coordinator Keypair

```bash
pnpm maci-cli genMaciKeypair

# Output:
# Private key: macisk.xxx (KEEP SECRET!)
# Public key: macipk.xxx (use in deployment)
```

⚠️ **Save private key securely** - Don't lose it or share it!

### Step 3: Deploy HomeTownMaciGovernor

```bash
cd governor-contract
npx thirdweb deploy
```

**Parameters:**
```
_maci: <MACI_ADDRESS>
_votingNFT: <HOMETOWNVOTINGNFT_ADDRESS>
_timelock: 0x0 (or timelock address)
_coordinatorPubKey: {
    x: <COORDINATOR_PUBKEY_X>,
    y: <COORDINATOR_PUBKEY_Y>
}
_settings: {
    votingDelay: 86400,      // 1 day
    votingPeriod: 604800,    // 7 days
    proposalThreshold: 1,    // 1 NFT
    quorumNumerator: 10,     // 10%
    supportThreshold: 51     // 51%
}
```

**Done!** Your DAO now supports private voting.

## Creating Your First Proposal (5 Minutes)

```solidity
// 1. Prepare action
Action memory action = Action({
    target: 0xTreasuryAddress,
    value: 1 ether,
    data: "" // or encoded function call
});

Action[] memory actions = new Action[](1);
actions[0] = action;

// 2. Create proposal
uint256 proposalId = governor.propose(
    "Fund town library with 1 ETH",
    actions
);

// 3. Note the pollAddress from event
```

**What happened:**
- MACI Poll deployed ✅
- Voting starts in 1 day ⏰
- NFT holders can sign up 👥

## Voting (10 Minutes)

### Step 1: Generate MACI Keypair (First Time)

```javascript
// In frontend
import { Keypair } from 'maci-domainobjs';

const keypair = new Keypair();
localStorage.setItem('maci_privkey', keypair.privKey.serialize());
```

### Step 2: Sign Up to Vote

```solidity
// Get poll from proposal
address pollAddr = governor.proposals(proposalId).pollAddress;
IPoll poll = IPoll(pollAddr);

// Sign up with your public key
poll.signUp(
    {x: pubKeyX, y: pubKeyY},
    bytes(""),
    bytes("")
);
```

### Step 3: Cast Encrypted Vote

```javascript
// 0 = For, 1 = Against, 2 = Abstain
const voteOption = 0;

// Encrypt and sign vote
const message = createMessage(voteOption, keypair, coordinatorPubKey);

// Submit
await poll.publishMessage(message, ephemeralPubKey);
```

**Done!** Your vote is encrypted on-chain. You can change it anytime.

## Tallying (30 Minutes)

After voting ends, **coordinator** runs:

```bash
# 1. Merge messages
pnpm maci-cli mergeMessages --poll <POLL_ID>

# 2. Generate proofs (takes 10-30 mins)
pnpm maci-cli genProofs \
    --poll-id <POLL_ID> \
    --coordinator-privkey <PRIVKEY>

# 3. Submit tally
pnpm maci-cli tally \
    --poll-id <POLL_ID> \
    --tally-file ./proofs/tally.json \
    --proof ./proofs/proof.json
```

**Results are now public and verifiable!**

## Execution (2 Minutes)

```solidity
// Check if can execute
bool ready = governor.canExecute(proposalId);

// Execute!
governor.execute(proposalId);
```

**Proposal executed!** Actions are run.

## Complete Flow Summary

```
Day 0: Create Proposal
       ↓
Day 1: Voting Starts (signup + vote)
       ↓
Day 8: Voting Ends
       ↓
Day 8: Coordinator Tallies (30 mins)
       ↓
Day 8: Execute Proposal
```

## Key Differences vs Standard Governor

| Feature | Standard Governor | MACI Governor |
|---------|------------------|---------------|
| Vote Privacy | ❌ Public | ✅ Private |
| Vote Buying | ⚠️ Possible | ✅ Prevented |
| Coordinator | ❌ Not needed | ✅ Required |
| Gas Costs | Lower | Higher (~2x) |
| Setup Complexity | Easy | Moderate |
| Verifiability | ✅ Yes | ✅ Yes (ZK proofs) |

## Common Commands

```bash
# Check proposal status
cast call $GOVERNOR "getProposal(uint256)" $PROPOSAL_ID

# Check if can execute
cast call $GOVERNOR "canExecute(uint256)" $PROPOSAL_ID

# Get vote results (after tally)
cast call $TALLY "results(uint256)" 0  # For
cast call $TALLY "results(uint256)" 1  # Against
cast call $TALLY "results(uint256)" 2  # Abstain

# Check tally complete
cast call $TALLY "isTallied()"
```

## Troubleshooting

**"NoNFTOwnership" error**
→ User doesn't own HomeTownVotingNFT

**"AlreadyRegistered" error**
→ Already signed up to this poll

**"TallyNotComplete" error**
→ Coordinator hasn't submitted tally yet

**Proof generation fails**
→ Need more RAM (try 16GB+) or smaller circuit parameters

## Important Notes

⚠️ **Coordinator Trust**: Coordinator can see individual votes but cannot fake results

⚠️ **Circuit Limits**: Max voters/messages set at deployment - cannot increase later

⚠️ **Gas Costs**: MACI operations cost ~2-3x more than standard voting

⚠️ **User Education**: Community needs to understand MACI keypairs

## Next Steps

1. **Test on Sepolia** - Run through full flow
2. **Build Frontend** - Make it easy for users
3. **Document for Users** - Explain private voting benefits
4. **Security Audit** - Before mainnet launch
5. **Monitor Closely** - Watch first few proposals

## Need Help?

- Read full guide: `MACI_INTEGRATION.md`
- MACI docs: https://maci.pse.dev/
- MACI Discord: (join for coordinator support)
- Check examples: Aragon MACI plugin

---

**Your DAO now has private voting!** 🎉🔐
