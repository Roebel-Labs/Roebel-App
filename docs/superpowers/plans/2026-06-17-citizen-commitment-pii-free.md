# Citizen Verification — PII-free Commitment Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reversible-PII write path in citizen/attester attestation requests with an on-device Poseidon **commitment** (preimage never leaves the device), so no recoverable name/address is ever stored server-side, while collecting **birthdate** for future age-gating.

**Architecture:** A new `lib/citizen-commitment.ts` computes `commitment = Poseidon(firstName, lastName, birthdate, address, salt)` where `salt` is derived deterministically from a fixed EIP-712 wallet signature (reproducible multi-device, confidential — needs the private key). The commitment hex goes on-chain as the `evidenceURI` and into a **non-PII** Supabase row; the preimage is cached in `expo-secure-store`. The attester view already shows no PII. The cryptographic Sybil **nullifier is out of scope** (deferred to the §8 privacy milestone per the spec).

**Tech Stack:** Expo/React Native, thirdweb (Account, `signTypedData`, `keccak256`), `maci-crypto` (`hash5`, `SNARK_FIELD_SIZE` — already a dependency), `expo-secure-store`, jest + jest-expo.

**Scope boundary (read before starting):**
- IN: citizen + attester **attestation** request flows (the name/address PII leak); birthdate; on-device commitment; non-PII storage; owner-side preimage read; attester-upgrade prefill from secure-store.
- OUT: the cryptographic uniqueness **nullifier** + its input choice (deferred, §8); the Gnosis redeploy/re-mint (Circles Phase 0 runbook); **revocation** requests (they intentionally keep a human-readable reason for approvers — different requirement, not citizen identity PII — flagged, not changed here).
- Reference spec: [`docs/superpowers/specs/2026-06-16-citizen-verification-privacy-sybil-design.md`](../specs/2026-06-16-citizen-verification-privacy-sybil-design.md).

---

### Task 1: Types for the commitment flow

**Files:**
- Modify: `apps/expo/lib/verification-types.ts` (append after line 13, the `PersonalData` interface)

- [ ] **Step 1: Add the new types**

Append to `apps/expo/lib/verification-types.ts`:

```typescript
/**
 * Citizen identity collected in the request form. Never stored server-side in
 * plaintext — only hashed into a commitment whose preimage stays on-device.
 * `birthdate` is canonical ISO `YYYY-MM-DD`.
 */
export interface CitizenIdentity {
  firstName: string;
  lastName: string;
  birthdate: string; // ISO YYYY-MM-DD
  address: string;
}

/** On-device preimage = identity + the wallet-bound salt (decimal field element). */
export interface CitizenPreimage extends CitizenIdentity {
  salt: string; // decimal string of a BabyJubjub field element
}

/**
 * Non-PII evidence written to Supabase + (the commitment) on-chain. Contains NO
 * recoverable personal data — only the non-reversible Poseidon commitment.
 */
export interface CommitmentEvidence {
  commitment: string; // 0x-hex Poseidon output
  type: 'citizen' | 'attester';
  requester: string;
  reason: string;
  timestamp: string;
  version: 'commit-v1';
}
```

- [ ] **Step 2: Typecheck the file**

Run: `cd apps/expo && npx tsc --noEmit -p tsconfig.json 2>&1 | grep verification-types || echo "OK: no errors in verification-types"`
Expected: `OK: no errors in verification-types`

- [ ] **Step 3: Commit**

```bash
git add apps/expo/lib/verification-types.ts
git commit -m "feat(expo): add CitizenIdentity/CitizenPreimage/CommitmentEvidence types"
```

---

### Task 2: Commitment library — pure helpers (TDD)

**Files:**
- Create: `apps/expo/lib/citizen-commitment.ts`
- Test: `apps/expo/lib/__tests__/citizen-commitment.test.ts`

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `apps/expo/lib/__tests__/citizen-commitment.test.ts`:

```typescript
import {
  germanDateToIso,
  fieldFromString,
  saltFromSignature,
  computeCommitment,
} from '../citizen-commitment';
import type { CitizenPreimage } from '../verification-types';

describe('germanDateToIso', () => {
  it('converts DD.MM.YYYY to ISO', () => {
    expect(germanDateToIso('05.03.1990')).toBe('1990-03-05');
  });
  it('rejects malformed input', () => {
    expect(germanDateToIso('1990-03-05')).toBeNull();
    expect(germanDateToIso('5.3.90')).toBeNull();
    expect(germanDateToIso('32.13.1990')).toBeNull();
  });
});

describe('fieldFromString', () => {
  it('is deterministic and within the field', () => {
    const a = fieldFromString('Müller');
    const b = fieldFromString('Müller');
    expect(a).toBe(b);
    expect(a > 0n).toBe(true);
  });
  it('differs for different inputs', () => {
    expect(fieldFromString('Müller')).not.toBe(fieldFromString('Mueller'));
  });
});

describe('saltFromSignature', () => {
  it('is deterministic for the same signature', () => {
    const sig = '0x' + 'ab'.repeat(65);
    expect(saltFromSignature(sig)).toBe(saltFromSignature(sig));
  });
  it('returns a decimal string', () => {
    const sig = '0x' + 'cd'.repeat(65);
    expect(saltFromSignature(sig)).toMatch(/^\d+$/);
  });
});

describe('computeCommitment', () => {
  const preimage: CitizenPreimage = {
    firstName: 'Anna',
    lastName: 'Müller',
    birthdate: '1990-03-05',
    address: 'Musterstraße 1, 17207 Röbel',
    salt: '12345678901234567890',
  };
  it('is deterministic and 0x-hex', () => {
    const c = computeCommitment(preimage);
    expect(c).toBe(computeCommitment(preimage));
    expect(c).toMatch(/^0x[0-9a-f]+$/);
  });
  it('changes when any field changes', () => {
    const base = computeCommitment(preimage);
    expect(computeCommitment({ ...preimage, firstName: 'Anne' })).not.toBe(base);
    expect(computeCommitment({ ...preimage, salt: '99' })).not.toBe(base);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/expo && npx jest lib/__tests__/citizen-commitment.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '../citizen-commitment'`.

- [ ] **Step 3: Implement the pure helpers**

Create `apps/expo/lib/citizen-commitment.ts`:

```typescript
/**
 * Citizen verification commitment helpers.
 *
 * commitment = Poseidon(firstName, lastName, birthdate, address, salt)
 *   - salt is derived deterministically from a fixed EIP-712 wallet signature
 *     (reproducible across devices, confidential — requires the private key).
 *   - the preimage NEVER leaves the device (cached in expo-secure-store);
 *     only the non-reversible commitment hex is stored server-side / on-chain.
 *
 * This replaces the previous reversible wallet-address-derived "encryption"
 * (lib/encryption.ts deriveSessionKey), which was decryptable by anyone who
 * read the public Supabase row.
 */
import { keccak256 } from 'thirdweb/utils';
import { hash5, SNARK_FIELD_SIZE } from 'maci-crypto';
import type { Account } from 'thirdweb/wallets';
import type { CitizenIdentity, CitizenPreimage } from './verification-types';

/** Fixed EIP-712 domain/message for deterministic salt derivation (NO timestamp). */
const SALT_DOMAIN = {
  name: 'Roebel Citizen Commitment',
  version: '1',
  chainId: 8453, // Base today; ported to Gnosis (100) in Circles Phase 0.
} as const;

const SALT_TYPES = {
  CommitmentSalt: [{ name: 'purpose', type: 'string' }],
} as const;

const SALT_MESSAGE = { purpose: 'Derive Roebel citizen commitment salt' } as const;

/** Convert "DD.MM.YYYY" to canonical ISO "YYYY-MM-DD", or null if invalid. */
export function germanDateToIso(input: string): string | null {
  const m = input.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Hash a UTF-8 string into a BabyJubjub field element (frozen encoding). */
export function fieldFromString(s: string): bigint {
  const bytes = new TextEncoder().encode(s);
  return BigInt(keccak256(bytes)) % SNARK_FIELD_SIZE;
}

/** Reduce a wallet signature (0x-hex) to a decimal field-element salt. */
export function saltFromSignature(signature: string): string {
  const reduced = BigInt(keccak256(signature as `0x${string}`)) % SNARK_FIELD_SIZE;
  return reduced.toString();
}

/** Compute the Poseidon commitment for a full preimage. Returns 0x-hex. */
export function computeCommitment(preimage: CitizenPreimage): string {
  const elements: bigint[] = [
    fieldFromString(preimage.firstName.trim().toLowerCase()),
    fieldFromString(preimage.lastName.trim().toLowerCase()),
    fieldFromString(preimage.birthdate.trim()),
    fieldFromString(preimage.address.trim().toLowerCase()),
    BigInt(preimage.salt),
  ];
  return '0x' + hash5(elements).toString(16);
}

/**
 * Derive the wallet-bound salt by signing a FIXED EIP-712 message. Deterministic
 * per wallet (no timestamp), so it reproduces on any device with the same wallet.
 * Reuses the same deterministic-signing approach as the MACI voter keys.
 */
export async function deriveCommitmentSalt(account: Account): Promise<string> {
  const signature = await account.signTypedData({
    domain: SALT_DOMAIN,
    types: SALT_TYPES,
    primaryType: 'CommitmentSalt',
    message: SALT_MESSAGE,
  });
  return saltFromSignature(signature);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/expo && npx jest lib/__tests__/citizen-commitment.test.ts --watchAll=false`
Expected: PASS (4 suites).
If `maci-crypto` fails to transform under jest-expo, add to `apps/expo/package.json` jest config: `"transformIgnorePatterns": ["node_modules/(?!(jest-)?react-native|@react-native|maci-crypto|@zk-kit|circomlibjs|ffjavascript)"]` and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/citizen-commitment.ts apps/expo/lib/__tests__/citizen-commitment.test.ts
git commit -m "feat(expo): add Poseidon citizen-commitment helpers (TDD)"
```

---

### Task 3: Build + store the commitment bundle (secure-store)

**Files:**
- Modify: `apps/expo/lib/citizen-commitment.ts`

- [ ] **Step 1: Append the bundle builder + secure-store persistence**

Add to the bottom of `apps/expo/lib/citizen-commitment.ts`:

```typescript
import * as SecureStore from 'expo-secure-store';
import type { CommitmentEvidence } from './verification-types';

const preimageKey = (address: string) =>
  `citizen-preimage:${address.toLowerCase()}`;

/** Persist the preimage on-device so the owner can re-display it / prefill later. */
export async function storeCitizenPreimage(
  address: string,
  preimage: CitizenPreimage
): Promise<void> {
  await SecureStore.setItemAsync(preimageKey(address), JSON.stringify(preimage));
}

/** Load the on-device preimage, or null if absent (e.g. fresh device). */
export async function loadCitizenPreimage(
  address: string
): Promise<CitizenPreimage | null> {
  const raw = await SecureStore.getItemAsync(preimageKey(address));
  return raw ? (JSON.parse(raw) as CitizenPreimage) : null;
}

/**
 * Build the full commitment bundle for a request: derives the salt, computes the
 * commitment, persists the preimage on-device, and returns the on-chain
 * evidenceURI + the non-PII CommitmentEvidence for Supabase.
 */
export async function buildCitizenCommitment(
  identity: CitizenIdentity,
  reason: string,
  type: 'citizen' | 'attester',
  account: Account
): Promise<{ evidenceURI: string; evidence: CommitmentEvidence; preimage: CitizenPreimage }> {
  const salt = await deriveCommitmentSalt(account);
  const preimage: CitizenPreimage = { ...identity, salt };
  const commitment = computeCommitment(preimage);

  await storeCitizenPreimage(account.address, preimage);

  const evidence: CommitmentEvidence = {
    commitment,
    type,
    requester: account.address,
    reason,
    timestamp: new Date().toISOString(),
    version: 'commit-v1',
  };

  return { evidenceURI: `commit:${commitment}`, evidence, preimage };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | grep citizen-commitment || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/expo/lib/citizen-commitment.ts
git commit -m "feat(expo): build + persist citizen commitment bundle (secure-store)"
```

---

### Task 4: Non-PII Supabase upload

**Files:**
- Modify: `apps/expo/lib/supabase-verification.ts` (add a new function after `uploadEncryptedEvidence`, ~line 83)

- [ ] **Step 1: Add `uploadCommitmentEvidence`**

In `apps/expo/lib/supabase-verification.ts`, add the import at the top (after line 11):

```typescript
import type { CommitmentEvidence } from './verification-types';
```

Then add this function after `uploadEncryptedEvidence` (after line 83):

```typescript
/**
 * Store a non-PII commitment evidence row. Unlike uploadEncryptedEvidence, this
 * writes NO recoverable personal data — only the non-reversible commitment.
 */
export async function uploadCommitmentEvidence(
  evidence: CommitmentEvidence,
  requestId: number,
  onStage?: (stage: UploadEvidenceStage) => void
): Promise<void> {
  onStage?.('saving-reference');

  const { error } = await supabase.from('request_evidence').insert({
    request_id: String(requestId),
    contract_type: evidence.type,
    contract_address: currentContractAddress(evidence.type),
    requester_address: evidence.requester.toLowerCase(),
    irys_id: 'commitment',
    irys_url: 'commitment',
    evidence_data: {
      commitment: evidence.commitment,
      version: evidence.version,
      reason: evidence.reason,
      timestamp: evidence.timestamp,
      redacted: true, // no PII; preimage stays on the requester's device
    },
    is_encrypted: false,
    encryption_version: evidence.version,
    status: 'pending',
    nft_type: evidence.type,
    attester_signatures: 0,
    citizen_signatures: 0,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to store commitment evidence: ${error.message}`);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | grep supabase-verification || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/expo/lib/supabase-verification.ts
git commit -m "feat(expo): add non-PII uploadCommitmentEvidence"
```

---

### Task 5: Wire the citizen create hook to the commitment flow

**Files:**
- Modify: `apps/expo/hooks/useVerification.ts` (imports ~20-34; `useCreateCitizenRequest` 62-157)

- [ ] **Step 1: Update imports**

Replace the encryption + supabase imports (lines 20-34) so the citizen/attester path uses the commitment helpers. Change:

```typescript
import {
  createEncryptedEvidence,
  createEncryptedEvidenceV2,
  decryptEvidence,
  decryptEvidenceV2,
} from '@/lib/encryption';
import {
  uploadEncryptedEvidence,
  fetchEvidenceByRequestId,
  fetchEvidenceByURI,
  createSupabaseRequestRecord,
  updateSupabaseRequestStatus,
  fetchPendingRequests,
} from '@/lib/supabase-verification';
import type { PersonalData, CitizenRequest, EncryptedEvidence } from '@/lib/verification-types';
```

to:

```typescript
import { createEncryptedEvidenceV2 } from '@/lib/encryption'; // revocation only
import { buildCitizenCommitment, loadCitizenPreimage } from '@/lib/citizen-commitment';
import {
  uploadEncryptedEvidence,
  uploadCommitmentEvidence,
  updateSupabaseRequestStatus,
  fetchPendingRequests,
} from '@/lib/supabase-verification';
import type { PersonalData, CitizenIdentity } from '@/lib/verification-types';
```

- [ ] **Step 2: Rewrite the citizen `createRequest` body**

Replace the body of `createRequest` in `useCreateCitizenRequest` (lines 68-154). The new signature takes `CitizenIdentity`, writes the commitment to `evidenceURI`, and stores a non-PII row:

```typescript
  const createRequest = useCallback(
    async (identity: CitizenIdentity, reason: string) => {
      if (!account) {
        throw new Error('No wallet connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        // 1. Build the on-device commitment (preimage cached in secure-store).
        setStage('encrypting');
        const { evidenceURI, evidence } = await buildCitizenCommitment(
          identity,
          reason,
          'citizen',
          account
        );

        // 2. Create the on-chain request with the commitment as the evidenceURI.
        const transaction = prepareContractCall({
          contract: citizenNFTContract,
          method: 'function createAttestationRequest(string evidenceURI) returns (uint256)',
          params: [evidenceURI],
        });

        setStage('submitting-tx');
        const { transactionHash } = await sendTransaction({ transaction, account });

        // 3. Read the real requestId from the event log (avoids requestCount races).
        setStage('awaiting-receipt');
        const receipt = await waitForReceipt({ client, chain: base, transactionHash });
        const requestCreatedEvent = prepareEvent({
          signature:
            'event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
        });
        const events = parseEventLogs({ events: [requestCreatedEvent], logs: receipt.logs });
        const created = events[0];
        if (!created) {
          throw new Error('Could not read request ID from transaction receipt');
        }
        const requestId = Number(created.args.requestId);

        // 4. Store the non-PII commitment row.
        await uploadCommitmentEvidence(evidence, requestId, setStage);

        setStage('idle');
        setIsLoading(false);
        return { requestId, transactionHash };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setStage('idle');
        setIsLoading(false);
        throw error;
      }
    },
    [account]
  );
```

- [ ] **Step 3: Typecheck (expect errors in the attester hook + forms until later tasks)**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | grep -E "useVerification|request-citizen|request-attester" || echo "OK"`
Expected: errors only referencing `createEncryptedEvidenceV2`/`PersonalData` in the *attester* hook and the form files (fixed in Tasks 6-8). No errors in `useCreateCitizenRequest`.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/hooks/useVerification.ts
git commit -m "feat(expo): citizen request writes on-device commitment, not reversible PII"
```

---

### Task 6: Wire the attester create hook to the commitment flow

**Files:**
- Modify: `apps/expo/hooks/useVerification.ts` (`useCreateAttesterRequest` 166-251)

- [ ] **Step 1: Rewrite the attester `createRequest` body**

Replace the body of `createRequest` in `useCreateAttesterRequest` (lines 172-248):

```typescript
  const createRequest = useCallback(
    async (identity: CitizenIdentity, reason: string) => {
      if (!account) {
        throw new Error('No wallet connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        setStage('encrypting');
        const { evidenceURI, evidence } = await buildCitizenCommitment(
          identity,
          reason,
          'attester',
          account
        );

        const transaction = prepareContractCall({
          contract: attesterNFTContract,
          method: 'function createAttestationRequest(string evidenceURI) returns (uint256)',
          params: [evidenceURI],
        });

        setStage('submitting-tx');
        const { transactionHash } = await sendTransaction({ transaction, account });

        setStage('awaiting-receipt');
        const receipt = await waitForReceipt({ client, chain: base, transactionHash });
        const requestCreatedEvent = prepareEvent({
          signature:
            'event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
        });
        const events = parseEventLogs({ events: [requestCreatedEvent], logs: receipt.logs });
        const created = events[0];
        if (!created) {
          throw new Error('Could not read request ID from transaction receipt');
        }
        const requestId = Number(created.args.requestId);

        await uploadCommitmentEvidence(evidence, requestId, setStage);

        setStage('idle');
        setIsLoading(false);
        return { requestId, transactionHash };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setStage('idle');
        setIsLoading(false);
        throw error;
      }
    },
    [account]
  );
```

- [ ] **Step 2: Typecheck the hooks file**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | grep useVerification || echo "OK: useVerification clean"`
Expected: `OK: useVerification clean` (form errors fixed in Tasks 7-8; note `useRequestDetails` still references removed decrypt — fixed in Task 9; if it errors here, proceed, Task 9 resolves it).

- [ ] **Step 3: Commit**

```bash
git add apps/expo/hooks/useVerification.ts
git commit -m "feat(expo): attester request writes on-device commitment, not reversible PII"
```

---

### Task 7: Citizen form — first name, last name, birthdate

**Files:**
- Modify: `apps/expo/app/verification/request-citizen/form.tsx`

- [ ] **Step 1: Update state, imports, and submit**

In `apps/expo/app/verification/request-citizen/form.tsx`:

Add import after line 16:

```typescript
import { germanDateToIso } from '@/lib/citizen-commitment';
```

Replace the state (lines 29-30):

```typescript
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [address, setAddress] = useState('');
```

Replace `handleSubmit` validation + call (lines 36-71):

```typescript
  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Vor- und Nachnamen ein.' });
      return;
    }
    const iso = germanDateToIso(birthdate);
    if (!iso) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihr Geburtsdatum als TT.MM.JJJJ ein.' });
      return;
    }
    if (!address.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihre Adresse ein.' });
      return;
    }
    if (!account) {
      setErrorDrawer({ visible: true, message: 'Bitte verbinden Sie Ihre Wallet.' });
      return;
    }

    try {
      const result = await createRequest(
        { firstName: firstName.trim(), lastName: lastName.trim(), birthdate: iso, address: address.trim() },
        DEFAULT_REASON
      );
      await refresh();
      router.replace({
        pathname: '/verification/request-citizen/success' as any,
        params: { requestId: String(result.requestId) },
      });
    } catch (error) {
      console.error('Failed to create request:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Der Antrag konnte nicht erstellt werden. Bitte versuchen Sie es erneut.',
      });
    }
  };
```

- [ ] **Step 2: Replace the single name input with first/last/birthdate fields + privacy copy**

Replace the privacy body text (lines 131-133) with:

```typescript
          <Text style={[styles.privacyBody, { color: colors.textSecondary }]}>
            Ihre Angaben bleiben auf Ihrem Gerät. Gespeichert wird nur ein nicht umkehrbarer Fingerabdruck — niemand kann daraus Ihren Namen lesen.
          </Text>
```

Replace the "Vollständiger Name" form group (lines 136-154) with:

```typescript
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Vorname *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Anna"
            placeholderTextColor={colors.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            editable={!isLoading}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Nachname *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Müller"
            placeholderTextColor={colors.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            editable={!isLoading}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Geburtsdatum (TT.MM.JJJJ) *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="05.03.1990"
            placeholderTextColor={colors.textTertiary}
            value={birthdate}
            onChangeText={setBirthdate}
            editable={!isLoading}
            keyboardType="numbers-and-punctuation"
          />
        </View>
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | grep request-citizen || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/expo/app/verification/request-citizen/form.tsx
git commit -m "feat(expo): citizen form collects first/last name + birthdate; commitment copy"
```

---

### Task 8: Attester form — prefill from secure-store + new fields

**Files:**
- Modify: `apps/expo/app/verification/request-attester/form.tsx`

- [ ] **Step 1: Swap decrypt-prefill for secure-store prefill + add fields**

Replace imports (lines 21-22):

```typescript
import { loadCitizenPreimage, germanDateToIso } from '@/lib/citizen-commitment';
```

Replace state (lines 35-37):

```typescript
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [address, setAddress] = useState('');
  const [prefilling, setPrefilling] = useState(false);
```

Replace the prefill `useEffect` (lines 46-77):

```typescript
  // Prefill from the on-device citizen preimage (no decrypt, no network).
  useEffect(() => {
    let cancelled = false;
    async function prefill() {
      if (!account || !hasCitizenNFT) return;
      setPrefilling(true);
      try {
        const pre = await loadCitizenPreimage(account.address);
        if (cancelled || !pre) return;
        setFirstName((p) => p || pre.firstName || '');
        setLastName((p) => p || pre.lastName || '');
        // birthdate is stored ISO; show it back as DD.MM.YYYY
        if (pre.birthdate) {
          const [y, m, d] = pre.birthdate.split('-');
          if (y && m && d) setBirthdate((p) => p || `${d}.${m}.${y}`);
        }
        setAddress((p) => p || pre.address || '');
      } catch (err) {
        console.log('Prefill from citizen preimage skipped:', err);
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    }
    prefill();
    return () => { cancelled = true; };
  }, [account, hasCitizenNFT]);
```

Replace `handleSubmit` validation + call (lines 79-115) with the same shape as Task 7 Step 1 (first/last/birthdate/address → `germanDateToIso` → `createRequest(identity, DEFAULT_REASON)`), routing to `/verification/request-attester/success`:

```typescript
  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Vor- und Nachnamen ein.' });
      return;
    }
    const iso = germanDateToIso(birthdate);
    if (!iso) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihr Geburtsdatum als TT.MM.JJJJ ein.' });
      return;
    }
    if (!address.trim()) {
      setErrorDrawer({ visible: true, message: 'Bitte geben Sie Ihre Adresse ein.' });
      return;
    }
    if (!account) {
      setErrorDrawer({ visible: true, message: 'Bitte verbinden Sie Ihre Wallet.' });
      return;
    }

    try {
      const result = await createRequest(
        { firstName: firstName.trim(), lastName: lastName.trim(), birthdate: iso, address: address.trim() },
        DEFAULT_REASON,
      );
      await refresh();
      router.replace({
        pathname: '/verification/request-attester/success' as any,
        params: { requestId: String(result.requestId) },
      });
    } catch (error) {
      console.error('Failed to create attester request:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Der Antrag konnte nicht erstellt werden. Bitte versuchen Sie es erneut.',
      });
    }
  };
```

- [ ] **Step 2: Replace the single name input with the three fields**

Apply the same JSX replacement as Task 7 Step 2 (Vorname / Nachname / Geburtsdatum form groups) in place of the "Vollständiger Name" group (lines 186-204), and update the privacy body (lines 181-183) to the same commitment copy:

```typescript
          <Text style={[styles.privacyBody, { color: colors.textSecondary }]}>
            Ihre Angaben bleiben auf Ihrem Gerät. Gespeichert wird nur ein nicht umkehrbarer Fingerabdruck — niemand kann daraus Ihren Namen lesen.
          </Text>
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | grep request-attester || echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/expo/app/verification/request-attester/form.tsx
git commit -m "feat(expo): attester form prefills from on-device preimage; collects birthdate"
```

---

### Task 9: Owner-side preimage in `useRequestDetails` (drop decrypt)

**Files:**
- Modify: `apps/expo/hooks/useVerification.ts` (`useRequestDetails` 482-552)

- [ ] **Step 1: Replace the evidence-decrypt block with secure-store preimage load**

In `useRequestDetails`, remove the `evidence`/decrypt state and the Supabase-evidence fetch/decrypt block (lines 487-488 and 524-540), replacing the owner display with the on-device preimage. Change the state declarations (lines 486-488) to:

```typescript
  const [request, setRequest] = useState<any | null>(null);
  const [decryptedData, setDecryptedData] = useState<PersonalData | null>(null);
```

Replace the evidence fetch/decrypt block (lines 524-540) with:

```typescript
      // Owner-only: show the name from the on-device preimage (no server PII).
      if (account && parsedRequest.requester.toLowerCase() === account.address.toLowerCase()) {
        try {
          const pre = await loadCitizenPreimage(account.address);
          if (pre) {
            setDecryptedData({ name: `${pre.firstName} ${pre.lastName}`.trim(), address: pre.address });
          }
        } catch (e) {
          console.log('No local preimage for this request');
        }
      }
```

Update the hook's return (line 551) to drop `evidence`:

```typescript
  return { request, decryptedData, isLoading, error, fetchRequest };
```

- [ ] **Step 2: Verify no remaining references to removed symbols**

Run: `cd apps/expo && grep -nE "fetchEvidenceByRequestId|decryptEvidenceV2|setEvidence|\\bevidence\\b" hooks/useVerification.ts || echo "OK: clean"`
Expected: `OK: clean` (no matches).

- [ ] **Step 3: Typecheck the whole verification surface**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | grep -E "useVerification|verification/request" || echo "OK: verification surface clean"`
Expected: `OK: verification surface clean`.

- [ ] **Step 4: Run the unit tests**

Run: `cd apps/expo && npx jest lib/__tests__/citizen-commitment.test.ts --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/hooks/useVerification.ts
git commit -m "feat(expo): request details read owner name from on-device preimage, no decrypt"
```

---

### Task 10: Guard against regressions + push

**Files:**
- Modify: `apps/expo/lib/encryption.ts` (add a deprecation banner; no behavior change)

- [ ] **Step 1: Mark the reversible-key path deprecated**

Add this comment block above `deriveSessionKey` (line 287) in `apps/expo/lib/encryption.ts`:

```typescript
/**
 * @deprecated REVERSIBLE — the session key is derived from the PUBLIC wallet
 * address, so anyone who reads the stored row can recompute it. Do NOT use for
 * citizen/attester identity PII. Retained ONLY for revocation reasons, which are
 * intentionally human-readable by approvers. New identity flows use
 * lib/citizen-commitment.ts (on-device preimage, non-reversible commitment).
 */
```

- [ ] **Step 2: Full typecheck + tests**

Run: `cd apps/expo && npx tsc --noEmit 2>&1 | tail -20`
Expected: no errors in `lib/citizen-commitment.ts`, `hooks/useVerification.ts`, `app/verification/**`. (Pre-existing unrelated errors elsewhere, if any, are out of scope — confirm none are in the touched files.)

Run: `cd apps/expo && npx jest lib/__tests__/citizen-commitment.test.ts --watchAll=false`
Expected: PASS.

- [ ] **Step 3: Manual smoke test (device/simulator)**

Run: `cd apps/expo && pnpm ios` (or `pnpm android`). Then:
1. Open the citizen request form, enter Vorname/Nachname/Geburtsdatum/Adresse, submit.
2. Confirm the request succeeds and a success screen shows a requestId.
3. In Supabase (via MCP `execute_sql`): `select evidence_data, is_encrypted, encryption_version from request_evidence where request_id = '<id>';` — confirm `evidence_data` has only `commitment`/`version`/`redacted` (NO `encrypted`/`ciphertext`), `is_encrypted = false`, `encryption_version = 'commit-v1'`.
4. As a second (attester) account, open the request and confirm approve/reject works and no PII is shown.

- [ ] **Step 4: Commit + push**

```bash
git add apps/expo/lib/encryption.ts
git commit -m "docs(expo): deprecate reversible address-derived encryption for identity PII"
git push
```

---

## Self-Review

**Spec coverage:**
- "No reversible PII written" → Tasks 4, 5, 6 (commitment row; preimage on-device). ✓
- "Commitment in reserved evidenceURI slot" → Tasks 5, 6 pass `commit:0x…`. ✓
- "Wallet-bound deterministic salt (not address-derived, not random)" → Task 2 `deriveCommitmentSalt` (fixed EIP-712 signature). ✓
- "Birthdate for future age-gating, inside commitment" → Tasks 1, 2, 7, 8. ✓
- "PII-free attester view" → already true in `request/[id].tsx`; owner read moved on-device in Task 9. ✓
- "Attester-upgrade prefill from device, not decrypt" → Task 8. ✓
- "Nullifier deferred / out of scope" → not built; stated in scope boundary. ✓
- "Gnosis redeploy/re-mint out of scope" → stated; flow is chain-portable (only `SALT_DOMAIN.chainId` + contract target change at migration). ✓
- "Revocation intentionally unchanged" → Task 10 deprecation note documents why. ✓

**Placeholder scan:** none — every code step contains full code.

**Type consistency:** `CitizenIdentity`/`CitizenPreimage`/`CommitmentEvidence` defined in Task 1 and used consistently; `buildCitizenCommitment(identity, reason, type, account)` signature matches its callers in Tasks 5/6; `loadCitizenPreimage(address)`/`storeCitizenPreimage(address, preimage)` consistent across Tasks 3/8/9; `createRequest(identity, reason)` matches the form callers in Tasks 7/8.

**Migration portability note:** at Circles Phase 0, change `SALT_DOMAIN.chainId` to 100 and the contract targets to the Gnosis `CitizenNFT`; the commitment math and storage are unchanged. Verify deterministic `signTypedData` under Safe/ERC-1271 in Circles Spike #1 (reuse the MACI voter-key signing path).
