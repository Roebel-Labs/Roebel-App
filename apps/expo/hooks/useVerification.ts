/**
 * Verification System Hooks
 *
 * Custom hooks for blockchain interactions with the verification system
 */

import { useState, useCallback } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import {
  prepareContractCall,
  prepareEvent,
  parseEventLogs,
  readContract,
  sendTransaction,
  waitForReceipt,
} from 'thirdweb';
import { base } from 'thirdweb/chains';
import { client } from '@/constants/thirdweb';
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

        // 3. Wait for receipt and read the actual requestId from the event log.
        // Using requestCount() races against other users (and against tx mining),
        // which causes duplicate (request_id, contract_type) inserts in Supabase.
        const receipt = await waitForReceipt({
          client,
          chain: base,
          transactionHash,
        });

        const requestCreatedEvent = prepareEvent({
          signature:
            'event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
        });
        const events = parseEventLogs({
          events: [requestCreatedEvent],
          logs: receipt.logs,
        });
        const created = events[0];
        if (!created) {
          throw new Error('Could not read request ID from transaction receipt');
        }
        const requestId = Number(created.args.requestId);

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
 * Hook to create a revocation request (Attester or Citizen NFT)
 *
 * The encrypted reason is stuffed into the PersonalData shape so we can reuse
 * the existing V2 encryption + Irys upload pipeline. Target address is also
 * carried inside the encrypted blob (public on-chain anyway) for symmetry with
 * decryption helpers.
 */
export function useCreateRevocationRequest() {
  const account = useActiveAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createRevocation = useCallback(
    async (params: {
      contractType: 'attester' | 'citizen';
      target: string;
      reason: string;
    }) => {
      if (!account) {
        throw new Error('No wallet connected');
      }

      const { contractType, target, reason } = params;

      if (!target || !/^0x[a-fA-F0-9]{40}$/.test(target)) {
        throw new Error('Ungültige Zieladresse');
      }
      if (!reason || reason.trim().length < 20) {
        throw new Error('Begründung muss mindestens 20 Zeichen enthalten');
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(`🚀 Creating ${contractType} revocation request for ${target}...`);

        const evidence = await createEncryptedEvidenceV2(
          { name: reason.trim(), address: target.toLowerCase() },
          'Mitgliedschaftsentziehung',
          contractType,
          account
        );

        const contract = contractType === 'citizen' ? citizenNFTContract : attesterNFTContract;

        const transaction = prepareContractCall({
          contract,
          method: 'function createRevocationRequest(address target, string evidenceURI)',
          params: [target, 'supabase://pending'],
        });

        const { transactionHash } = await sendTransaction({ transaction, account });
        console.log('✅ Revocation transaction submitted:', transactionHash);

        const receipt = await waitForReceipt({ client, chain: base, transactionHash });

        const revocationEvent = prepareEvent({
          signature:
            'event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)',
        });
        const events = parseEventLogs({ events: [revocationEvent], logs: receipt.logs });
        const created = events[0];
        if (!created) {
          throw new Error('Konnte Antrags-ID nicht aus der Transaktion lesen');
        }
        const requestId = Number(created.args.requestId);

        await uploadEncryptedEvidence(evidence, requestId);

        console.log(`✅ Revocation request created! ID: ${requestId}`);

        setIsLoading(false);
        return { requestId, transactionHash };
      } catch (err) {
        console.error('❌ Failed to create revocation request:', err);
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setIsLoading(false);
        throw error;
      }
    },
    [account]
  );

  return { createRevocation, isLoading, error };
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
