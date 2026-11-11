/**
 * Narration of the Röbel Münzen explainer. One entry per scene; `seconds` is the scene length and
 * the sentences double as burned-in captions. Wording rule: always "Röbel Münzen", never "Währung".
 */
export const FPS = 30;

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
    seconds: 11,
    lines: [
      'Röbel lebt von den Menschen, die etwas tun.',
      'Die den Laden aufschließen, das Training leiten, das Fest aufbauen.',
      'Und von allen, die hingehen.',
    ],
  },
  {
    id: 'question',
    title: 'Wie sagt eine Stadt Danke?',
    seconds: 6,
    lines: ['Wie sagt eine Stadt dafür Danke?', 'In Röbel mit den Röbel Münzen.'],
  },
  {
    id: 'belonging',
    title: 'Dabeisein zählt',
    seconds: 11,
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
    seconds: 8,
    lines: ['Der Kreis wächst über Nachbarn:', 'Wer schon dabei ist, lädt die Nächsten ein.'],
  },
  {
    id: 'outro',
    title: '',
    seconds: 12,
    lines: [
      'Mehr Leute auf den Festen.',
      'Mehr Leben in den Läden.',
      'Mehr Stimmen, wenn es um Röbel geht.',
      'Röbel Münzen. Unser Dankeschön fürs Mitmachen.',
    ],
  },
];

export const sceneFrames = (scene: SceneScript) => Math.round(scene.seconds * FPS);
export const TOTAL_FRAMES = SCENES.reduce((sum, scene) => sum + sceneFrames(scene), 0);

/** Frame window of each caption line inside its scene, proportional to the line's length. */
export function captionWindows(scene: SceneScript): { text: string; from: number; to: number }[] {
  const total = sceneFrames(scene);
  const lead = 8;
  const usable = total - lead - 10;
  const chars = scene.lines.reduce((sum, line) => sum + line.length + 12, 0);
  let cursor = lead;
  return scene.lines.map((text) => {
    const span = (usable * (text.length + 12)) / chars;
    const window = { text, from: Math.round(cursor), to: Math.round(cursor + span) };
    cursor += span;
    return window;
  });
}
