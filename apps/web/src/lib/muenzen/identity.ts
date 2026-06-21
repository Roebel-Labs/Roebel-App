// Name-first identity resolution for the console (project rule: never show raw
// 0x… as the primary identity). Resolves an address to an app account name +
// avatar first, then falls back to the Circles avatar name. Server-only.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAvatarsBatch } from "./circles-rpc";
import { ADDR } from "./constants";

export interface Identity {
  address: string;
  name: string | null;
  avatarUrl: string | null;
  source: "app" | "circles" | "system" | null;
}

/** Well-known system wallets get a friendly label even without an account. */
const SYSTEM_LABELS: Record<string, string> = {
  [ADDR.group.toLowerCase()]: "Röbel Münzen (Gruppe)",
  [ADDR.vault.toLowerCase()]: "Sicherheiten-Tresor",
  [ADDR.safe.toLowerCase()]: "Stadtkasse (Safe)",
  [ADDR.funder.toLowerCase()]: "Funder (Betriebskasse)",
  [ADDR.service.toLowerCase()]: "Einladungs-Bot",
  [ADDR.metri.toLowerCase()]: "Stadt-Wallet (Metri)",
  [ADDR.mintHandler.toLowerCase()]: "Mint-Handler",
  "0x0000000000000000000000000000000000000000": "Neu erzeugt (Mint)",
};

/**
 * Resolve a batch of addresses to display identities. App accounts take
 * precedence over Circles avatars; system wallets are labeled by role.
 */
export async function resolveIdentities(addresses: string[]): Promise<Map<string, Identity>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))];
  const map = new Map<string, Identity>();
  uniq.forEach((a) =>
    map.set(a, {
      address: a,
      name: SYSTEM_LABELS[a] ?? null,
      avatarUrl: null,
      source: SYSTEM_LABELS[a] ? "system" : null,
    }),
  );
  if (uniq.length === 0) return map;

  // 1) App accounts via account_owners → accounts. Wallets are stored
  //    checksummed, so we fetch all (small table) and match case-insensitively.
  try {
    const supabase = createAdminClient();
    const { data: owners } = await supabase
      .from("account_owners")
      .select("wallet_address, account_id");
    const accountIdByWallet = new Map<string, string>();
    (owners ?? []).forEach((o: { wallet_address: string | null; account_id: string }) => {
      if (o.wallet_address) accountIdByWallet.set(o.wallet_address.toLowerCase(), o.account_id);
    });
    const neededIds = [
      ...new Set(uniq.map((a) => accountIdByWallet.get(a)).filter(Boolean) as string[]),
    ];
    if (neededIds.length) {
      const { data: accs } = await supabase
        .from("accounts")
        .select("id, name, avatar_url")
        .in("id", neededIds);
      const accById = new Map(
        (accs ?? []).map((a: { id: string; name: string | null; avatar_url: string | null }) => [
          a.id,
          a,
        ]),
      );
      for (const a of uniq) {
        if (map.get(a)?.source === "system") continue;
        const accId = accountIdByWallet.get(a);
        const acc = accId ? accById.get(accId) : null;
        if (acc?.name) {
          map.set(a, { address: a, name: acc.name, avatarUrl: acc.avatar_url ?? null, source: "app" });
        }
      }
    }
  } catch {
    /* app accounts unavailable — fall through to Circles */
  }

  // 2) Circles avatar fallback for anything still unresolved.
  const unresolved = uniq.filter((a) => !map.get(a)?.name);
  if (unresolved.length) {
    const avatars = await getAvatarsBatch(unresolved, true);
    for (const a of unresolved) {
      const av = avatars.get(a);
      if (av?.name) {
        map.set(a, { address: a, name: av.name, avatarUrl: av.imageUrl, source: "circles" });
      }
    }
  }

  return map;
}
