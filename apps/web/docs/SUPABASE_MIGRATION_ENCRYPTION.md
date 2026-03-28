# Supabase Database Migration: Evidence Encryption Support

## Overview
This migration adds support for encrypted evidence storage to the `request_evidence` table, enabling GDPR-compliant, privacy-preserving citizen verification.

## Migration SQL

Run this SQL in your Supabase SQL Editor:

```sql
-- Add encryption support columns to request_evidence table
ALTER TABLE request_evidence
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS encryption_version TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN request_evidence.is_encrypted IS 'Flag indicating if evidence_data contains encrypted personal information';
COMMENT ON COLUMN request_evidence.encryption_version IS 'Encryption scheme version (e.g., "1" for TweetNaCl XSalsa20-Poly1305)';

-- Create index for querying encrypted vs plaintext evidence
CREATE INDEX IF NOT EXISTS idx_request_evidence_encrypted
  ON request_evidence(is_encrypted);

-- Verify migration
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'request_evidence'
  AND column_name IN ('is_encrypted', 'encryption_version');
```

## Schema After Migration

### `request_evidence` Table

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | gen_random_uuid() | Primary key |
| `request_id` | text | NO | - | Request ID from smart contract |
| `contract_type` | text | NO | - | "citizen" or "attester" |
| `requester_address` | text | NO | - | Wallet address of requester |
| `irys_id` | text | NO | - | Irys storage receipt ID |
| `irys_url` | text | NO | - | Irys gateway URL |
| `evidence_data` | jsonb | NO | - | Evidence content (encrypted or plaintext) |
| `is_encrypted` | boolean | NO | false | **NEW**: True if evidence is encrypted |
| `encryption_version` | text | YES | null | **NEW**: Encryption scheme version |
| `created_at` | timestamptz | NO | now() | Record creation timestamp |

## Evidence Data Formats

### Encrypted Evidence (NEW - GDPR Compliant)

```json
{
  "encrypted": {
    "ciphertext": "base64_encrypted_blob",
    "nonce": "base64_nonce_24_bytes"
  },
  "metadata": {
    "reason": "Ich bin ein Einwohner von Röbel",
    "timestamp": "2025-11-11T10:30:00.000Z",
    "type": "citizen_attestation",
    "requester": "0x1234...5678",
    "encrypted": true
  }
}
```

**Privacy Guarantees:**
- ✅ Personal data (name, address) encrypted with XSalsa20-Poly1305
- ✅ Only requester can decrypt (via wallet signature)
- ✅ Public metadata (reason, timestamp) remains readable
- ✅ GDPR-compliant: no PII stored in plaintext

### Legacy Evidence (Backward Compatibility)

```json
{
  "name": "Max Mustermann",
  "address": "Musterstraße 1, 17207 Röbel",
  "reason": "Ich bin ein Einwohner von Röbel",
  "timestamp": "2025-11-11T10:30:00.000Z",
  "type": "citizen_attestation",
  "requester": "0x1234...5678"
}
```

**Note:** Legacy format continues to work but is not GDPR-compliant.

## API Changes

### `/api/evidence/store` (POST)

**New Parameters:**
```typescript
{
  requestId: string;
  contractType: "citizen" | "attester";
  irysId: string;
  irysUrl: string;

  // NEW: Encrypted format
  evidencePayload?: EncryptedEvidence;
  isEncrypted?: boolean;

  // LEGACY: Plaintext format (still supported)
  name?: string;
  address?: string;
  reason?: string;
  requester?: string;
  type?: string;
}
```

**Security Validation:**
- ✅ Rejects encrypted evidence containing plaintext `name` or `address`
- ✅ Validates encrypted evidence structure (ciphertext + nonce)
- ✅ Sets `is_encrypted = true` and `encryption_version = "1"`

### `/api/evidence/[id]` (GET)

**No Changes** - Returns evidence as-is:
- Client handles decryption for encrypted evidence
- Legacy evidence returned in plaintext format

## Encryption Implementation

### Client-Side Encryption Flow

1. **Key Derivation**
   ```typescript
   const signature = await account.signMessage({
     message: "Unlock HomeTown DAO Evidence Encryption Key"
   });
   const key = sha256(signature); // 32 bytes
   ```

2. **Encrypt Personal Data**
   ```typescript
   const personalData = { name, address };
   const nonce = randomBytes(24);
   const ciphertext = secretbox(personalData, nonce, key);
   ```

3. **Upload to Irys**
   ```typescript
   const encryptedEvidence = {
     encrypted: { ciphertext, nonce },
     metadata: { reason, timestamp, type, requester, encrypted: true }
   };
   await uploadToIrys(JSON.stringify(encryptedEvidence));
   ```

4. **Store in Supabase**
   ```typescript
   await fetch("/api/evidence/store", {
     method: "POST",
     body: JSON.stringify({
       evidencePayload: encryptedEvidence,
       isEncrypted: true,
       // ...
     })
   });
   ```

### Client-Side Decryption Flow

1. **Fetch Evidence**
   ```typescript
   const response = await fetch(`/api/evidence/${id}`);
   const { data } = await response.json();
   ```

2. **Check Ownership**
   ```typescript
   if (data.metadata.requester === account.address) {
     // User is owner - can decrypt
   }
   ```

3. **Derive Key & Decrypt**
   ```typescript
   const key = await deriveEncryptionKey(account);
   const decrypted = secretbox.open(
     data.encrypted.ciphertext,
     data.encrypted.nonce,
     key
   );
   ```

## Testing the Migration

### 1. Run Migration
```bash
# In Supabase SQL Editor
-- Paste and run the migration SQL above
```

### 2. Verify Columns
```sql
SELECT * FROM request_evidence LIMIT 1;
-- Should show is_encrypted and encryption_version columns
```

### 3. Test Encrypted Evidence Upload
```bash
# In dao-app
cd dao-app
npm run dev

# Navigate to: http://localhost:3000/verifizierung/buerger-beantragen
# Create a new attestation request
# Check console logs for "🔒 Encrypted evidence uploaded"
```

### 4. Verify Database Storage
```sql
SELECT
  request_id,
  is_encrypted,
  encryption_version,
  evidence_data->'metadata'->>'reason' AS public_reason,
  evidence_data->'encrypted'->>'ciphertext' IS NOT NULL AS has_ciphertext
FROM request_evidence
ORDER BY created_at DESC
LIMIT 5;
```

Expected output for encrypted evidence:
```
request_id | is_encrypted | encryption_version | public_reason           | has_ciphertext
-----------|--------------|-------------------|-------------------------|---------------
0          | true         | 1                 | Ich bin ein Einwohner   | true
```

## Rollback Plan

If you need to rollback the migration:

```sql
-- Remove encryption columns
ALTER TABLE request_evidence
  DROP COLUMN IF EXISTS is_encrypted,
  DROP COLUMN IF EXISTS encryption_version;

-- Remove index
DROP INDEX IF EXISTS idx_request_evidence_encrypted;
```

**Note:** This will NOT affect existing data in `evidence_data` JSONB field.

## GDPR Compliance Checklist

After migration, verify:

- ✅ New attestation requests encrypt personal data (name, address)
- ✅ Encrypted evidence stored with `is_encrypted = true`
- ✅ Public metadata (reason, timestamp) remains readable
- ✅ Only evidence creator can decrypt personal data
- ✅ Irys storage contains only encrypted blobs
- ✅ No PII in Irys tags (RequesterName tag removed)
- ✅ API rejects plaintext PII in encrypted evidence
- ✅ Legacy evidence still works (backward compatibility)

## Next Steps

1. **Run the migration** in Supabase
2. **Test encrypted evidence** creation end-to-end
3. **Monitor logs** for successful encryption/decryption
4. **Verify GDPR compliance** with checklist above
5. **Document** for users that their data is now encrypted

---

## Support

For issues or questions:
- Check browser console logs for encryption errors
- Verify wallet signature approval in thirdweb modal
- Confirm Supabase columns were created successfully
- Test with a clean browser session (no cached keys)
