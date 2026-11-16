// The illustrated agent characters, client side. MUST STAY IN SYNC with the server catalogue in
// apps/web/src/lib/chat/agent/characters.ts (ids, names, roles, taglines, default personality, colours).
// Artwork is never bundled: it is served by the website under /agents/<id>/ and loaded with expo-image.

export interface AgentCharacter {
  id: string;
  name: string;
  /** "der Otter", "die Igelin" */
  species: string;
  feminine: boolean;
  /** Focus, completes "Agent(in) für …". */
  role: string;
  tagline: string;
  /** Default personality preset key. */
  personality: string;
  color: string;
}

export const AGENT_CHARACTERS: AgentCharacter[] = [
  { id: 'wolke', name: 'Wolke', species: 'das Schaf', feminine: true, role: 'Termine und Kalender', tagline: 'Sorgt dafür, dass alle pünktlich sind.', personality: 'gruendlich', color: '#A9C79F' },
  { id: 'pilzi', name: 'Pilzi', species: 'der Fliegenpilz', feminine: true, role: 'Vereine und Gemeinschaft', tagline: 'Zeigt, was im Ort gerade wächst.', personality: 'herzlich', color: '#CFE3BE' },
  { id: 'fritz', name: 'Fritz', species: 'der Findling', feminine: false, role: 'Archiv und Gedächtnis', tagline: 'Vergisst nie etwas.', personality: 'gruendlich', color: '#CFE0E4' },
  { id: 'lumi', name: 'Lumi', species: 'das Glühwürmchen', feminine: true, role: 'Benachrichtigungen und die Nacht', tagline: 'Leuchtet auf, wenn etwas Wichtiges passiert.', personality: 'direkt', color: '#E6E9C4' },
  { id: 'eiko', name: 'Eiko', species: 'die Eichel', feminine: false, role: 'Sparen und Finanzen', tagline: 'Behält jeden Cent im Blick.', personality: 'gruendlich', color: '#F0D79B' },
  { id: 'lilo', name: 'Lilo', species: 'der Seerosenfrosch', feminine: true, role: 'den See, das Wetter und die Badestellen', tagline: 'Weiß, wann das Wasser warm genug ist.', personality: 'locker', color: '#F5D6E0' },
  { id: 'olli', name: 'Olli', species: 'der Fischadler', feminine: false, role: 'Nachrichten und lokale Neuigkeiten', tagline: 'Sieht alles von oben.', personality: 'direkt', color: '#C7D2EE' },
  { id: 'otto', name: 'Otto', species: 'der Otter', feminine: false, role: 'den Marktplatz und lokale Geschäfte', tagline: 'Kennt jeden Laden am Markt.', personality: 'locker', color: '#AFD6D2' },
  { id: 'ida', name: 'Ida', species: 'die Igelin', feminine: true, role: 'Nachbarschaftshilfe und Fürsorge', tagline: 'Hat immer ein offenes Ohr.', personality: 'herzlich', color: '#CDB9DE' },
  { id: 'stine', name: 'Stine', species: 'die Störchin', feminine: true, role: 'Post und Zustellung', tagline: 'Bringt alles sicher ans Ziel.', personality: 'standard', color: '#F2CBB5' },
  { id: 'mari', name: 'Mari', species: 'die Maräne', feminine: true, role: 'Tourismus und Ausflüge', tagline: 'Kennt jede Ecke am See.', personality: 'herzlich', color: '#F6D3A6' },
  { id: 'klaas', name: 'Klaas', species: 'der Klabautermann', feminine: false, role: 'Nachtwache und Sicherheit', tagline: 'Hält Wache, wenn alle schlafen.', personality: 'direkt', color: '#D8C8A8' },
];

/** Mecky's colour on the roster and detail screens (the default assistant has no character). */
export const MECKY_COLOR = '#BFD6EC';

/** Origin that serves the artwork and the public share page. */
export const AGENT_SITE_ORIGIN = 'https://www.roebel.app';

export function characterById(id: unknown): AgentCharacter | null {
  return typeof id === 'string' && id ? AGENT_CHARACTERS.find((c) => c.id === id) ?? null : null;
}

/** "Agentin für Termine und Kalender" */
export function characterRoleLine(c: Pick<AgentCharacter, 'feminine' | 'role'>): string {
  return `${c.feminine ? 'Agentin' : 'Agent'} für ${c.role}`;
}

/**
 * Remote artwork: `full` = transparent figure (about 1000 × 1600), `tile` = 132 px square on the
 * character's colour (avatars), `card` = 1200 × 630 share card.
 */
export function characterArt(id: string): { full: string; tile: string; card: string } {
  const base = `${AGENT_SITE_ORIGIN}/agents/${encodeURIComponent(id)}`;
  return { full: `${base}/full.webp`, tile: `${base}/mail.png`, card: `${base}/card.png` };
}

/** Public page with a link preview, for "Teilen". The name is only sent when it differs from the character's. */
export function agentShareUrl(c: Pick<AgentCharacter, 'id' | 'name'>, name: string): string {
  const n = name.trim();
  const query = n && n !== c.name ? `?name=${encodeURIComponent(n.slice(0, 30))}` : '';
  return `${AGENT_SITE_ORIGIN}/ortis/agent/${encodeURIComponent(c.id)}${query}`;
}

/** A character other than `currentId`, picked by `random` (0..1). */
export function shuffleCharacter(currentId: string | null | undefined, random: number = Math.random()): AgentCharacter {
  const others = AGENT_CHARACTERS.filter((c) => c.id !== currentId);
  const pool = others.length ? others : AGENT_CHARACTERS;
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(random * pool.length)));
  return pool[i];
}
