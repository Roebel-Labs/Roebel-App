import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import type { PublicProfile } from "@/lib/user-types";

/**
 * Hook to fetch a privacy-filtered public profile for another user
 */
export function usePublicProfile(targetWallet: string) {
  const account = useActiveAccount();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      if (!targetWallet) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const viewerParam = account?.address
          ? `?viewer=${account.address}`
          : "";
        const response = await fetch(
          `/api/users/profile/${targetWallet}${viewerParam}`
        );
        const data = await response.json();

        if (data.success) {
          setProfile(data.profile);
        } else {
          setError(data.error || "Failed to load profile");
        }
      } catch (err) {
        console.error("Error fetching public profile:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [targetWallet, account?.address]);

  return { profile, isLoading, error };
}
