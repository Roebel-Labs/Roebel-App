# Smart Account Voting Explanation

## What You're Seeing

### Before Smart Wallets (Regular EOA)
- **BaseScan showed**: Regular transactions
- **Transaction type**: Direct user → contract interaction
- **Visible as**: Normal transaction list on BaseScan

### After Smart Wallets (ERC-4337)
- **BaseScan shows**: Events only (no regular transactions)
- **Transaction type**: User → Bundler → EntryPoint → Governor contract
- **Visible as**: "Internal Transactions" and "User Operations" on Blockscout

## This is NORMAL and EXPECTED!

Smart account transactions work differently than regular wallet transactions:

```
Regular Wallet (EOA):
User Wallet → Governor Contract
└─> Shows as "Transaction" on BaseScan

Smart Account (ERC-4337):
User Smart Wallet → Bundler → Entry Point → Governor Contract
└─> Shows as "UserOperation" on Blockscout
└─> Shows as "Internal Transaction" on BaseScan
└─> Shows as "Event" on both explorers
```

## Why Votes Aren't Displaying

The issue is **NOT** that votes aren't being recorded. The issue is that the proposal was created on the **old Governor contract**, so when we query the **new Governor contract** for votes, it returns `undefined`.

### Proof Votes Are Working

From your console logs:
```javascript
✅ Vote submitted successfully
```

And you said:
> "events are happening on the smart contract"

This means:
1. ✅ Transaction succeeded
2. ✅ `VoteCast` event was emitted
3. ✅ Vote was recorded on the Governor contract

## The Real Problem

Your proposal exists on **old Governor**: `0xB81757b747D75089C589c057Ba41fc3D7D32f27e`
But frontend queries **new Governor**: `0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A`

### Debug Output Shows This
```javascript
🔍 Proposal State Debug: {
  blockchainState: undefined,  // ❌ Proposal not found on NEW contract
  supabaseState: 0,            // ✅ Proposal exists in Supabase
  effectiveState: 1,
}
```

The `blockchainState: undefined` confirms the proposal doesn't exist on the new Governor contract.

## How to Fix

### Option 1: Create New Proposal (RECOMMENDED)
1. Go to http://localhost:3003/proposals/create
2. Create the proposal again
3. It will be created on the **new Governor contract**
4. Votes will display correctly

### Option 2: Query Old Governor for This Proposal

Add logic to detect which Governor contract the proposal was created on:

```typescript
// In dao-app/src/app/proposals/[id]/page.tsx

// Get governor address from Supabase proposal data
const governorAddress = proposal?.governor_contract_address || ATTESTER_GOVERNOR_ADDRESS;

// Use the correct governor contract for this proposal
const proposalGovernorContract = getContract({
  client,
  address: governorAddress,
  chain: base,
});

// Then query using proposalGovernorContract instead of governorContract
const { data: proposalVotes } = useReadContract({
  contract: proposalGovernorContract, // ← Use proposal-specific contract
  method: "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  params: blockchainProposalId ? [BigInt(blockchainProposalId)] : [BigInt(0)],
  queryOptions: { enabled: !!blockchainProposalId },
});
```

## How to Verify Votes on Blockchain

### On Blockscout (Better for Smart Accounts)
1. Go to: https://base.blockscout.com/address/0xB81757b747D75089C589c057Ba41fc3D7D32f27e?tab=logs
2. Look for `VoteCast` events
3. You'll see your votes recorded

### On BaseScan
1. Go to: https://basescan.org/address/0xB81757b747D75089C589c057Ba41fc3D7D32f27e#events
2. Look for `VoteCast` events
3. Filter by event type

### Using Contract Read Function
Call `proposalVotes(proposalId)` on the **old Governor contract** directly:

```typescript
// In browser console or via contract call
const votes = await proposalVotes(blockchainProposalId);
// Will return: [againstVotes, forVotes, abstainVotes]
```

## Summary

**Your votes ARE being recorded!** The problem is:
1. ❌ You're querying the wrong contract (new vs old)
2. ✅ Smart account transactions are working correctly
3. ✅ Events are being emitted correctly

**Solution:**
Create new proposals on the new Governor contract (`0xE4D05E28a36030c7B5d50c48Bd0223E9fD3EaA0A`), or add logic to query the correct Governor contract based on where the proposal was created.

---

**Related Files:**
- [PROPOSAL_MIGRATION_ISSUE.md](PROPOSAL_MIGRATION_ISSUE.md)
- [CITIZEN_NFT_DEPLOYMENT_GUIDE.md](CITIZEN_NFT_DEPLOYMENT_GUIDE.md)

**Date:** 2025-11-10
