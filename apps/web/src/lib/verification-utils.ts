/**
 * Utility functions for the Verification System
 */

import { RequestStatus, RequestType, type Evidence } from "@/types/verification";

/**
 * Format request status for display
 */
export function formatRequestStatus(status: RequestStatus): string {
  switch (status) {
    case RequestStatus.Pending:
      return "Ausstehend";
    case RequestStatus.Approved:
      return "Genehmigt";
    case RequestStatus.Rejected:
      return "Abgelehnt";
    case RequestStatus.Executed:
      return "Ausgeführt";
    default:
      return "Unbekannt";
  }
}

/**
 * Format request type for display
 */
export function formatRequestType(type: RequestType): string {
  switch (type) {
    case RequestType.Attestation:
      return "Attestierung";
    case RequestType.Revocation:
      return "Widerruf";
    default:
      return "Unbekannt";
  }
}

/**
 * Get status color for badges
 */
export function getStatusColor(status: RequestStatus): string {
  switch (status) {
    case RequestStatus.Pending:
      return "bg-yellow-100 text-yellow-800";
    case RequestStatus.Approved:
      return "bg-blue-100 text-blue-800";
    case RequestStatus.Rejected:
      return "bg-red-100 text-red-800";
    case RequestStatus.Executed:
      return "bg-green-100 text-green-800";
    default:
      return "bg-muted text-foreground";
  }
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Shorten Ethereum address for display
 */
export function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Parse evidence from IPFS URI
 */
export async function fetchEvidence(evidenceURI: string): Promise<Evidence | null> {
  try {
    // Handle IPFS URIs
    let url = evidenceURI;
    if (evidenceURI.startsWith("ipfs://")) {
      // Use thirdweb IPFS gateway
      url = evidenceURI.replace("ipfs://", "https://ipfs.io/ipfs/");
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch evidence: ${response.statusText}`);
    }

    const evidence: Evidence = await response.json();
    return evidence;
  } catch (error) {
    console.error("Error fetching evidence:", error);
    return null;
  }
}

/**
 * Upload evidence to IPFS via thirdweb
 */
export async function uploadEvidenceToIPFS(evidence: Evidence): Promise<string> {
  try {
    // Use thirdweb's upload function
    const { upload } = await import("thirdweb/storage");
    const { client } = await import("@/app/client");

    const uri = await upload({
      client,
      files: [new File([JSON.stringify(evidence)], "evidence.json", { type: "application/json" })],
    });

    return uri;
  } catch (error) {
    console.error("Error uploading to IPFS:", error);
    throw new Error("Failed to upload evidence to IPFS");
  }
}

/**
 * Generate QR code data for request signing
 * Returns URL that can be scanned to open the app and sign
 */
export function generateRequestQRData(requestId: number, nftType: "attester" | "citizen"): string {
  // Get current app URL
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  // Generate deep link URL
  const url = `${baseUrl}/verification/sign/${nftType}/${requestId}`;

  return url;
}

/**
 * Calculate signature progress percentage
 */
export function calculateProgress(current: number, required: number): number {
  return Math.min(Math.round((current / required) * 100), 100);
}

/**
 * Check if request can be executed (has enough signatures)
 */
export function canExecuteRequest(
  signatureCount: number,
  requiredSignatures: number
): boolean {
  return signatureCount >= requiredSignatures;
}

/**
 * Get required signatures for request
 */
export function getRequiredSignatures(
  nftType: "attester" | "citizen",
  requestType: RequestType
): { attester?: number; citizen?: number; total?: number } {
  if (nftType === "attester") {
    // Attester NFT: 2 Attester signatures for both minting and revocation
    return { total: 2 };
  } else {
    // Citizen NFT
    if (requestType === RequestType.Attestation) {
      // Attestation: 1 Attester + 1 Citizen
      return { attester: 1, citizen: 1 };
    } else {
      // Revocation: 1 Attester
      return { total: 1 };
    }
  }
}

/**
 * Format signature progress for display
 */
export function formatSignatureProgress(
  nftType: "attester" | "citizen",
  requestType: RequestType,
  attesterSigs: number,
  citizenSigs?: number
): string {
  if (nftType === "attester") {
    return `${attesterSigs}/2 Attestierer`;
  } else {
    if (requestType === RequestType.Attestation) {
      return `${attesterSigs}/1 Attestierer, ${citizenSigs || 0}/1 Bürger`;
    } else {
      return `${attesterSigs}/1 Attestierer`;
    }
  }
}

/**
 * Validate legacy evidence data
 * Note: This validation is for legacy evidence format only.
 * Encrypted evidence has different validation (handled separately).
 */
export function validateEvidence(evidence: Partial<Evidence>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Type guard: check if this is legacy evidence (has 'name' field)
  const hasName = 'name' in evidence;

  if (hasName) {
    // Validate legacy evidence fields
    const legacyEvidence = evidence as any;

    if (!legacyEvidence.name || legacyEvidence.name.trim().length < 2) {
      errors.push("Name muss mindestens 2 Zeichen lang sein");
    }

    if (!legacyEvidence.address || legacyEvidence.address.trim().length < 5) {
      errors.push("Adresse muss mindestens 5 Zeichen lang sein");
    }

    if (!legacyEvidence.reason || legacyEvidence.reason.trim().length < 10) {
      errors.push("Begründung muss mindestens 10 Zeichen lang sein");
    }

    if (!legacyEvidence.date) {
      errors.push("Datum ist erforderlich");
    }
  } else {
    // For encrypted evidence, just check it has the required structure
    const encryptedEvidence = evidence as any;
    if (!encryptedEvidence.encrypted || !encryptedEvidence.metadata) {
      errors.push("Ungültiges verschlüsseltes Beweisformat");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
