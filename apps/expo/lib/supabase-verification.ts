/**
 * Supabase Verification Utilities
 *
 * Functions for storing and retrieving encrypted verification evidence
 * Uses existing request_evidence table with Irys storage (matches web app)
 */

import { supabase } from './supabase';
import { uploadToIrys, fetchFromIrys } from './irys-upload';
import { citizenNFTContract, attesterNFTContract } from '@/constants/verification-contracts';
import type { EncryptedEvidence, CommitmentEvidence } from './verification-types';

// Scope reads/writes to the currently deployed contract addresses so legacy rows
// from archived (pre-2026-05-23) CitizenNFT/AttesterNFT contracts no longer collide
// on the (request_id, contract_type, contract_address) unique key.
const currentContractAddress = (type: 'citizen' | 'attester'): string =>
  (type === 'citizen' ? citizenNFTContract.address : attesterNFTContract.address).toLowerCase();

/**
 * Upload encrypted evidence to Irys and store reference in Supabase
 *
 * @param evidence - Encrypted evidence bundle
 * @param requestId - Blockchain request ID
 * @param onStage - Optional callback fired before each network step so callers
 *                  can drive a stage-aware UI (e.g. a submit-button label).
 * @returns Irys URL
 */
export type UploadEvidenceStage = 'uploading-evidence' | 'saving-reference';

export async function uploadEncryptedEvidence(
  evidence: EncryptedEvidence,
  requestId: number,
  onStage?: (stage: UploadEvidenceStage) => void
): Promise<string> {
  console.log('📤 Uploading encrypted evidence to Irys + Supabase...');

  try {
    // 1. Upload to Irys (decentralized storage)
    const evidenceData = {
      encrypted: evidence.encrypted,
      metadata: evidence.metadata,
      timestamp: Date.now(),
      version: '1.0',
    };

    onStage?.('uploading-evidence');
    const { id: irysId, url: irysUrl } = await uploadToIrys(evidenceData);

    // 2. Store reference in Supabase request_evidence table
    onStage?.('saving-reference');
    const { data, error} = await supabase
      .from('request_evidence')
      .insert({
        request_id: String(requestId),
        contract_type: evidence.metadata.type,
        contract_address: currentContractAddress(evidence.metadata.type),
        requester_address: evidence.metadata.requester.toLowerCase(),
        irys_id: irysId,
        irys_url: irysUrl,
        evidence_data: evidenceData,
        is_encrypted: true,
        encryption_version: evidence.metadata.encryptionVersion || '1.0-tweetnacl', // Support V1 and V2
        status: 'pending',
        nft_type: evidence.metadata.type,
        attester_signatures: 0,
        citizen_signatures: 0,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      throw new Error(`Failed to store evidence reference: ${error.message}`);
    }

    console.log(`✅ Evidence uploaded successfully: ${irysUrl}`);
    return irysUrl;
  } catch (error) {
    console.error('❌ Failed to upload evidence:', error);
    throw error;
  }
}

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

/**
 * Fetch encrypted evidence from Supabase by request ID
 *
 * @param requestId - Blockchain request ID
 * @param contractType - 'citizen' or 'attester'
 * @returns Encrypted evidence
 */
export async function fetchEvidenceByRequestId(
  requestId: number,
  contractType: 'citizen' | 'attester'
): Promise<EncryptedEvidence> {
  console.log(`📥 Fetching evidence for request #${requestId}...`);

  try {
    // Fetch from request_evidence table
    const { data, error } = await supabase
      .from('request_evidence')
      .select('*')
      .eq('request_id', String(requestId))
      .eq('contract_type', contractType)
      .eq('contract_address', currentContractAddress(contractType))
      .single();

    if (error) {
      console.error('❌ Supabase fetch error:', error);
      throw new Error(`Failed to fetch evidence: ${error.message}`);
    }

    if (!data) {
      throw new Error('Evidence not found');
    }

    // Return evidence from stored data
    const evidence: EncryptedEvidence = {
      encrypted: data.evidence_data.encrypted,
      metadata: data.evidence_data.metadata,
    };

    console.log('✅ Evidence fetched successfully');
    return evidence;
  } catch (error) {
    console.error('❌ Failed to fetch evidence:', error);
    throw error;
  }
}

/**
 * Fetch evidence by URI (backwards compatibility)
 * Supports both Irys URLs and old Supabase URIs
 */
export async function fetchEvidenceByURI(
  evidenceURI: string
): Promise<EncryptedEvidence> {
  console.log('📥 Fetching encrypted evidence from URI...');

  try {
    // Handle Irys URLs
    if (evidenceURI.startsWith('https://node')) {
      const irysId = evidenceURI.split('/').pop();
      if (!irysId) throw new Error('Invalid Irys URL');

      const evidenceData = await fetchFromIrys(irysId);
      return {
        encrypted: evidenceData.encrypted,
        metadata: evidenceData.metadata,
      };
    }

    // Handle old Supabase URIs (fallback for migration)
    const match = evidenceURI.match(/^supabase:\/\/(.+)$/);
    if (match) {
      throw new Error('Old Supabase URI format no longer supported. Use fetchEvidenceByRequestId instead.');
    }

    throw new Error(`Unsupported evidence URI format: ${evidenceURI}`);
  } catch (error) {
    console.error('❌ Failed to fetch evidence:', error);
    throw error;
  }
}

/**
 * Check if evidence exists for a request
 *
 * @param requestId - Blockchain request ID
 * @param contractType - 'citizen' or 'attester'
 * @returns true if evidence exists
 */
export async function evidenceExists(
  requestId: number,
  contractType: 'citizen' | 'attester'
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('request_evidence')
      .select('id')
      .eq('request_id', String(requestId))
      .eq('contract_type', contractType)
      .eq('contract_address', currentContractAddress(contractType))
      .single();

    return !error && !!data;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// DEPRECATED FUNCTIONS (kept for backwards compatibility)
// ============================================================================

/**
 * @deprecated No longer needed - evidence stored directly in request_evidence table
 */
export async function createSupabaseRequestRecord(
  requestId: number,
  nftType: 'citizen' | 'attester',
  target: string,
  evidenceURI: string
): Promise<void> {
  console.log('⚠️ createSupabaseRequestRecord is deprecated - evidence now stored in request_evidence table');
  // No-op: request_evidence table doesn't need separate request records
}

/**
 * @deprecated Status is tracked on-chain, not in Supabase
 */
export async function updateSupabaseRequestStatus(
  requestId: number,
  status: 'pending' | 'approved' | 'rejected' | 'executed',
  attesterSignatures?: number,
  citizenSignatures?: number
): Promise<void> {
  console.log('⚠️ updateSupabaseRequestStatus is deprecated - status is tracked on-chain');
  // No-op: Status is tracked on blockchain, not in Supabase
}

/**
 * Fetch user's requests from Supabase request_evidence table
 *
 * @param address - User's wallet address
 * @param contractType - Optional filter by 'citizen' or 'attester'
 * @returns Array of evidence records
 */
export async function fetchUserRequests(
  address: string,
  contractType?: 'citizen' | 'attester'
) {
  console.log('📋 Fetching user requests from Supabase...');

  try {
    let query = supabase
      .from('request_evidence')
      .select('*')
      .eq('requester_address', address.toLowerCase())
      .order('created_at', { ascending: false });

    if (contractType) {
      query = query
        .eq('contract_type', contractType)
        .eq('contract_address', currentContractAddress(contractType));
    } else {
      query = query.in('contract_address', [
        currentContractAddress('citizen'),
        currentContractAddress('attester'),
      ]);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Supabase fetch error:', error);
      throw new Error(`Failed to fetch requests: ${error.message}`);
    }

    // Transform data to ensure correct types and defaults
    const transformedData = (data || []).map(req => ({
      ...req,
      // Parse request_id to number (stored as string in Supabase)
      request_id: typeof req.request_id === 'string' ? parseInt(req.request_id, 10) : req.request_id,
      // Ensure status exists (for old records before migration)
      status: req.status || 'pending',
      // Map nft_type (fallback to contract_type for old records)
      nft_type: req.nft_type || req.contract_type || 'citizen',
      // Ensure signature counts exist
      attester_signatures: req.attester_signatures ?? 0,
      citizen_signatures: req.citizen_signatures ?? 0,
    }));

    console.log(`✅ Fetched ${transformedData.length} requests`);
    console.log('📊 Transformed data sample:', transformedData[0] ? {
      request_id: transformedData[0].request_id,
      status: transformedData[0].status,
      nft_type: transformedData[0].nft_type,
      signatures: `${transformedData[0].attester_signatures}/${transformedData[0].citizen_signatures}`,
    } : 'No requests');

    return transformedData;
  } catch (error) {
    console.error('❌ Failed to fetch user requests:', error);
    throw error;
  }
}

/**
 * Fetch all requests from request_evidence table (for attesters/citizens to review)
 *
 * @param contractType - Filter by 'citizen' or 'attester' (optional)
 * @param limit - Maximum number of results (default: 50)
 * @returns Array of evidence records
 */
export async function fetchPendingRequests(
  contractType?: 'citizen' | 'attester',
  limit: number = 50
) {
  console.log('📋 Fetching pending requests from Supabase...');

  try {
    let query = supabase
      .from('request_evidence')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (contractType) {
      query = query
        .eq('contract_type', contractType)
        .eq('contract_address', currentContractAddress(contractType));
    } else {
      query = query.in('contract_address', [
        currentContractAddress('citizen'),
        currentContractAddress('attester'),
      ]);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Supabase fetch error:', error);
      throw new Error(`Failed to fetch pending requests: ${error.message}`);
    }

    console.log(`✅ Fetched ${data?.length || 0} pending requests`);
    return data || [];
  } catch (error) {
    console.error('❌ Failed to fetch pending requests:', error);
    throw error;
  }
}
