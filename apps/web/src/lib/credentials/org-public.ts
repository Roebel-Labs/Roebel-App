// The public side of an org's credentials (spec 5.3 / 5.6b): offices, the members who chose to be
// shown, and the org's badges. Names come only from claims the chain still shows (claimed_onchain
// and holds() true right now); a private acceptance never appears. People without a profile name
// are left out instead of being shown any other way. No address leaves this file.
// Relative imports only: loaded by `npx tsx --test`.
import type { Address, Hex } from "viem";
import { membersMayBePublic } from "./rights";
import type { CredentialStore, TypeRow, UserRow } from "./store";

export type PublicPerson = { displayName: string; avatarUrl: string | null; username: string | null };

export type OrgPublicView = {
  offices: { typeId: Hex; name: string; recognised: boolean; holders: PublicPerson[] }[];
  /** null: the org's members may not be public and nobody holds publicly. */
  publicMembers: PublicPerson[] | null;
  badges: { typeId: Hex; name: string; imageUrl: string | null; eventTitle: string | null; collected: number }[];
  /** The org has a membership type on chain (then the app replaces the old member section). */
  usesRegister: boolean;
};

export type OrgPublicReader = { holds(typeId: Hex, account: Address): Promise<boolean> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wallets that claimed this type publicly and still hold it on chain, in claim order, each once. */
async function publicHolders(store: CredentialStore, reader: OrgPublicReader, t: TypeRow): Promise<string[]> {
  const wallets: string[] = [];
  for (const i of await store.listInvitations({ typeId: t.typeId, statuses: ["accepted", "invited"] })) {
    const w = i.recipientWallet;
    if (!i.claimedOnchain || !w || wallets.includes(w)) continue;
    wallets.push(w);
  }
  const held = await Promise.all(wallets.map((w) => reader.holds(t.typeId, w as Address)));
  return wallets.filter((_, k) => held[k]);
}

export async function orgPublicCredentials(store: CredentialStore, reader: OrgPublicReader, accountId: string): Promise<OrgPublicView | null> {
  if (typeof accountId !== "string" || !UUID.test(accountId)) return null;
  const account = await store.getAccount(accountId);
  if (!account || account.accountType !== "organisation") return null;
  const types = (await store.listTypes({ accountId, includeRetired: false })).filter((t) => t.chainStatus === "onchain" && !t.retired);

  const roles = types.filter((t) => t.kind === "role").sort((a, b) => Number(b.recognised) - Number(a.recognised));
  const memberships = types.filter((t) => t.kind === "membership");
  const badgeTypes = types.filter((t) => t.kind === "badge");

  const officeWallets = await Promise.all(roles.map((t) => publicHolders(store, reader, t)));
  const memberWallets: string[] = [];
  for (const t of memberships) for (const w of await publicHolders(store, reader, t)) if (!memberWallets.includes(w)) memberWallets.push(w);

  const all = [...new Set([...officeWallets.flat(), ...memberWallets])];
  const users = new Map<string, UserRow>();
  if (all.length > 0) for (const u of await store.usersByWallets(all)) users.set(u.wallet.toLowerCase(), u);
  const person = (w: string): PublicPerson | null => {
    const u = users.get(w);
    if (!u || !u.displayName) return null;
    return { displayName: u.displayName, avatarUrl: u.avatarUrl, username: u.username ?? null };
  };
  const people = (ws: string[]) => ws.map(person).filter((p): p is PublicPerson => p !== null);

  const offices = roles.map((t, k) => ({ typeId: t.typeId, name: t.name, recognised: t.recognised, holders: people(officeWallets[k]) }));
  const members = people(memberWallets);
  const publicMembers = !membersMayBePublic(account) && members.length === 0 ? null : members;

  const badges = [];
  for (const t of badgeTypes) {
    const collected = new Set<string>();
    for (const i of await store.listInvitations({ typeId: t.typeId, statuses: ["accepted"] })) collected.add(i.recipientWallet ?? i.subject);
    const event = t.eventId ? await store.getEvent(t.eventId) : null;
    badges.push({ typeId: t.typeId, name: t.name, imageUrl: t.imageUrl, eventTitle: event?.title ?? null, collected: collected.size });
  }

  return { offices, publicMembers, badges, usesRegister: memberships.length > 0 };
}
