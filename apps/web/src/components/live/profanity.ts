// Small German/English blocklist for text that goes on air (support alert messages).
// Matching is on normalised word starts (leetspeak digits folded), so "Arschloch!!" and
// "4rsch" are caught but "Marsch" is not; a hit drops the message text, never the alert.

const STEMS = [
  "arsch",
  "fick",
  "fotze",
  "hure",
  "hurens",
  "wichs",
  "wixx",
  "wixer",
  "schlampe",
  "nutte",
  "missgeburt",
  "spast",
  "spasti",
  "behindert",
  "schwuchtel",
  "neger",
  "nigger",
  "kanake",
  "zigeuner",
  "nazi",
  "heil hitler",
  "sieg heil",
  "hitler",
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "scheiss",
  "scheiß",
  "kacke",
  "pisser",
  "penner",
  "vollidiot",
  "idiot",
  "drecksau",
  "dreckssau",
  "schwanz",
  "pimmel",
  "titten",
  "porn",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function normalise(text: string): string {
  return (
    " " +
    text
      .toLowerCase()
      .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
      .replace(/ss/g, "ß")
      .replace(/ß/g, "ss")
      .replace(/[^a-zäöüß\s]/g, "")
      .replace(/\s+/g, " ") +
    " "
  );
}

export function containsProfanity(text: string | null | undefined): boolean {
  if (!text) return false;
  const n = normalise(text);
  return STEMS.some((stem) => n.includes(" " + normalise(stem).trim()));
}

/** Returns the message if it is fit for air, otherwise null. */
export function cleanForAir(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  return containsProfanity(t) ? null : t;
}
