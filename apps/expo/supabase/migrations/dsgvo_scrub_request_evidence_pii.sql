-- DSGVO / GDPR: scrub reversibly-encrypted PII from request_evidence.
--
-- Context: evidence_data held names/addresses "encrypted" with a key derived
-- deterministically from the public wallet address
-- (SHA-256("<wallet>:8453:evidence-encryption-v2"), see apps/expo/lib/encryption.ts).
-- Because the derivation is in the open-source client and the address is public,
-- anyone with read access could recompute the key and decrypt the PII. This is a
-- live leak; it is removed here. Replacement flow stores only a non-reversible
-- Poseidon commitment + non-PII metadata (see
-- docs/superpowers/specs/2026-06-16-citizen-verification-privacy-sybil-design.md).
--
-- Applied to production via Supabase MCP on 2026-06-17 (32 rows redacted, 0 PII keys left).
-- This file is the tracked record / re-runnable, idempotent form.

update public.request_evidence
set evidence_data = jsonb_build_object(
      'redacted', true,
      'reason', 'dsgvo-pii-scrub',
      'scrubbed_at', '2026-06-17',
      'prev_encryption_version', encryption_version
    ),
    is_encrypted = false,
    encryption_version = 'redacted'
where is_encrypted is true
   or evidence_data ?| array['encrypted', 'ciphertext', 'metadata', 'nonce', 'encryptedKey'];
