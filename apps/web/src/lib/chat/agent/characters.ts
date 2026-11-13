// The illustrated agent characters (Ortis KI-Agenten). A person can take on any of them as an own agent: a
// user-owned chat bot whose avatar carries the character id. Artwork lives in public/agents/<id>/ (built by
// apps/studio/scripts/build-agent-art.cjs); the studio keeps its own copy of the visual data.
// No imports on purpose: the chat store pulls this in to validate avatars.

export interface AgentCharacter {
  id: string;
  name: string;
  /** "der Otter", "die Igelin" */
  species: string;
  feminine: boolean;
  /** Focus, completes "Agent(in) für …". */
  role: string;
  tagline: string;
  personality: string;
  color: string;
}

export const AGENT_CHARACTERS: AgentCharacter[] = [
  { id: "wolke", name: "Wolke", species: "das Schaf", feminine: true, role: "Termine und Kalender", tagline: "Sorgt dafür, dass alle pünktlich sind.", personality: "gruendlich", color: "#A9C79F" },
  { id: "pilzi", name: "Pilzi", species: "der Fliegenpilz", feminine: true, role: "Vereine und Gemeinschaft", tagline: "Zeigt, was im Ort gerade wächst.", personality: "herzlich", color: "#CFE3BE" },
  { id: "fritz", name: "Fritz", species: "der Findling", feminine: false, role: "Archiv und Gedächtnis", tagline: "Vergisst nie etwas.", personality: "gruendlich", color: "#CFE0E4" },
  { id: "lumi", name: "Lumi", species: "das Glühwürmchen", feminine: true, role: "Benachrichtigungen und die Nacht", tagline: "Leuchtet auf, wenn etwas Wichtiges passiert.", personality: "direkt", color: "#E6E9C4" },
  { id: "eiko", name: "Eiko", species: "die Eichel", feminine: false, role: "Sparen und Finanzen", tagline: "Behält jeden Cent im Blick.", personality: "gruendlich", color: "#F0D79B" },
  { id: "lilo", name: "Lilo", species: "der Seerosenfrosch", feminine: true, role: "den See, das Wetter und die Badestellen", tagline: "Weiß, wann das Wasser warm genug ist.", personality: "locker", color: "#F5D6E0" },
  { id: "olli", name: "Olli", species: "der Fischadler", feminine: false, role: "Nachrichten und lokale Neuigkeiten", tagline: "Sieht alles von oben.", personality: "direkt", color: "#C7D2EE" },
  { id: "otto", name: "Otto", species: "der Otter", feminine: false, role: "den Marktplatz und lokale Geschäfte", tagline: "Kennt jeden Laden am Markt.", personality: "locker", color: "#AFD6D2" },
  { id: "ida", name: "Ida", species: "die Igelin", feminine: true, role: "Nachbarschaftshilfe und Fürsorge", tagline: "Hat immer ein offenes Ohr.", personality: "herzlich", color: "#CDB9DE" },
  { id: "stine", name: "Stine", species: "die Störchin", feminine: true, role: "Post und Zustellung", tagline: "Bringt alles sicher ans Ziel.", personality: "standard", color: "#F2CBB5" },
  { id: "mari", name: "Mari", species: "die Maräne", feminine: true, role: "Tourismus und Ausflüge", tagline: "Kennt jede Ecke am See.", personality: "herzlich", color: "#F6D3A6" },
  { id: "klaas", name: "Klaas", species: "der Klabautermann", feminine: false, role: "Nachtwache und Sicherheit", tagline: "Hält Wache, wenn alle schlafen.", personality: "direkt", color: "#D8C8A8" },
];

/** Mirrors PERSONALITIES keys in ./profile (kept here so the store can validate without a cycle). */
export const PERSONALITY_KEYS = ["standard", "direkt", "herzlich", "gruendlich", "locker"] as const;

export function characterById(id: unknown): AgentCharacter | null {
  return typeof id === "string" ? AGENT_CHARACTERS.find((c) => c.id === id) ?? null : null;
}

/** "Agentin für Termine und Kalender" */
export function characterRoleLine(c: AgentCharacter): string {
  return `${c.feminine ? "Agentin" : "Agent"} für ${c.role}`;
}

/** The instruction block that makes the bot this character. */
export function characterPrompt(c: AgentCharacter, name: string): string {
  return `Du bist ${name}, ${c.species}, ${characterRoleLine(c)}. ${c.tagline} Darauf bist du spezialisiert und denkst dort von dir aus mit, du hilfst aber bei allem, worum dich der Mensch bittet.`;
}

/** Public artwork paths, relative to the site origin. */
export const characterArt = (id: string) => ({
  full: `/agents/${id}/full.webp`,
  mail: `/agents/${id}/mail.png`,
  card: `/agents/${id}/card.png`,
});
