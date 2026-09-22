// The two style directions per mode. Design mode always leads with "Plakativ"
// (Max's pick from the probe); the second direction depends on the category.
import type { PosterDirection, PosterMode } from "./types";

export const PLAKATIV: PosterDirection = {
  id: "plakativ",
  label: "Plakativ",
  brief:
    "Kraftvolles Plakat: großflächige, fette serifenlose Typografie, hoher Kontrast, starke Diagonalen oder Farbflächen in den Markenfarben (aus dem Referenzbild, sonst passend zur Kategorie), ein einziger Farbakzent nur für Datum und Uhrzeit, flächig-grafisch, druckfähig.",
};

export const ORIGINALTREU: PosterDirection = {
  id: "originaltreu",
  label: "Originaltreu",
  brief:
    "Gestaltung, Farben, Schrift-Charakter, Foto und Logo des Originals beibehalten; nur so weit umbauen, dass das DIN-A-Hochformat komplett gefüllt ist (Flächen erweitern, Elemente neu anordnen), kein Rand, kein Letterboxing.",
};

export const AUFGEFRISCHT: PosterDirection = {
  id: "aufgefrischt",
  label: "Aufgefrischt",
  brief:
    "Gleiche Inhalte und Markenfarben wie das Original, aber eine aufgeräumte, moderne Hierarchie: Titel groß oben, Foto oder Motiv als ruhige Fläche in der Mitte, Datum und Uhrzeit als klarer Block, Details unten klein; Logo originalgetreu übernehmen.",
};

export const FESTLICH: PosterDirection = {
  id: "festlich",
  label: "Festlich",
  brief:
    "Festlich und einladend: warme, helle Farben, freundliche Illustrationselemente (Wimpel, Lichter, Blätter) sparsam eingesetzt, Titel groß und freundlich, klare Infoblöcke; wirkt wie das Plakat eines Stadt- oder Vereinsfests.",
};

const SECOND_BY_CATEGORY: Record<string, PosterDirection> = {
  Sport: {
    id: "editorial",
    label: "Editorial",
    brief:
      "Ruhiges, editoriales Layout: viel Weißraum, feines Raster, eine kräftige Grotesk für den Titel und eine leichte für Details, Logo zentriert oben, dezente Linien als Struktur, ein kleines fotografisches Detail als Akzent; wirkt wie das Programmheft eines Profivereins.",
  },
  Musik: {
    id: "konzert",
    label: "Konzertplakat",
    brief:
      "Konzertplakat-Charakter: großes stimmungsvolles Motiv (Bühne, Instrument, Lichter), Titel als Blickfang in kräftiger Display-Typografie, Datum und Ort in einem kontrastreichen Block, leicht körnige Drucktextur, kein Neon-Glühen.",
  },
  Kultur: {
    id: "verspielt",
    label: "Verspielt",
    brief:
      "Freundlich-illustrativ: warme Farben, eine charaktervolle Display-Schrift für den Titel, einfache illustrative Formen oder ein Ausschnitt des Fotos als Motiv, viel Luft, klare Infoblöcke; wirkt wie ein hochwertiges Theater- oder Kinoplakat.",
  },
  Kirchliches: {
    id: "ruhig",
    label: "Ruhig",
    brief:
      "Ruhig und würdig: helle Fläche, eine elegante Serifenschrift für den Titel, dezente Ornamente oder ein Lichtmotiv, gedämpfte Farben (tiefes Blau, Gold, Creme), großzügige Ränder, sehr gute Lesbarkeit.",
  },
  Stadt: {
    id: "amtlich",
    label: "Amtlich",
    brief:
      "Klar und offiziell: Röbel-Navy #00498B als Hauptfarbe auf Weiß, strenge Struktur mit Linien und Blöcken, serifenlose Typografie, sachliche Infozeilen; wirkt wie eine hochwertige Bekanntmachung der Stadt.",
  },
  "Essen & Trinken": {
    id: "appetitlich",
    label: "Appetitlich",
    brief:
      "Warm und appetitlich: fotografisches Motiv aus dem Referenzbild oder passend zum Anlass, cremige Flächen, eine freundliche Schrift, Preis und Ort deutlich; wirkt wie das Plakat eines guten Restaurants.",
  },
  Ausstellungen: {
    id: "galerie",
    label: "Galerie",
    brief:
      "Galerie-Look: sehr reduziert, viel Weiß, Motiv frei stehend, kleine präzise Typografie, ein Farbakzent; wirkt wie eine Museumsankündigung.",
  },
};

export function pickDirections(
  mode: PosterMode,
  category?: string | null,
): [PosterDirection, PosterDirection] {
  if (mode === "reformat") return [ORIGINALTREU, AUFGEFRISCHT];
  const second = (category && SECOND_BY_CATEGORY[category]) || FESTLICH;
  return [PLAKATIV, second];
}
