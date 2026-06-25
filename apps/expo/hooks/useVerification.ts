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
import { gnosis } from '@/constants/gnosis';
import { client } from '@/constants/thirdweb';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { citizenNFTContract, attesterNFTContract } from '@/constants/verification-contracts';
import { createEncryptedEvidenceV2 } from '@/lib/encryption'; // revocation only
import { buildCitizenCommitment, loadCitizenPreimage } from '@/lib/citizen-commitment';
import {
  uploadEncryptedEvidence,
  uploadCommitmentEvidence,
  updateSupabaseRequestStatus,
  fetchPendingRequests,
} from '@/lib/supabase-verification';
import type { PersonalData, CitizenIdentity } from '@/lib/verification-types';

/**
 * Phases of the create-request flow. Drives the submit-button label so the user
 * sees progress through the 10-30s gas-less smart-account submission instead of
 * a single opaque spinner.
 */
export type RequestStage =
  | 'idle'
  | 'encrypting'
  | 'submitting-tx'
  | 'awaiting-receipt'
  | 'uploading-evidence'
  | 'saving-reference';

/** German labels for {@link RequestStage}, used by the submit button. */
export const REQUEST_STAGE_LABEL: Record<RequestStage, string> = {
  idle: 'Absenden',
  // 'encrypting' is the (now) commitment-preparation stage — the label reflects
  // that we build an on-device commitment, not encrypt server-stored PII.
  encrypting: 'Antrag wird vorbereitet',
  'submitting-tx': 'Antrag wird gesendet',
  'awaiting-receipt': 'Bestätigung wird abgewartet',
  'uploading-evidence': 'Nachweis wird hochgeladen',
  'saving-reference': 'Antrag wird gespeichert',
};

/**
 * Hook to create a citizen attestation request
 */
export function useCreateCitizenRequest() {
  // CitizenNFTv2 lives on Gnosis — sign + send with the Gnosis smart account
  // (same address as Base, gasless). gnosisAccount is null until the parallel
  // Gnosis session auto-connects.
  const { gnosisAccount } = useGnosisWallet();
  const account = gnosisAccount;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stage, setStage] = useState<RequestStage>('idle');

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
        const receipt = await waitForReceipt({ client, chain: gnosis, transactionHash });
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

  return { createRequest, isLoading, error, stage };
}

/**
 * Hook to create an attester (Bescheiniger) attestation request.
 *
 * Mirrors {@link useCreateCitizenRequest} but targets the AttesterNFT contract.
 * Exposes the same {@link RequestStage} so the submit button can show progress
 * (encrypting → submitting-tx → awaiting-receipt → uploading-evidence → saving).
 */
export function useCreateAttesterRequest() {
  // AttesterNFTv2 lives on Gnosis — sign + send with the Gnosis smart account.
  const { gnosisAccount } = useGnosisWallet();
  const account = gnosisAccount;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stage, setStage] = useState<RequestStage>('idle');

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
        const receipt = await waitForReceipt({ client, chain: gnosis, transactionHash });
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

  return { createRequest, isLoading, error, stage };
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
  // Revocations target the Gnosis v2 NFTs — sign + send with the Gnosis account.
  const { gnosisAccount } = useGnosisWallet();
  const account = gnosisAccount;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stage, setStage] = useState<RequestStage>('idle');

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

        setStage('encrypting');
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

        setStage('submitting-tx');
        const { transactionHash } = await sendTransaction({ transaction, account });
        console.log('✅ Revocation transaction submitted:', transactionHash);

        setStage('awaiting-receipt');
        const receipt = await waitForReceipt({ client, chain: gnosis, transactionHash });

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

        await uploadEncryptedEvidence(evidence, requestId, setStage);

        console.log(`✅ Revocation request created! ID: ${requestId}`);

        setStage('idle');
        setIsLoading(false);
        return { requestId, transactionHash };
      } catch (err) {
        console.error('❌ Failed to create revocation request:', err);
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setStage('idle');
        setIsLoading(false);
        throw error;
      }
    },
    [account]
  );

  return { createRevocation, isLoading, error, stage };
}

/**
 * Hook to approve a request
 */
export function useApproveRequest() {
  // Approvals hit the Gnosis v2 NFTs — send with the Gnosis smart account.
  const { gnosisAccount } = useGnosisWallet();
  const account = gnosisAccount;
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
  // Rejections hit the Gnosis v2 NFTs — send with the Gnosis smart account.
  const { gnosisAccount } = useGnosisWallet();
  const account = gnosisAccount;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const rejectRequest = useCallback(
    async (
      requestId: number,
      nftType: 'citizen' | 'attester' = 'citizen',
      signAsAttester = true,
    ) => {
      if (!account) {
        throw new Error('No wallet connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(`🚀 Rejecting ${nftType} request #${requestId}...`);

        let transaction;
        if (nftType === 'citizen') {
          // CitizenNFT.rejectRequest now requires role selection — single rejection
          // no longer auto-vetoes; needs both Attester+Citizen rejection thresholds.
          transaction = prepareContractCall({
            contract: citizenNFTContract,
            method: 'function rejectRequest(uint256 requestId, bool signAsAttester)',
            params: [BigInt(requestId), signAsAttester],
          });
        } else {
          transaction = prepareContractCall({
            contract: attesterNFTContract,
            method: 'function rejectRequest(uint256 requestId)',
            params: [BigInt(requestId)],
          });
        }

        const { transactionHash } = await sendTransaction({
          transaction,
          account,
        });

        console.log('✅ Rejection transaction submitted:', transactionHash);

        // NOTE: signature flips status only when BOTH role thresholds are met.
        // Keep Supabase optimistic only if your rules expect single-sig veto.
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
      const parsedRequest: any = {
        id: requestId,
        requester: requestData[0],
        target: requestData[1],
        requestType: Number(requestData[2]),
        status: Number(requestData[3]),
        evidenceURI: requestData[4],
        attesterSignatures: nftType === 'citizen' ? Number(requestData[5]) : Number(requestData[5]),
        citizenSignatures: nftType === 'citizen' ? Number(requestData[6]) : 0,
        createdAt: Number(requestData[nftType === 'citizen' ? 7 : 6]),
        requiredAttesters: 1,
        requiredCitizens: nftType === 'citizen' ? 1 : 0,
      };

      // v2: read the per-request required approval thresholds (percentage bands,
      // snapshotted at creation) so the UI shows the real X/Y instead of 1/1.
      try {
        if (nftType === 'citizen') {
          const [ra, rc] = await Promise.all([
            readContract({ contract, method: 'function requiredAttesterApprovalsFor(uint256) view returns (uint256)', params: [BigInt(requestId)] }),
            readContract({ contract, method: 'function requiredCitizenApprovalsFor(uint256) view returns (uint256)', params: [BigInt(requestId)] }),
          ]);
          parsedRequest.requiredAttesters = Number(ra);
          parsedRequest.requiredCitizens = Number(rc);
        } else {
          const ra = await readContract({ contract, method: 'function requiredApprovalsFor(uint256) view returns (uint256)', params: [BigInt(requestId)] });
          parsedRequest.requiredAttesters = Number(ra);
        }
      } catch (e) {
        console.log('required-approvals read failed (older contract?)', e);
      }

      setRequest(parsedRequest);

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

      setIsLoading(false);
    } catch (err) {
      console.error('❌ Failed to fetch request:', err);
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setIsLoading(false);
    }
  }, [requestId, nftType, account]);

  return { request, decryptedData, isLoading, error, fetchRequest };
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
