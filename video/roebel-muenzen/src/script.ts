/**
 * Narration of the Röbel Münzen explainer. One entry per scene; `seconds` is the minimum scene length (the recorded voice sets the real one) and
 * the sentences double as burned-in captions. Wording rule: always "Röbel Münzen", never "Währung".
 */
import voice from './voice.json';

export const FPS = 30;

export interface Cue {
  text: string;
  from: number;
  to: number;
}

export type SceneId = 'town' | 'question' | 'belonging' | 'takingPart' | 'staysLocal' | 'neighbours' | 'outro';

export interface SceneScript {
  id: SceneId;
  title: string;
  seconds: number;
  lines: string[];
}

export const SCENES: SceneScript[] = [
  {
    id: 'town',
    title: 'Röbel lebt von seinen Menschen',
    seconds: 9,
    lines: [
      'Röbel lebt von den Menschen, die etwas tun.',
      'Die den Laden aufschließen, das Training leiten, das Fest aufbauen.',
      'Und von allen, die hingehen.',
    ],
  },
  {
    id: 'question',
    title: 'Wie sagt eine Stadt Danke?',
    seconds: 5.5,
    lines: ['Wie sagt eine Stadt dafür Danke?', 'In Röbel mit den Röbel Münzen.'],
  },
  {
    id: 'belonging',
    title: 'Dabeisein zählt',
    seconds: 10,
    lines: [
      'Wer als Bürgerin oder Bürger bestätigt ist, bekommt jeden Tag Röbel Münzen.',
      'Einfach, weil du dazugehörst.',
      'Alle gleich viel.',
    ],
  },
  {
    id: 'takingPart',
    title: 'Mitmachen zählt mehr',
    seconds: 12,
    lines: [
      'Und wer mit anpackt, bekommt mehr:',
      'Wer bei einem Vorhaben für Röbel hilft, wird mit Röbel Münzen belohnt.',
      'Und für einen guten Beitrag kannst du selbst welche verschenken.',
    ],
  },
  {
    id: 'staysLocal',
    title: 'Es bleibt in Röbel',
    seconds: 14,
    lines: [
      'Deine Röbel Münzen kannst du schon heute weitergeben:',
      'als Dankeschön, fürs Helfen, für gute Arbeit.',
      'Schritt für Schritt sollen auch Geschäfte und Vereine sie annehmen.',
      'So bleibt in Röbel, was in Röbel entsteht.',
    ],
  },
  {
    id: 'neighbours',
    title: 'Von Mensch zu Mensch',
    seconds: 7,
    lines: ['Der Kreis wächst über Nachbarn:', 'Wer schon dabei ist, lädt die Nächsten ein.'],
  },
  {
    id: 'outro',
    title: '',
    seconds: 10,
    lines: [
      'Mehr Leute auf den Festen.',
      'Mehr Leben in den Läden.',
      'Mehr Stimmen, wenn es um Röbel geht.',
      'Röbel Münzen. Unser Dankeschön fürs Mitmachen.',
    ],
  },
];

/** Frames of silence before the voice starts in each scene. */
export const VOICE_OFFSET = 10;

const VOICE: Record<string, { seconds: number; lines: { start: number; end: number }[] }> = voice;

/** Frame window of each spoken line inside its scene, taken from the recorded narration. */
export function cuesOf(scene: SceneScript): Cue[] {
  const lines = VOICE[scene.id].lines;
  return lines.map((line, i) => ({
    text: scene.lines[i],
    from: VOICE_OFFSET + Math.round(line.start * FPS),
    to: VOICE_OFFSET + Math.round((lines[i + 1]?.start ?? line.end + 0.5) * FPS),
  }));
}

/** A scene lasts as long as its narration plus a short tail, and never less than `seconds`. */
export const sceneFrames = (scene: SceneScript) => {
  const spoken = VOICE_OFFSET + Math.round(VOICE[scene.id].seconds * FPS) + (scene.id === 'outro' ? 96 : 26);
  return Math.max(Math.round(scene.seconds * FPS), spoken);
};
export const TOTAL_FRAMES = SCENES.reduce((sum, scene) => sum + sceneFrames(scene), 0);
