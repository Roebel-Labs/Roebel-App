"use client";

import { useActiveAccount, useReadContract } from "thirdweb/react";
import {
  attesterNFTContract,
  citizenNFTContract,
  ATTESTER_NFT_ABI,
  CITIZEN_NFT_ABI,
} from "@/lib/verification-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Request {
  id: number;
  requester: string;
  target: string;
  requestType: number;
  status: number;
  evidenceURI: string;
  signatureCount?: number;
  attesterSignatures?: number;
  citizenSignatures?: number;
  createdAt: number;
  contractType: "attester" | "citizen";
}

export function ActiveRequestsSection() {
  const account = useActiveAccount();
  const [userRequests, setUserRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get total request counts
  const { data: attesterRequestCount } = useReadContract({
    contract: attesterNFTContract,
    method: "function requestCount() view returns (uint256)",
  });

  const { data: citizenRequestCount } = useReadContract({
    contract: citizenNFTContract,
    method: "function requestCount() view returns (uint256)",
  });

  useEffect(() => {
    if (!account || (!attesterRequestCount && !citizenRequestCount)) {
      setIsLoading(false);
      return;
    }

    const fetchUserRequests = async () => {
      setIsLoading(true);
      const requests: Request[] = [];

      try {
        // Fetch attester requests (only last 10 to avoid too many RPC calls)
        if (attesterRequestCount) {
          const count = Number(attesterRequestCount);
          const startIndex = Math.max(0, count - 10);

          for (let i = count - 1; i >= startIndex; i--) {
            try {
              const { readContract } = await import("thirdweb");
              const request = await readContract({
                contract: attesterNFTContract,
                method:
                  "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 signatureCount, uint256 createdAt)",
                params: [BigInt(i)],
              });

              // Check if this request belongs to the user and is pending
              if (
                request[0].toLowerCase() === account.address.toLowerCase() &&
                request[3] === 0
              ) {
                // Status 0 = Pending
                requests.push({
                  id: i,
                  requester: request[0],
                  target: request[1],
                  requestType: request[2],
                  status: request[3],
                  evidenceURI: request[4],
                  signatureCount: Number(request[5]),
                  createdAt: Number(request[6]),
                  contractType: "attester",
                });
              }
            } catch (error) {
              console.error(`Error fetching attester request ${i}:`, error);
            }
          }
        }

        // Fetch citizen requests (only last 10 to avoid too many RPC calls)
        if (citizenRequestCount) {
          const count = Number(citizenRequestCount);
          const startIndex = Math.max(0, count - 10);

          for (let i = count - 1; i >= startIndex; i--) {
            try {
              const { readContract } = await import("thirdweb");
              const request = await readContract({
                contract: citizenNFTContract,
                method:
                  "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)",
                params: [BigInt(i)],
              });

              // Check if this request belongs to the user and is pending
              if (
                request[0].toLowerCase() === account.address.toLowerCase() &&
                request[3] === 0
              ) {
                // Status 0 = Pending
                requests.push({
                  id: i,
                  requester: request[0],
                  target: request[1],
                  requestType: request[2],
                  status: request[3],
                  evidenceURI: request[4],
                  attesterSignatures: Number(request[5]),
                  citizenSignatures: Number(request[6]),
                  createdAt: Number(request[7]),
                  contractType: "citizen",
                });
              }
            } catch (error) {
              console.error(`Error fetching citizen request ${i}:`, error);
            }
          }
        }

        setUserRequests(requests);
      } catch (error) {
        console.error("Error fetching user requests:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserRequests();
  }, [account, attesterRequestCount, citizenRequestCount]);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-24 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-medium text-foreground">
          📋 Aktive Verifizierungsanträge
        </h3>
        <Link
          href="/verifizierung"
          className="text-sm text-primary hover:text-primary/80 transition-colors"
        >
          Alle anzeigen →
        </Link>
      </div>

      {userRequests.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            Du hast keine aktiven Verifizierungsanträge.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/verifizierung/bescheiniger"
              className="inline-block bg-muted hover:bg-muted text-foreground px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Bescheiniger werden
            </Link>
            <Link
              href="/verifizierung/buerger"
              className="inline-block bg-black hover:bg-foreground/90 text-white px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Bürger werden
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {userRequests.map((request) => (
            <Link
              key={`${request.contractType}-${request.id}`}
              href={`/verifizierung/nachweis/${request.id}?contract=${request.contractType}`}
              className="block p-4 bg-muted hover:bg-accent border border-border hover:border-black rounded-lg transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {request.requestType === 0 ? "📝" : "🗑️"}
                  </span>
                  <h4 className="font-medium text-foreground">
                    {request.requestType === 0
                      ? "Attestierungsantrag"
                      : "Widerrufsantrag"}{" "}
                    #{request.id}
                  </h4>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-800 border border-yellow-200">
                  Ausstehend
                </span>
              </div>

              {/* Signature Progress */}
              <div className="mt-3">
                {request.contractType === "attester" ? (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${Math.min(((request.signatureCount || 0) / 2) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {request.signatureCount || 0} / 2 Unterschriften
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-24 text-xs">
                        Bescheiniger:
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(((request.attesterSignatures || 0) / 1) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {request.attesterSignatures || 0} / 1
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-24 text-xs">
                        Bürger:
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min((request.citizenSignatures || 0) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {request.citizenSignatures || 0} / 1
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                Erstellt am{" "}
                {new Date(request.createdAt * 1000).toLocaleDateString("de-DE")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
