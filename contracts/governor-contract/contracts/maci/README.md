# MACI Integration Contracts

This directory contains the smart contracts for integrating **MACI (Minimal Anti-Collusion Infrastructure)** with Hometown DAO's governance system.

## Contract Overview

### Core Integration Contracts

1. **NFTVotesChecker.sol** - SignUpGatekeeper implementation
   - Validates HomeTownVotingNFT ownership before allowing signup
   - Prevents duplicate registrations per poll
   - Compatible with soulbound NFTs

2. **NFTVoiceCreditsProxy.sol** - InitialVoiceCreditProxy implementation
   - Allocates voice credits based on NFT ownership
   - Default: 1 NFT = 1 voice credit = 1 vote (non-quadratic)
   - Configurable credits per NFT

### Interface Contracts

Located in `interfaces/`:

- **IMACI.sol** - Core MACI contract interface
- **IPoll.sol** - MACI Poll contract interface
- **ITally.sol** - Vote tally contract interface
- **ISignUpGatekeeper.sol** - Base gatekeeper interface
- **IInitialVoiceCreditProxy.sol** - Voice credits interface

## Architecture

```
Proposal Creation
       ↓
HomeTownMaciGovernor.propose()
       ↓
Deploys NFTVotesChecker (per poll)
       ↓
Deploys NFTVoiceCreditsProxy (per poll)
       ↓
Deploys MACI Poll
       ↓
Voting (encrypted)
       ↓
Coordinator tallies with ZK proofs
       ↓
Execution if passed
```

## How It Works

### 1. Proposal Creation

When a proposal is created:
- Governor validates proposer owns ≥ threshold NFTs
- Deploys dedicated gatekeeper for this poll
- Deploys voice credits proxy
- Calls MACI to deploy a new Poll
- Links poll to proposal

### 2. Voter Signup

When a voter wants to participate:
```solidity
poll.signUp(maciPubKey, gatekeeperData, voiceCreditsData)
```

Poll calls:
```solidity
NFTVotesChecker.register(voter, data)
```

NFTVotesChecker validates:
- Voter has not already registered
- Voter owns at least 1 HomeTownVotingNFT
- If valid, marks as registered

Poll then calls:
```solidity
NFTVoiceCreditsProxy.getVoiceCredits(voter, data)
```

Returns: `NFT balance * creditsPerNFT` (typically 1 * 1 = 1)

### 3. Voting

Voters encrypt their vote and publish message:
```solidity
poll.publishMessage(encryptedMessage, pubKey)
```

- Message contains vote option and weight
- Encrypted with coordinator's public key
- Voter can publish new message to change vote

### 4. Tallying

After poll ends, coordinator:
1. Downloads all messages
2. Decrypts with private key
3. Processes votes (last vote per user counts)
4. Generates ZK-SNARK proof
5. Submits tally + proof to chain

### 5. Execution

Governor checks:
```solidity
ITally.isTallied() == true
ITally.results(voteOption) // Get counts
```

Validates quorum and support, then executes.

## Security Model

### NFTVotesChecker Security

**Protections:**
- ✅ Only MACI Poll can call `register()`
- ✅ Snapshot block prevents flash loan attacks
- ✅ Each address can only register once per poll
- ✅ Validates actual NFT ownership

**Trust Assumptions:**
- Trusts HomeTownVotingNFT contract is legitimate
- Trusts owner to set correct MACI instance

### NFTVoiceCreditsProxy Security

**Protections:**
- ✅ Immutable NFT token address
- ✅ Read-only function (no state changes)
- ✅ Simple calculation (no complex logic)

**Trust Assumptions:**
- Trusts HomeTownVotingNFT.balanceOf() is accurate

### Combined with Soulbound NFTs

Your soulbound implementation prevents:
- NFT transfers (cannot lend voting power)
- Multiple NFTs per address (one citizen = one vote)
- NFT-based vote buying attacks

## Gas Costs

Approximate costs on Base:

| Operation | Gas | Notes |
|-----------|-----|-------|
| Deploy NFTVotesChecker | ~300k | Once per proposal |
| Deploy NFTVoiceCreditsProxy | ~250k | Once per proposal |
| Voter signup | ~200k | Once per poll per voter |
| Publish message (vote) | ~150k | Per vote/change |

**Total per proposal:** ~550k + (voters * 350k)

## Configuration

### NFTVotesChecker Constructor

```solidity
constructor(
    address _nftToken,      // HomeTownVotingNFT address
    uint256 _snapshotBlock  // Block for balance checking
)
```

### NFTVoiceCreditsProxy Constructor

```solidity
constructor(
    address _nftToken,       // HomeTownVotingNFT address
    uint256 _creditsPerNFT   // Usually 1 for 1-to-1 voting
)
```

## Testing

### Test NFTVotesChecker

```solidity
// Setup
HomeTownVotingNFT nft = new HomeTownVotingNFT();
nft.safeMint(voter1);
NFTVotesChecker checker = new NFTVotesChecker(address(nft), block.number - 1);
checker.setMaciInstance(address(mockPoll));

// Test registration
vm.prank(address(mockPoll));
checker.register(voter1, bytes(""));
assertEq(checker.isRegistered(voter1), true);

// Test duplicate prevention
vm.expectRevert(NFTVotesChecker.AlreadyRegistered.selector);
checker.register(voter1, bytes(""));

// Test non-owner rejection
vm.expectRevert(NFTVotesChecker.NoNFTOwnership.selector);
checker.register(nonOwner, bytes(""));
```

### Test NFTVoiceCreditsProxy

```solidity
// Setup
HomeTownVotingNFT nft = new HomeTownVotingNFT();
nft.safeMint(voter1);
NFTVoiceCreditsProxy proxy = new NFTVoiceCreditsProxy(address(nft), 1);

// Test credit allocation
uint256 credits = proxy.getVoiceCredits(voter1, bytes(""));
assertEq(credits, 1); // 1 NFT * 1 credit = 1

// Test non-owner gets 0
credits = proxy.getVoiceCredits(nonOwner, bytes(""));
assertEq(credits, 0);
```

## Deployment Checklist

Before deploying HomeTownMaciGovernor:

- [ ] MACI infrastructure deployed on target chain
- [ ] Coordinator keypair generated and secured
- [ ] HomeTownVotingNFT deployed and tested
- [ ] Circuit parameters configured for DAO size
- [ ] ZK circuits compiled and zKeys generated
- [ ] Verifier contracts deployed
- [ ] Test on testnet with small group first

## Integration with HomeTownMaciGovernor

The governor automatically deploys these contracts when a proposal is created:

```solidity
function propose(...) external returns (uint256) {
    // Deploy gatekeeper
    NFTVotesChecker gatekeeper = new NFTVotesChecker(
        address(votingNFT),
        block.number - 1
    );

    // Deploy voice credits proxy
    NFTVoiceCreditsProxy proxy = new NFTVoiceCreditsProxy(
        address(votingNFT),
        1  // 1 credit per NFT
    );

    // Deploy poll with these contracts
    address poll = _deployPoll(gatekeeper, proxy);

    // Set MACI instance
    gatekeeper.setMaciInstance(poll);

    // Store in proposal
    ...
}
```

## References

- **MACI Documentation**: https://maci.pse.dev/
- **Aragon MACI Plugin**: https://github.com/privacy-scaling-explorations/maci-voting-plugin-aragon
- **MACI Gatekeepers**: https://maci.pse.dev/docs/developers-references/smart-contracts/Gatekeepers
- **Parent Documentation**: `../MACI_INTEGRATION.md`

## Support

For issues or questions:
1. Check `MACI_INTEGRATION.md` for full setup guide
2. Review `MACI_QUICK_START.md` for common tasks
3. Consult MACI official documentation
4. Open issue in repository

---

**Part of Hometown DAO's private voting system** 🔐
