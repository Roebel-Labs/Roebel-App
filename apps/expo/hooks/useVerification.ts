/**
 * Verification System Hooks
 *
 * Custom hooks for blockchain interactions with the verification system
 */

import { useState, useCallback } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { prepareContractCall, readContract, sendTransaction } from 'thirdweb';
import { citizenNFTContract, attesterNFTContract } from '@/constants/verification-contracts';
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

/**
 * Hook to create a citizen attestation request
 */
export function useCreateCitizenRequest() {
  const account = useActiveAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createRequest = useCallback(
    async (personalData: PersonalData, reason: string) => {
      if (!account) {
        throw new Error('No wallet connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log('🚀 Creating citizen attestation request...');

        // 1. Create encrypted evidence (V2 - no signature required!)
        const evidence = await createEncryptedEvidenceV2(
          personalData,
          reason,
          'citizen',
          account
        );

        // 2. Create blockchain transaction (get request ID first)
        const transaction = prepareContractCall({
          contract: citizenNFTContract,
          method: 'function createAttestationRequest(string evidenceURI) returns (uint256)',
          params: ['supabase://pending'], // Temporary URI
        });

        const { transactionHash } = await sendTransaction({
          transaction,
          account,
        });

        console.log('✅ Transaction submitted:', transactionHash);

        // 3. Wait for transaction and get request ID
        // Note: In production, you'd listen for the event or query the contract
        // For now, we'll use requestCount - 1 as the request ID
        const requestCount = await readContract({
          contract: citizenNFTContract,
          method: 'function requestCount() view returns (uint256)',
          params: [],
        });

        const requestId = Number(requestCount) - 1;

        // 4. Upload evidence to Supabase
        const evidenceURI = await uploadEncryptedEvidence(evidence, requestId);

        // 5. Create Supabase request record
        await createSupabaseRequestRecord(
          requestId,
          'citizen',
          account.address,
          evidenceURI
        );

        console.log(`✅ Citizen request created successfully! ID: ${requestId}`);

        setIsLoading(false);
        return { requestId, transactionHash };
      } catch (err) {
        console.error('❌ Failed to create request:', err);
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setIsLoading(false);
        throw error;
      }
    },
    [account]
  );

  return { createRequest, isLoading, error };
}

/**
 * Hook to approve a request
 */
export function useApproveRequest() {
  const account = useActiveAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const approveRequest = useCallback(
    async (requestId: number, signAsAttester: boolean, nftType: 'citizen' | 'attester' = 'citizen') => {
      if (!account) {
        throw new Error('No wallet connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(`🚀 Approving ${nftType} request #${requestId}...`);

        let transaction;

        if (nftType === 'citizen') {
          // Citizen NFT approval (with role selection)
          transaction = prepareContractCall({
            contract: citizenNFTContract,
            method: 'function approveRequest(uint256 requestId, bool signAsAttester)',
            params: [BigInt(requestId), signAsAttester],
          });
        } else {
          // Attester NFT approval (no role selection)
          transaction = prepareContractCall({
            contract: attesterNFTContract,
            method: 'function approveRequest(uint256 requestId)',
            params: [BigInt(requestId)],
          });
        }

        const { transactionHash } = await sendTransaction({
          transaction,
          account,
        });

        console.log('✅ Approval transaction submitted:', transactionHash);

        // Update Supabase (signature counts will be updated by monitoring)
        // This is a simplified version - in production you'd listen for events
        setIsLoading(false);
        return { transactionHash };
      } catch (err) {
        console.error('❌ Failed to approve request:', err);
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setIsLoading(false);
        throw error;
      }
    },
    [account]
  );

  return { approveRequest, isLoading, error };
}

/**
 * Hook to reject a request
 */
export function useRejectRequest() {
  const account = useActiveAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const rejectRequest = useCallback(
    async (requestId: number, nftType: 'citizen' | 'attester' = 'citizen') => {
      if (!account) {
        throw new Error('No wallet connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(`🚀 Rejecting ${nftType} request #${requestId}...`);

        const contract = nftType === 'citizen' ? citizenNFTContract : attesterNFTContract;

        const transaction = prepareContractCall({
          contract,
          method: 'function rejectRequest(uint256 requestId)',
          params: [BigInt(requestId)],
        });

        const { transactionHash } = await sendTransaction({
          transaction,
          account,
        });

        console.log('✅ Rejection transaction submitted:', transactionHash);

        // Update Supabase
        await updateSupabaseRequestStatus(requestId, 'rejected');

        setIsLoading(false);
        return { transactionHash };
      } catch (err) {
        console.error('❌ Failed to reject request:', err);
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setIsLoading(false);
        throw error;
      }
    },
    [account]
  );

  return { rejectRequest, isLoading, error };
}

/**
 * Hook to fetch request details from blockchain + Supabase
 */
export function useRequestDetails(requestId: number, nftType: 'citizen' | 'attester') {
  const account = useActiveAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [request, setRequest] = useState<any | null>(null);
  const [evidence, setEvidence] = useState<EncryptedEvidence | null>(null);
  const [decryptedData, setDecryptedData] = useState<PersonalData | null>(null);

  const fetchRequest = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`📥 Fetching ${nftType} request #${requestId}...`);

      const contract = nftType === 'citizen' ? citizenNFTContract : attesterNFTContract;

      // Fetch from blockchain
      const requestData = await readContract({
        contract,
        method:
          nftType === 'citizen'
            ? 'function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)'
            : 'function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 signatureCount, uint256 createdAt)',
        params: [BigInt(requestId)],
      });

      // Parse request data
      const parsedRequest = {
        id: requestId,
        requester: requestData[0],
        target: requestData[1],
        requestType: Number(requestData[2]),
        status: Number(requestData[3]),
        evidenceURI: requestData[4],
        attesterSignatures: nftType === 'citizen' ? Number(requestData[5]) : Number(requestData[5]),
        citizenSignatures: nftType === 'citizen' ? Number(requestData[6]) : 0,
        createdAt: Number(requestData[nftType === 'citizen' ? 7 : 6]),
      };

      setRequest(parsedRequest);

      // Fetch evidence from Supabase by request ID
      try {
        const evidenceData = await fetchEvidenceByRequestId(requestId, nftType);
        setEvidence(evidenceData);

        // Try to decrypt if user is the requester
        if (account && evidenceData.metadata.requester.toLowerCase() === account.address.toLowerCase()) {
          try {
            const decrypted = await decryptEvidenceV2(evidenceData, account);
            setDecryptedData(decrypted);
          } catch (decryptError) {
            console.log('Could not decrypt (expected if not owner)');
          }
        }
      } catch (evidenceError) {
        console.log('Evidence not yet available (may still be uploading)');
      }

      setIsLoading(false);
    } catch (err) {
      console.error('❌ Failed to fetch request:', err);
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setIsLoading(false);
    }
  }, [requestId, nftType, account]);

  return { request, evidence, decryptedData, isLoading, error, fetchRequest };
}

/**
 * Hook to fetch all pending requests
 */
export function useAllPendingRequests(nftType?: 'citizen' | 'attester') {
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchPendingRequests(nftType);
      setRequests(data);
      setIsLoading(false);
    } catch (err) {
      console.error('❌ Failed to fetch requests:', err);
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setIsLoading(false);
    }
  }, [nftType]);

  return { requests, isLoading, error, fetchRequests };
}
