/**
 * Preview-only demo of the Wahlhelfer co-sign, so the card and screen can be reviewed before a real
 * tally exists. Never on the production channel; the demo never reaches the server.
 */
import * as Updates from 'expo-updates';
import type { TallyDuty, TallyView } from './vorhaben';

export const DEMO_TALLY_KEY = 'vorschau';

export function isPreviewChannel(): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  let channel: string | null = null;
  try {
    channel = Updates.channel ?? null;
  } catch {
    channel = null;
  }
  return !!channel && channel !== 'production';
}

const DEMO_UNTIL = () => new Date(Date.now() + 5 * 86_400_000 + 3 * 3_600_000).toISOString();
const DEMO_TITLE = 'Neue Sitzbänke an der Uferpromenade';
const DEMO_TALLY_ADDRESS = '0x4b1d6c0e2a9f3e7d8c5b6a4f3e2d1c0b9a8f7e6d';

export function demoTallyDuty(): TallyDuty {
  return { proposalUuid: 'vorschau', proposalKey: DEMO_TALLY_KEY, proposalNumber: 4, title: DEMO_TITLE, until: DEMO_UNTIL() };
}

export function demoTallyView(): TallyView {
  return {
    proposalId: DEMO_TALLY_KEY, proposalNumber: 4, title: DEMO_TITLE,
    message:
      `Ich bestätige das Auszählungsergebnis von Vorschlag #4 „${DEMO_TITLE}“: Ja 14, Nein 3, Enthaltung 2. ` +
      `Auszählungsvertrag ${DEMO_TALLY_ADDRESS} auf Gnosis. ` +
      'Ergebnis-Hash 0x7c2e91d4a0b35f6e8d1c4b7a2f9e0d3c6b5a8f1e4d7c0b3a6f9e2d5c8b1a4f7e.',
    forVotes: '14', againstVotes: '3', abstainVotes: '2', tallyAddress: DEMO_TALLY_ADDRESS, until: DEMO_UNTIL(),
    eligible: true, confirmedAt: null, reward: { amount: '10', asset: 'MUENZEN' },
  };
}
