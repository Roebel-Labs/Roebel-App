// The public, immutable face of a published design version: the metadata JSON at
// /api/credentials/designs/<sha> (the type's on-chain metadataURI) and its preview PNG at
// /<sha>/image. Never carries a holder value, an account address or a count.
// Relative imports only: loaded by `npx tsx --test`.
import type { CardDesign } from "@roebel/card-design";
import { publicBaseUrl } from "../config";
import type { DesignStore, VersionRow } from "./store";

export const SHA = /^[0-9a-f]{64}$/;

export type DesignMetadata = {
  name: string;
  description: string;
  image: string;
  properties: { kind: string; organisation: string | null; aiGenerated: boolean; designVersion: number; design: CardDesign };
};

export const designUrl = (sha: string) => `${publicBaseUrl()}/api/credentials/designs/${sha}`;
export const designImageUrl = (sha: string) => `${designUrl(sha)}/image`;

/** Field layers lose their free-text sample in public metadata (it could be a real name). */
export function publicDesign(d: CardDesign): CardDesign {
  return { ...d, layers: d.layers.map((l) => (l.type === "field" ? { ...l, sampleText: "" } : l)) };
}

export function designMetadataJson(v: VersionRow): DesignMetadata {
  return {
    name: v.meta.name,
    description: v.meta.description,
    image: designImageUrl(v.sha),
    properties: { kind: v.meta.kind, organisation: v.meta.organisation, aiGenerated: v.meta.aiGenerated, designVersion: v.version, design: publicDesign(v.design) },
  };
}

/** The version a public route may serve: a known sha that is not an abandoned publication attempt. */
export async function publicVersion(store: DesignStore, sha: string): Promise<VersionRow | null> {
  if (!SHA.test(sha)) return null;
  const v = await store.getVersion(sha);
  return v && v.status !== "abandoned" ? v : null;
}
