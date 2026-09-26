/**
 * Addresses → people. The UI never shows a raw 0x address (grandma test + product rule): every
 * guardian / recovering person is shown by name, resolved in this order:
 *   1. a Supabase profile on that wallet (legacy thirdweb accounts are the profile wallets today);
 *   2. a local label this device saved (the name from a scanned "Mein Konto-Code", or a person
 *      picked by name) — a family member's fresh passkey Safe has no profile;
 *   3. the legacy account(s) the address administers (a passkey Safe → its legacy → profile);
 *   4. "Unbekannte Person".
 */
import { getAddress, isAddressEqual, type Address } from 'viem';

export type ProfileRow = {
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  profile_picture_url?: string | null;
};

export type Person = {
  address: Address;
  name: string;
  /** false when nothing resolved and `name` is the "Unbekannte Person" placeholder. */
  known: boolean;
  avatarUrl: string | null;
  /** The profile wallet the name came from (the legacy account for a passkey Safe). */
  profileWallet: Address | null;
};

export type PeopleDeps = {
  fetchProfiles: (wallets: string[]) => Promise<ProfileRow[]>;
  labels: Record<string, string>;
  findLinkedLegacies?: (safe: Address) => Promise<Address[]>;
};

export const UNKNOWN_PERSON = 'Unbekannte Person';

export function profileName(row: Pick<ProfileRow, 'username' | 'display_name'> | null | undefined): string | null {
  const n = row?.display_name?.trim() || row?.username?.trim() || '';
  return n || null;
}

export async function resolvePeople(addresses: readonly Address[], deps: PeopleDeps): Promise<Map<string, Person>> {
  const unique: Address[] = [];
  for (const a of addresses) {
    const c = getAddress(a);
    if (!unique.some((u) => isAddressEqual(u, c))) unique.push(c);
  }
  const out = new Map<string, Person>();
  if (unique.length === 0) return out;

  const byWallet = new Map<string, ProfileRow>();
  const load = async (wallets: Address[]) => {
    if (wallets.length === 0) return;
    let rows: ProfileRow[] = [];
    try {
      rows = await deps.fetchProfiles(wallets.map((w) => w.toLowerCase()));
    } catch {
      rows = [];
    }
    for (const r of rows) if (r.wallet_address) byWallet.set(r.wallet_address.toLowerCase(), r);
  };
  await load(unique);

  const labelOf = (a: Address) => deps.labels[a.toLowerCase()]?.trim() || null;
  const unresolved: Address[] = [];
  for (const a of unique) {
    const row = byWallet.get(a.toLowerCase());
    const name = profileName(row);
    if (name) {
      out.set(a.toLowerCase(), { address: a, name, known: true, avatarUrl: row?.profile_picture_url ?? null, profileWallet: a });
      continue;
    }
    const label = labelOf(a);
    if (label) {
      out.set(a.toLowerCase(), { address: a, name: label, known: true, avatarUrl: null, profileWallet: null });
      continue;
    }
    unresolved.push(a);
  }

  if (unresolved.length > 0 && deps.findLinkedLegacies) {
    const links = await Promise.all(
      unresolved.map(async (a) => {
        try {
          return { a, legacies: await deps.findLinkedLegacies!(a) };
        } catch {
          return { a, legacies: [] as Address[] };
        }
      }),
    );
    await load(links.flatMap((l) => l.legacies));
    for (const { a, legacies } of links) {
      for (const l of legacies) {
        const row = byWallet.get(l.toLowerCase());
        const name = profileName(row);
        if (name) {
          out.set(a.toLowerCase(), { address: a, name, known: true, avatarUrl: row?.profile_picture_url ?? null, profileWallet: l });
          break;
        }
      }
    }
  }

  for (const a of unique) {
    if (!out.has(a.toLowerCase())) {
      out.set(a.toLowerCase(), { address: a, name: UNKNOWN_PERSON, known: false, avatarUrl: null, profileWallet: null });
    }
  }
  return out;
}

/** Adds / replaces one label (address keys lower-cased); returns a new map. */
export function withLabel(labels: Record<string, string>, address: Address, name: string | null): Record<string, string> {
  const n = name?.trim();
  if (!n) return labels;
  return { ...labels, [address.toLowerCase()]: n };
}
