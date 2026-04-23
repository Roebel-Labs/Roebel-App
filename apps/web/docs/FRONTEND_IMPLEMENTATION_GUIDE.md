# Röbel/Müritz DAO - Frontend Implementation Guide

## ✅ What's Been Completed

### 1. Foundation Layer
- ✅ **Contract Addresses Updated** - All 3 contracts configured with Base Mainnet addresses
- ✅ **ABIs Added** - Complete ABIs for AttesterNFT, CitizenNFT, and AttesterGovernor
- ✅ **German Translations** - Comprehensive translation file (`src/lib/translations/de.ts`)
- ✅ **Custom Hook** - `useVerificationStatus()` for checking user's NFT status

### 2. Pages Created
- ✅ **Verification Dashboard** (`/verifizierung`) - Main entry point with status overview
- ✅ **Request Citizen NFT** (`/verifizierung/buerger-beantragen`) - Complete multi-step form

### 3. Design System
All pages follow your existing design patterns:
- Dark header with `bg-black`
- White cards with `border border-gray-200 rounded-xl`
- Consistent spacing (`gap-6`, `mb-8`, `p-6`)
- Primary buttons: `bg-black hover:bg-gray-800`
- Status badges with color-coded states
- German language throughout

---

## 📋 Remaining Pages to Build

Follow the patterns from the completed pages. Copy structure from similar pages:

### Priority 1: Request Pages

#### A. Request Attester NFT (`/verifizierung/bescheiniger-beantragen/page.tsx`)
**Copy from:** `/verifizierung/buerger-beantragen/page.tsx`

**Changes needed:**
1. Check `isAttester` instead of `isCitizen`
2. Update text to "Bescheiniger" throughout
3. Add warning card:
```tsx
<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
  <h4 className="font-medium text-yellow-900 mb-2">
    {de.verification.attesterRoleWarning}
  </h4>
  <p className="text-sm text-yellow-800">
    {de.verification.attesterRoleDescription}
  </p>
</div>
```
4. Use `attesterNFTContract` instead of `citizenNFTContract`
5. Mention "Benötigt 2 Bescheiniger-Unterschriften"

---

### Priority 2: Request Viewing Pages

#### B. All Requests Page (`/verifizierung/antraege/page.tsx`)
**Pattern:** Similar to `/proposals/page.tsx`

**Structure:**
```tsx
export default function AllRequests() {
  const { isAttester, isCitizen } = useVerificationStatus();
  const [filter, setFilter] = useState<"all" | "attester" | "citizen">("all");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Back link */}
          {/* Header with title */}

          {/* Filter tabs */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setFilter("all")}
              className={filter === "all" ? "..." : "..."}
            >
              Alle
            </button>
            {/* More tabs */}
          </div>

          {/* Request list */}
          <div className="space-y-4">
            {requests.map(request => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
```

**Fetch requests:**
```tsx
const { data: requestCount } = useReadContract({
  contract: citizenNFTContract,
  method: "function requestCount() view returns (uint256)",
});

// Then loop through requestCount and fetch each request
```

---

### Priority 3: Shared Components

#### C. RequestCard Component (`/components/verification/RequestCard.tsx`)
**Pattern:** Copy from `ProposalCard.tsx`

```tsx
interface RequestCardProps {
  requestId: number;
  requester: string;
  target: string;
  type: "Attestation" | "Revocation";
  status: "Pending" | "Approved" | "Rejected" | "Executed";
  evidenceURI: string;
  attesterSignatures?: number;
  citizenSignatures?: number;
  totalSignatures?: number;
  requiredSignatures: number;
  contractType: "attester" | "citizen";
}

export function RequestCard({ ... }: RequestCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 hover:shadow-md transition-all">
      {/* Header with badge */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-gray-500 font-mono text-sm">#{requestId}</span>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Target address */}
      <div className="mb-4">
        <div className="text-xs text-gray-600 mb-1">Ziel-Adresse</div>
        <div className="font-mono text-sm">{target.slice(0, 6)}...{target.slice(-4)}</div>
      </div>

      {/* Signature progress */}
      <SignatureProgress
        current={currentSignatures}
        required={requiredSignatures}
      />

      {/* Action buttons */}
      {userCanSign && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={onApprove}
            className="flex-1 border-2 border-green-600 text-green-600 hover:bg-green-50 px-4 py-2 rounded-lg"
          >
            {de.verification.approveRequest}
          </button>
          <button
            onClick={onReject}
            className="flex-1 border-2 border-red-600 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg"
          >
            {de.verification.rejectRequest}
          </button>
        </div>
      )}
    </div>
  );
}
```

#### D. SignatureProgress Component (`/components/verification/SignatureProgress.tsx`)
```tsx
interface SignatureProgressProps {
  current: number;
  required: number;
  label?: string;
}

export function SignatureProgress({ current, required, label }: SignatureProgressProps) {
  const percentage = (current / required) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label || de.verification.signatures}</span>
        <span className="font-medium">{current} von {required}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-600 transition-all duration-300"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
```

#### E. StatusBadge Component (`/components/verification/StatusBadge.tsx`)
```tsx
interface StatusBadgeProps {
  status: "Pending" | "Approved" | "Rejected" | "Executed";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = {
    Pending: "bg-yellow-900/30 text-yellow-300 border-yellow-700",
    Approved: "bg-green-900/30 text-green-300 border-green-700",
    Rejected: "bg-red-900/30 text-red-300 border-red-700",
    Executed: "bg-purple-900/30 text-purple-300 border-purple-700",
  };

  const labels = {
    Pending: de.verification.pending,
    Approved: de.verification.approved,
    Rejected: de.verification.rejected,
    Executed: de.verification.executed,
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full border ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}
```

---

### Priority 4: Governance Pages

#### F. Update Proposals Page with German
**File:** `/app/proposals/page.tsx`

Option 1: Replace English text with German directly
Option 2: Create `/app/vorschlaege/page.tsx` as German version

**Changes:**
```tsx
// Import translations
import { de } from "@/lib/translations/de";

// Replace all English text:
<h1>{de.proposals.title}</h1>
<p>{de.proposals.subtitle}</p>
<Link href="/proposals/create">{de.proposals.createProposal}</Link>
```

#### G. Proposal Creation Page (`/vorschlaege/erstellen/page.tsx`)
**Key requirement:** Check if user is Attester before allowing access

```tsx
export default function CreateProposal() {
  const { isAttester, isLoading } = useVerificationStatus();
  const [actions, setActions] = useState<ProposalAction[]>([]);

  if (!isAttester) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800 font-medium">
          {de.proposals.createProposalForm.notAttester}
        </p>
      </div>
    );
  }

  const handleSubmit = async () => {
    // Prepare proposal data
    const targets = actions.map(a => a.target);
    const values = actions.map(a => parseEther(a.value.toString()));
    const calldatas = actions.map(a => a.calldata || "0x");
    const description = `# ${title}\n\n${descriptionText}`;

    // Call governor contract
    const transaction = prepareContractCall({
      contract: governorContract,
      method: "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
      params: [targets, values, calldatas, description],
    });

    sendTransaction(transaction);
  };

  return (
    // Form with title, description (Tiptap editor), actions
  );
}
```

#### H. Proposal Detail with Voting (`/vorschlaege/[id]/page.tsx`)
**Add voting panel to existing proposal detail page:**

```tsx
function VotingPanel({ proposalId }: { proposalId: string }) {
  const { isCitizen, votingPower } = useVerificationStatus();
  const { mutate: castVote, isPending } = useSendTransaction();

  const handleVote = (support: 0 | 1 | 2) => {
    const transaction = prepareContractCall({
      contract: governorContract,
      method: "function castVote(uint256 proposalId, uint8 support) returns (uint256)",
      params: [BigInt(proposalId), support],
    });

    castVote(transaction);
  };

  if (!isCitizen) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          Du brauchst ein Bürger-NFT zum Abstimmen
        </p>
      </div>
    );
  }

  return (
    <div className="sticky top-24 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <h3 className="font-medium text-lg mb-4">Abstimmen</h3>

      {/* Vote counts */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-green-600">{de.proposals.forVotes}</span>
          <span className="font-medium">120</span>
        </div>
        {/* Against, Abstain */}
      </div>

      {/* Voting buttons */}
      <div className="space-y-2">
        <button
          onClick={() => handleVote(1)}
          disabled={isPending || !votingPower}
          className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium"
        >
          {de.proposals.voteFor}
        </button>
        <button
          onClick={() => handleVote(0)}
          disabled={isPending || !votingPower}
          className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-medium"
        >
          {de.proposals.voteAgainst}
        </button>
        <button
          onClick={() => handleVote(2)}
          disabled={isPending || !votingPower}
          className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-lg font-medium"
        >
          {de.proposals.voteAbstain}
        </button>
      </div>

      {votingPower === 0 && (
        <div className="mt-4 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2">
          Du musst deine Stimmrechte delegieren
        </div>
      )}
    </div>
  );
}
```

---

### Priority 5: Admin Panel

#### I. Admin Panel (`/admin/verifizierung/page.tsx`)
**Access control:** Check if user is contract owner

```tsx
export default function AdminPanel() {
  const account = useActiveAccount();

  // Check if user is owner
  const { data: owner } = useReadContract({
    contract: attesterNFTContract,
    method: "function owner() view returns (address)",
  });

  if (account?.address !== owner) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">{de.admin.onlyOwner}</p>
      </div>
    );
  }

  // Statistics cards
  // Bootstrap section
  // Request tables
}
```

---

## 🔧 Utility Functions Needed

### A. IPFS Upload (`/lib/verification-utils.ts`)
```typescript
import { upload } from "thirdweb/storage";
import { client } from "@/app/client";

export async function uploadToIPFS(evidence: Evidence): Promise<string> {
  try {
    const uri = await upload({
      client,
      files: [new File([JSON.stringify(evidence)], "evidence.json")],
    });

    // Extract IPFS hash from URI
    const hash = uri.replace("ipfs://", "");
    return hash;
  } catch (error) {
    console.error("IPFS upload failed:", error);
    throw error;
  }
}

export async function fetchFromIPFS(uri: string): Promise<Evidence> {
  try {
    const response = await fetch(`https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`);
    return await response.json();
  } catch (error) {
    console.error("IPFS fetch failed:", error);
    throw error;
  }
}
```

### B. useRequests Hook (`/hooks/useRequests.ts`)
```typescript
export function useRequests(contractType: "attester" | "citizen") {
  const contract = contractType === "attester" ? attesterNFTContract : citizenNFTContract;

  const { data: requestCount } = useReadContract({
    contract,
    method: "function requestCount() view returns (uint256)",
  });

  // Fetch all requests (loop through requestCount)
  // Filter by status
  // Return array of request objects
}
```

---

## 🎨 Navigation & Homepage Updates

### Update Header (`/components/layout/Header.tsx`)
Add navigation links:
```tsx
<Link href="/verifizierung" className="text-gray-300 hover:text-white">
  Verifizierung
</Link>
<Link href="/vorschlaege" className="text-gray-300 hover:text-white">
  Vorschläge
</Link>
```

### Update Homepage (`/app/page.tsx`)
Add quick access cards:
```tsx
<Link
  href="/verifizierung"
  className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md"
>
  <h3 className="text-xl font-medium mb-2">🔐 Bürger-Verifizierung</h3>
  <p className="text-gray-600">Werde Teil der Community</p>
</Link>

<Link
  href="/vorschlaege"
  className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md"
>
  <h3 className="text-xl font-medium mb-2">📊 Vorschläge & Abstimmungen</h3>
  <p className="text-gray-600">Nimm an Governance teil</p>
</Link>
```

---

## ✅ Testing Checklist

Once all pages are built, test these flows:

### Verification Flow:
1. [ ] Connect wallet
2. [ ] View verification dashboard
3. [ ] Request Citizen NFT
   - [ ] Fill form
   - [ ] Upload to IPFS
   - [ ] Create request
   - [ ] See success screen
4. [ ] View request in "Alle Anträge"
5. [ ] Approve request as Attester
6. [ ] Approve request as Citizen
7. [ ] Receive NFT when threshold met
8. [ ] Check voting power updates

### Governance Flow:
1. [ ] Delegate voting power
2. [ ] Create proposal (as Attester)
3. [ ] View proposal list
4. [ ] Vote on proposal
5. [ ] Check vote counts
6. [ ] Execute passed proposal

### Edge Cases:
- [ ] Try to request NFT twice (should fail)
- [ ] Try to create proposal without Attester NFT (should show error)
- [ ] Try to vote without Citizen NFT (should show message)
- [ ] Try to vote without delegating (show warning)
- [ ] Mobile responsiveness

---

## 📦 Summary

**What's Ready:**
- ✅ All contract addresses configured
- ✅ Complete German translations
- ✅ Verification dashboard
- ✅ Request Citizen NFT page (full multi-step form)
- ✅ Custom hooks
- ✅ Design patterns established

**To Build (follow the patterns above):**
- Request Attester NFT page (copy Citizen version)
- All Requests viewing page
- Shared components (RequestCard, SignatureProgress, StatusBadge)
- Proposal creation page (Attester check)
- Voting panel for proposals
- Admin panel
- Navigation updates
- IPFS utilities

**Key Principles:**
1. Always use German text from `de` translations
2. Match existing design (white cards, black buttons, gray-50 background)
3. Check user status with `useVerificationStatus()` hook
4. Use thirdweb's `useReadContract` and `useSendTransaction`
5. Show loading states, error messages, and success feedback
6. Mobile-responsive with Tailwind breakpoints

The foundation is solid - copy the patterns from completed pages to build the rest! 🚀
