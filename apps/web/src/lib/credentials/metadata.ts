// ERC-1155 metadata JSON for credential types, served by the node (owner decision 1: the URL
// goes on chain, so name and art can be corrected without a transaction). Never carries an
// account address, holder or count.
// Relative imports only: loaded by `npx tsx --test`.
import { RESERVED_TYPE_IDS } from "@netizen-labs/credential-registry";
import type { Hex } from "viem";
import { publicBaseUrl } from "./config";
import type { ActionStatus, CredentialStore, Kind, TypeRow } from "./store";
import type { CardDesign } from "@roebel/card-design";
import { designImageUrl } from "./designs/public";
import type { DesignStore, VersionRow } from "./designs/store";

export type TypeMetadata = {
  name: string;
  description: string;
  image: string | null;
  properties: { kind: string; organisation: string | null; recognised: boolean; benefits: string[]; design?: CardDesign };
};

export function metadataUrl(typeId: Hex): string {
  return `${publicBaseUrl()}/api/credentials/types/${typeId.toLowerCase()}/metadata`;
}

/** With a live card design version (plan D2), `image` is its preview and `properties.design` the design. */
export function typeMetadataJson(t: TypeRow, org: { name: string } | null, live: VersionRow | null = null): TypeMetadata {
  return {
    name: t.name,
    description: t.description ?? "",
    image: live ? designImageUrl(live.sha) : t.imageUrl ?? null,
    properties: {
      kind: t.kind ?? "unknown",
      organisation: org?.name ?? null,
      recognised: t.recognised,
      benefits: [...t.benefits],
      ...(live ? { design: live.design } : {}),
    },
  };
}

// Copy mirrored from apps/expo/lib/credentials.ts CREDENTIAL_COPY (title, intro, benefit titles).
export const RESERVED_METADATA: Record<"citizen" | "attester" | "guest", TypeMetadata> = {
  citizen: {
    name: "Bürgerausweis",
    description:
      "Der Bürgerausweis ist dein digitaler Nachweis, dass du zu Röbel gehörst. Er ist an dich gebunden, kann nicht übertragen werden und wurde von anderen Bürger:innen bestätigt.",
    image: null,
    properties: {
      kind: "membership",
      organisation: null,
      recognised: true,
      benefits: ["Anonym abstimmen", "Röbel Münzen der Stadt", "Organisation gründen", "Einreichen & anbieten", "Bürger:innen bestätigen"],
    },
  },
  attester: {
    name: "Bescheiniger-Ausweis",
    description:
      "Als Bescheiniger:in trägst du Verantwortung für die Gemeinschaft: Du prüfst Anträge, bestätigst neue Bürger:innen und hältst gemeinsam mit anderen die Schlüssel für Auszählungen.",
    image: null,
    properties: {
      kind: "role",
      organisation: null,
      recognised: true,
      benefits: ["Neue Bürger:innen bestätigen", "Anträge prüfen", "Auszählungen freischalten", "Alles aus dem Bürgerausweis"],
    },
  },
  guest: {
    name: "Gastkarte",
    description:
      "Mit der Gastkarte entdeckst du Röbel: Veranstaltungen, Neuigkeiten, Anzeigen und die Menschen dahinter. Als Bürger:in kommen Mitbestimmung und die Röbel Münzen der Stadt dazu.",
    image: null,
    properties: {
      kind: "membership",
      organisation: null,
      recognised: true,
      benefits: ["Veranstaltungen & News", "Anzeigen ansehen", "Röbel Münzen sammeln", "Feedback geben"],
    },
  },
};

/** Metadata of a reserved community type, or null for any other id. */
export function reservedMetadataFor(typeId: Hex): TypeMetadata | null {
  const id = typeId.toLowerCase();
  for (const key of ["citizen", "attester", "guest"] as const) {
    if (RESERVED_TYPE_IDS[key].toLowerCase() === id) return RESERVED_METADATA[key];
  }
  return null;
}

/** The `--uris` values for the production deploy script (plan 1): citizen, attester, guest. */
export function reservedMetadataUrls(): { citizen: string; attester: string; guest: string } {
  return {
    citizen: metadataUrl(RESERVED_TYPE_IDS.citizen),
    attester: metadataUrl(RESERVED_TYPE_IDS.attester),
    guest: metadataUrl(RESERVED_TYPE_IDS.guest),
  };
}

const LIVE_ACTION: readonly ActionStatus[] = ["awaiting_confirmation", "submitted", "done"];

/**
 * What the metadata route serves for a type id, or null (404).
 *
 * Drafts: the metadataURI goes on chain with createType, and wallets may fetch it right after the
 * phone confirms, before the receipt or the 5-minute sync marks the row on chain. So a draft is
 * served while a createType action for it is live (awaiting and not past its time, submitted, or
 * done) and 404 otherwise (never prepared, cancelled, expired or failed), which keeps abandoned
 * drafts unpublished without ever breaking an on-chain URI.
 */
export async function metadataFor(store: CredentialStore, typeId: Hex, nowMs = Date.now(), designs?: DesignStore): Promise<TypeMetadata | null> {
  const reserved = reservedMetadataFor(typeId);
  if (reserved) return reserved;
  const type = await store.getType(typeId);
  if (!type) return null;
  if (type.chainStatus === "draft" && !(await hasLiveCreateAction(store, type, nowMs))) return null;
  const org = type.accountId ? await store.getAccount(type.accountId) : null;
  const live = designs ? await designs.liveVersionOfType(type.typeId) : null;
  return typeMetadataJson(type, org ? { name: org.name } : null, live);
}

async function hasLiveCreateAction(store: CredentialStore, t: TypeRow, nowMs: number): Promise<boolean> {
  if (!t.accountId) return false;
  const actions = await store.listActions({ accountId: t.accountId, statuses: LIVE_ACTION });
  return actions.some(
    (a) =>
      !(a.status === "awaiting_confirmation" && Date.parse(a.expiresAt) <= nowMs) &&
      a.steps.some((s) => s.fn === "createType" && s.orgId.toLowerCase() === t.orgId.toLowerCase() && s.localId.toLowerCase() === t.localId.toLowerCase()),
  );
}

export type DirectoryEntry = {
  typeId: Hex;
  kind: Kind | null;
  name: string;
  imageUrl: string | null;
  orgName: string | null;
  orgAccountId: string | null;
  recognised: boolean;
};

/** Public directory: types that are on chain and not retired. No address, no counts. */
export async function typeDirectory(store: CredentialStore): Promise<DirectoryEntry[]> {
  const types = await store.listTypes({ chainStatus: "onchain", includeRetired: false });
  const accountIds = [...new Set(types.map((t) => t.accountId).filter((a): a is string => !!a))];
  const names = new Map((await store.getAccounts(accountIds)).map((a) => [a.id, a.name]));
  return types
    .filter((t) => !t.retired)
    .map((t) => ({
      typeId: t.typeId,
      kind: t.kind,
      name: t.name,
      imageUrl: t.imageUrl,
      orgName: t.accountId ? names.get(t.accountId) ?? null : null,
      orgAccountId: t.accountId,
      recognised: t.recognised,
    }));
}
