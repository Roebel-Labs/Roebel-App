// Which soulbound credential cards an account holds and what each unlocks.
// Pure: no React, no assets (art lives in components/profile/credential-art.ts).

export type CredentialKind = 'guest' | 'citizen' | 'attester';

export type BenefitIcon =
  | 'vote'
  | 'coins'
  | 'org'
  | 'upload'
  | 'signature'
  | 'shield'
  | 'calendar'
  | 'listing'
  | 'feedback'
  | 'scan'
  | 'tally';

export type CredentialCta = {
  label: string;
  kind: 'become-citizen' | 'show-qr' | 'scan';
};

export type CredentialBenefit = { icon: BenefitIcon; title: string; desc: string };

export type CredentialCopy = {
  /** Screen-reader and explainer heading, e.g. "Bürgerausweis". */
  title: string;
  /** Short label printed on the card art, e.g. "Bürger". */
  label: string;
  intro: string;
  benefits: CredentialBenefit[];
  cta?: CredentialCta;
};

/**
 * Cards ordered back → front. Attesters always hold the citizen card too
 * (the contracts require it), so an attester flag implies both cards.
 */
export function credentialKindsFor(input: { isCitizen: boolean; isAttester: boolean }): CredentialKind[] {
  if (input.isAttester) return ['citizen', 'attester'];
  if (input.isCitizen) return ['citizen'];
  return ['guest'];
}

export const CREDENTIAL_COPY: Record<CredentialKind, CredentialCopy> = {
  guest: {
    title: 'Gastkarte',
    label: 'Gast',
    intro:
      'Mit der Gastkarte entdeckst du Röbel: Veranstaltungen, Neuigkeiten, Anzeigen und die Menschen dahinter. Als Bürger:in kommen Mitbestimmung und die Röbel Münzen der Stadt dazu.',
    benefits: [
      { icon: 'calendar', title: 'Veranstaltungen & News', desc: 'Alles, was in Röbel und an der Müritz passiert.' },
      { icon: 'listing', title: 'Anzeigen ansehen', desc: 'Kleinanzeigen, Angebote und Dienstleistungen aus der Region.' },
      { icon: 'coins', title: 'Röbel Münzen sammeln', desc: 'Deine persönlichen Münzen wachsen, sobald du dabei bist.' },
      { icon: 'feedback', title: 'Feedback geben', desc: 'Sag uns, was der App noch fehlt.' },
    ],
    cta: { label: 'Bürger:in werden', kind: 'become-citizen' },
  },
  citizen: {
    title: 'Bürgerausweis',
    label: 'Bürger',
    intro:
      'Der Bürgerausweis ist dein digitaler Nachweis, dass du zu Röbel gehörst. Er ist an dich gebunden, kann nicht übertragen werden und wurde von anderen Bürger:innen bestätigt.',
    benefits: [
      { icon: 'vote', title: 'Anonym abstimmen', desc: 'Nimm an Bürgerbefragungen teil. Deine Stimme bleibt geheim.' },
      { icon: 'coins', title: 'Röbel Münzen der Stadt', desc: 'Du erhältst stündlich Münzen und kannst sie in Röbel einsetzen.' },
      { icon: 'org', title: 'Organisation gründen', desc: 'Verein, Betrieb oder Fraktion mit eigenem Profil und Team.' },
      { icon: 'upload', title: 'Einreichen & anbieten', desc: 'Veranstaltungen, Anzeigen und Dienstleistungen veröffentlichen.' },
      { icon: 'signature', title: 'Bürger:innen bestätigen', desc: 'Gib deine Unterschrift, wenn jemand Neues dazukommt.' },
    ],
    cta: { label: 'Ausweis vorzeigen', kind: 'show-qr' },
  },
  attester: {
    title: 'Bescheiniger-Ausweis',
    label: 'Bescheiniger',
    intro:
      'Als Bescheiniger:in trägst du Verantwortung für die Gemeinschaft: Du prüfst Anträge, bestätigst neue Bürger:innen und hältst gemeinsam mit anderen die Schlüssel für Auszählungen.',
    benefits: [
      { icon: 'shield', title: 'Neue Bürger:innen bestätigen', desc: 'Deine Bescheinigung zählt mit größerem Gewicht.' },
      { icon: 'scan', title: 'Anträge prüfen', desc: 'Scanne den Ausweis-Code und prüfe Anträge vor Ort.' },
      { icon: 'tally', title: 'Auszählungen freischalten', desc: 'Drei von fünf Bescheiniger:innen geben eine Befragung zur Auszählung frei.' },
      { icon: 'vote', title: 'Alles aus dem Bürgerausweis', desc: 'Abstimmen, Münzen, Organisationen und Einreichungen bleiben enthalten.' },
    ],
    cta: { label: 'QR-Code scannen', kind: 'scan' },
  },
};
