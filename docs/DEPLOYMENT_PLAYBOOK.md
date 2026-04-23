# Roebel DAO - Full Deployment Playbook

Complete reference for deploying the Attester/Citizen/Governor contract stack from scratch on Base Mainnet.

## Contract Files

| Contract | Source File | Solidity |
|----------|-----------|----------|
| AttesterNFT | `governor-contract/contracts/verification-system/AttesterNFT.sol` | ^0.8.20 |
| CitizenNFT | `governor-contract/contracts/verification-system/CitizenNFT.sol` | ^0.8.0 |
| AttesterGovernor | `governor-contract/contracts/AttesterGovernor.sol` | ^0.8.20 |

## Dependency Chain

```
AttesterNFT (no dependencies)
     ↓
CitizenNFT (requires AttesterNFT address)
     ↓
AttesterGovernor (requires AttesterNFT + CitizenNFT addresses)
```

## Step 1: Compile

```bash
cd governor-contract
npx hardhat clean && npx hardhat compile
```

- Solidity 0.8.23, optimizer enabled (200 runs)
- zksolc 1.4.1 (for zkSync compatibility)
- Artifacts output: `./artifacts-zk`

## Step 2: Deploy AttesterNFT

```bash
npx thirdweb deploy -k YOUR_THIRDWEB_SECRET_KEY
```

Select `AttesterNFT` when prompted.

### Constructor Parameters

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `initialOwner` | `address` | Deployer/admin wallet | `0xYourWallet` |
| `name` | `string` | NFT collection name | `"Roebel Attester"` |
| `symbol` | `string` | NFT symbol | `"ROEBEL-ATTESTER"` |
| `foundingAttesters` | `address[3]` | 3 founding attester wallets | Must be 3 unique addresses |

### What Happens
- 3 Attester NFTs auto-minted to founding members (token IDs 1-3)
- System is immediately operational
- Emergency mint is permanently disabled

## Step 3: Deploy CitizenNFT

Run `npx thirdweb deploy -k YOUR_KEY` again, select `CitizenNFT`.

### Constructor Parameters

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `_attesterNFT` | `address` | AttesterNFT address from Step 2 | `0x...` |
| `initialOwner` | `address` | Deployer/admin wallet | `0xYourWallet` |
| `foundingCitizens` | `address[3]` | 3 founding citizen wallets | Can overlap with attesters |

### What Happens
- 3 Citizen NFTs auto-minted to founding citizens (token IDs 1-3)
- Voting power auto-delegated to self on mint
- ERC721Votes + EIP712 enabled for governance

## Step 4: Deploy AttesterGovernor

Run `npx thirdweb deploy -k YOUR_KEY` again, select `AttesterGovernor`.

### Constructor Parameters

| Param | Type | Description | Value |
|-------|------|-------------|-------|
| `_attesterNFT` | `IAttesterNFT` | AttesterNFT address | From Step 2 |
| `_citizenNFT` | `IVotes` | CitizenNFT address | From Step 3 |
| `_timelock` | `TimelockController` | Timelock address | `0x0000000000000000000000000000000000000000` (no timelock) |
| `_initialVotingDelay` | `uint48` | Blocks before voting starts | `7200` (~4 hours on Base @ 2s blocks) |
| `_initialVotingPeriod` | `uint32` | Blocks voting is open | `50400` (~7 days on Base @ 2s blocks) |
| `_quorumNumeratorValue` | `uint256` | % of citizens needed | `10` (10% quorum) |

### Previous Deployment Used
- Voting delay: 7200 (1 day delay noted in comments, but ~4h at 2s blocks)
- Voting period: 50400 (~7 days)
- Quorum: 10%
- Timelock: none (0x0)

## Step 5: Update Frontend

### File 1: `dao-app/src/lib/verification-contracts.ts` (lines 12-14)

```typescript
export const VERIFICATION_CONTRACTS = {
  attesterNFT: "0xNEW_ATTESTER_NFT_ADDRESS",
  citizenNFT: "0xNEW_CITIZEN_NFT_ADDRESS",
  governor: "0xNEW_GOVERNOR_ADDRESS",
};
```

### File 2: `dao-app/src/lib/contracts.ts` (lines 10-11)

```typescript
export const CITIZEN_NFT_ADDRESS = "0xNEW_CITIZEN_NFT_ADDRESS";
export const ATTESTER_GOVERNOR_ADDRESS = "0xNEW_GOVERNOR_ADDRESS";
```

## Previous Deployment Addresses (for reference)

| Contract | Address | Chain |
|----------|---------|-------|
| AttesterNFT | `0x9b6cc0f9BC74E0a64f662028C4CF52e00bD35D4f` | Base Mainnet |
| CitizenNFT v3 | `0x78C88B01664Df4AA2F026DA68e834B4f33a3d751` | Base Mainnet |
| AttesterGovernor | `0x572c97329ACaCBeBA74e28E3998674E9058A095a` | Base Mainnet |
| Old NFT (deprecated) | `0x976966e2669b3bF3c99B38cA4259a864f85191A1` | Base Mainnet |
| Old Governor (deprecated) | `0x767f7b996E54248F88944DAc344Ab74e93E21cdB` | Base Mainnet |

## Governance Rules

| Rule | Value |
|------|-------|
| New Attester approval | 2 existing Attesters must sign |
| New Citizen approval | 1 Attester + 1 Citizen (2 different people) |
| Who can propose | Attesters only |
| Who can vote | Citizens only (1 NFT = 1 vote) |
| Voting activation | Must delegate (auto-delegated on mint) |
| Quorum | 10% of delegated Citizens |
| Citizen revocation | 1 Attester must approve |
| Attester revocation | 2 Attesters must approve |
| Transferability | Soulbound (non-transferable) |
| Max per wallet | 1 NFT each |

## OpenZeppelin Dependencies

- `@openzeppelin/contracts` v4.9.6
- `@thirdweb-dev/contracts` v3.8.0
- Hardhat with zksolc compiler

## Hardhat Config

- Solidity: 0.8.23
- Optimizer: enabled, 200 runs
- zksolc: 1.4.1
- Artifacts: `./artifacts-zk`
- Cache: `./cache-zk`

## Quick Checklist

- [ ] Decide on 3 founding Attester wallet addresses
- [ ] Decide on 3 founding Citizen wallet addresses
- [ ] Get thirdweb secret key
- [ ] Compile contracts
- [ ] Deploy AttesterNFT → note address
- [ ] Deploy CitizenNFT with AttesterNFT address → note address
- [ ] Deploy AttesterGovernor with both addresses → note address
- [ ] Update `dao-app/src/lib/verification-contracts.ts`
- [ ] Update `dao-app/src/lib/contracts.ts`
- [ ] Test frontend connects to new contracts
