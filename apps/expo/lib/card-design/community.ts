// The community cards (Gast, Bürger, Bescheiniger) as designs: the same look as their PNGs
// (components/profile/credential-art.ts), drawn with Skia so the front card's sheen can follow
// the phone. No personal fields: these cards carry no name.
import { TEMPLATES, type CardDesign } from '@roebel/card-design';
import type { CredentialKind } from '@/lib/credentials';

const TEMPLATE_OF: Record<CredentialKind, string> = { guest: 'gast', citizen: 'buerger', attester: 'bescheiniger' };

export const COMMUNITY_DESIGNS: Record<CredentialKind, CardDesign> = Object.fromEntries(
  (Object.keys(TEMPLATE_OF) as CredentialKind[]).map((k) => [k, TEMPLATES.find((t) => t.id === TEMPLATE_OF[k])!.design]),
) as Record<CredentialKind, CardDesign>;
