// The illustrated agent characters, client side. Names, roles and colours mirror the server catalog
// (apps/web/src/lib/chat/agent/characters.ts); artwork is built by scripts/build-agent-art.cjs. Small images
// ship in the bundle (tile 256², figure 720 px tall); the 1600 px figure and the share card come from the site.
import { API_BASE } from '../live-room/config';

import wolkeTile from '../assets/agents/wolke-tile.webp';
import wolkeFigure from '../assets/agents/wolke-full.webp';
import pilziTile from '../assets/agents/pilzi-tile.webp';
import pilziFigure from '../assets/agents/pilzi-full.webp';
import fritzTile from '../assets/agents/fritz-tile.webp';
import fritzFigure from '../assets/agents/fritz-full.webp';
import lumiTile from '../assets/agents/lumi-tile.webp';
import lumiFigure from '../assets/agents/lumi-full.webp';
import eikoTile from '../assets/agents/eiko-tile.webp';
import eikoFigure from '../assets/agents/eiko-full.webp';
import liloTile from '../assets/agents/lilo-tile.webp';
import liloFigure from '../assets/agents/lilo-full.webp';
import olliTile from '../assets/agents/olli-tile.webp';
import olliFigure from '../assets/agents/olli-full.webp';
import ottoTile from '../assets/agents/otto-tile.webp';
import ottoFigure from '../assets/agents/otto-full.webp';
import idaTile from '../assets/agents/ida-tile.webp';
import idaFigure from '../assets/agents/ida-full.webp';
import stineTile from '../assets/agents/stine-tile.webp';
import stineFigure from '../assets/agents/stine-full.webp';
import mariTile from '../assets/agents/mari-tile.webp';
import mariFigure from '../assets/agents/mari-full.webp';
import klaasTile from '../assets/agents/klaas-tile.webp';
import klaasFigure from '../assets/agents/klaas-full.webp';

const ART: Record<string, [string, string]> = {
  wolke: [wolkeTile, wolkeFigure],
  pilzi: [pilziTile, pilziFigure],
  fritz: [fritzTile, fritzFigure],
  lumi: [lumiTile, lumiFigure],
  eiko: [eikoTile, eikoFigure],
  lilo: [liloTile, liloFigure],
  olli: [olliTile, olliFigure],
  otto: [ottoTile, ottoFigure],
  ida: [idaTile, idaFigure],
  stine: [stineTile, stineFigure],
  mari: [mariTile, mariFigure],
  klaas: [klaasTile, klaasFigure],
};

export interface Character {
  id: string;
  name: string;
  species: string;
  feminine: boolean;
  role: string;
  tagline: string;
  personality: string;
  color: string;
  tile: string;
  figure: string;
  /** 1600 px figure on the website (Ansehen, share card). */
  large: string;
}

type Base = Omit<Character, 'tile' | 'figure' | 'large'>;

const BASE: Base[] = [
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

export const CHARACTERS: Character[] = BASE.map((c) => ({
  ...c,
  tile: ART[c.id][0],
  figure: ART[c.id][1],
  large: `${API_BASE}/agents/${c.id}/full.webp`,
}));

export function characterById(id: string | null | undefined): Character | null {
  return id ? CHARACTERS.find((c) => c.id === id) ?? null : null;
}

export function roleLine(c: Character): string {
  return `${c.feminine ? 'Agentin' : 'Agent'} für ${c.role}`;
}

/** Public page with a link preview, for "Teilen". */
export function shareUrl(c: Character, name: string): string {
  const n = name.trim() && name.trim() !== c.name ? `?name=${encodeURIComponent(name.trim())}` : '';
  return `${API_BASE}/ortis/agent/${c.id}${n}`;
}

/** Mecky's colour on the share and view screens (the default assistant has no character). */
export const MECKY_COLOR = '#BFD6EC';
