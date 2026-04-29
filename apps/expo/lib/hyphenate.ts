// Soft-hyphen (­) inserted at proper German break points so labels
// wrap cleanly inside narrow tiles. Invisible until the line breaks.
const SOFT = '­';

const HYPHENATIONS: Record<string, string> = {
  Veranstaltungen: `Veran${SOFT}staltungen`,
  Neuigkeiten: `Neuig${SOFT}keiten`,
  Gastronomie: `Gastro${SOFT}nomie`,
  Unternehmen: `Unter${SOFT}nehmen`,
  Marktplatz: `Markt${SOFT}platz`,
  Bürgerumfragen: `Bürger${SOFT}umfragen`,
  Sternfahrten: `Stern${SOFT}fahrten`,
  Wildtiere: `Wild${SOFT}tiere`,
};

export function hyphenate(label: string): string {
  return HYPHENATIONS[label] ?? label;
}
