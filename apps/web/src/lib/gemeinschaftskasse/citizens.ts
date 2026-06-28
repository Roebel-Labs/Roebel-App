import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveIdentities } from "@/lib/muenzen/identity";

export interface CitizenProfile {
  address: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
  source: "citizen" | "account" | "circles" | "external";
}

/**
 * Resolve wallet addresses to citizen profiles, preferring the app `users`
 * table (the individual citizen), then the muenzen account/Circles identity,
 * then a generic "Externe Wallet" label. Never returns a raw 0x as `name`.
 */
export async function resolveCitizenProfiles(
  addresses: string[],
): Promise<Map<string, CitizenProfile>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))];
  const map = new Map<string, CitizenProfile>();
  if (uniq.length === 0) return map;

  // 1) Citizen users (wallet_address stored lowercase)
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("users")
      .select("wallet_address, username, display_name, profile_picture_url, is_verified_citizen")
      .in("wallet_address", uniq);
    for (const u of (data ?? []) as Array<{
      wallet_address: string | null;
      username: string | null;
      display_name: string | null;
      profile_picture_url: string | null;
      is_verified_citizen: boolean | null;
    }>) {
      const key = (u.wallet_address ?? "").toLowerCase();
      const name = u.display_name || u.username;
      if (!key || !name) continue;
      map.set(key, {
        address: key,
        name,
        username: u.username ?? null,
        avatarUrl: u.profile_picture_url ?? null,
        verified: !!u.is_verified_citizen,
        source: "citizen",
      });
    }
  } catch {
    /* fall through to identity fallback */
  }

  // 2) Fallback: muenzen account/Circles identity
  const unresolved = uniq.filter((a) => !map.has(a));
  if (unresolved.length) {
    try {
      const ids = await resolveIdentities(unresolved);
      for (const a of unresolved) {
        const id = ids.get(a);
        if (id?.name) {
          map.set(a, {
            address: a,
            name: id.name,
            username: null,
            avatarUrl: id.avatarUrl ?? null,
            verified: false,
            source: id.source === "circles" ? "circles" : "account",
          });
        }
      }
    } catch {
      /* fall through to external */
    }
  }

  // 3) External fallback
  for (const a of uniq) {
    if (!map.has(a)) {
      map.set(a, { address: a, name: "Externe Wallet", username: null, avatarUrl: null, verified: false, source: "external" });
    }
  }
  return map;
}
