# HomeTown DAO - Governor Contracts

OpenZeppelin v4.9.6 compatible DAO contracts for thirdweb deployment.

## 🚀 Quick Start

```bash
# Compile contracts
npx hardhat compile

# Deploy via thirdweb
npx thirdweb deploy -k YOUR_SECRET_KEY
```

## 📄 Contracts

### HomeTownVotingNFT.sol
ERC721 NFT with built-in voting power for DAO governance.

**Features:**
- Each NFT = 1 vote
- Delegation support (must delegate to activate voting power)
- Owner can mint NFTs to community members

**Constructor Parameters:** None

### SimpleHomeTownGovernor.sol
Complete DAO governance contract using OpenZeppelin Governor.

**Constructor Parameters:**
1. `_token` (address): HomeTownVotingNFT contract address
2. `_timelock` (address): TimelockController address (use `0x0000000000000000000000000000000000000000` if no timelock)
3. `_initialVotingDelay` (uint256): `7200` (blocks before voting starts, ~1 day)
4. `_initialVotingPeriod` (uint256): `50400` (blocks for voting, ~7 days)
5. `_initialProposalThreshold` (uint256): `1` (minimum NFTs to create proposal)
6. `_quorumNumeratorValue` (uint256): `10` (quorum percentage, 10 = 10%)

## 📋 Deployment Steps

### 1. Deploy HomeTownVotingNFT

```bash
npx thirdweb deploy -k YOUR_SECRET_KEY
```

- Select `HomeTownVotingNFT`
- No constructor parameters needed
- **Save the deployed contract address!**

### 2. Deploy SimpleHomeTownGovernor

```bash
npx thirdweb deploy -k YOUR_SECRET_KEY
```

- Select `SimpleHomeTownGovernor`
- Enter parameters from thirdweb dashboard:
  - `_token`: Paste HomeTownVotingNFT address from step 1
  - `_timelock`: `0x0000000000000000000000000000000000000000`
  - `_initialVotingDelay`: `7200`
  - `_initialVotingPeriod`: `50400`
  - `_initialProposalThreshold`: `1`
  - `_quorumNumeratorValue`: `10`

## 🎯 After Deployment

### 1. Mint NFTs to Community Members

As the contract owner, call `safeMint(address to)` or `batchMint(address to, uint256 quantity)` on HomeTownVotingNFT.

### 2. Have Holders Delegate Votes

Each NFT holder must call `delegate(address delegatee)` to activate their voting power:
- `delegate(yourAddress)` - Delegate to yourself
- `delegate(someoneElse)` - Delegate to another address

**Important:** Votes don't count until delegated!

### 3. Create First Proposal

Any holder with ≥1 NFT can call `propose()` on the Governor contract with:
- `targets[]` - Contract addresses to call
- `values[]` - ETH amounts to send
- `calldatas[]` - Encoded function calls
- `description` - Proposal description

## 📚 Documentation

For complete documentation, see:
- `/dao-contract/HOMETOWN_DAO_DOCUMENTATION.md` - Full architecture guide
- `/dao-contract/SETUP_GUIDE.md` - Detailed setup instructions
- `/CLAUDE.md` - Project overview

---

Built with ❤️ using OpenZeppelin, Hardhat, and thirdweb
