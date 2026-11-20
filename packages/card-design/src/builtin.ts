// Built-in art shipped with the package (cut from the 4x community card masters by
// scripts/cut-builtin.mjs). Paths are relative to the package root. The `-dark`
// variants are for light finishes, `-gold` for the gold finish.
export const BUILTIN_ASSETS: Record<string, string> = {
  'builtin:roebel-mark': 'assets/builtin/roebel-mark.png',
  'builtin:roebel-mark-dark': 'assets/builtin/roebel-mark-dark.png',
  'builtin:person-laurel': 'assets/builtin/person-laurel.png',
  'builtin:person-laurel-dark': 'assets/builtin/person-laurel-dark.png',
  'builtin:roebel-mark-gold': 'assets/builtin/roebel-mark-gold.png',
  'builtin:person-laurel-gold': 'assets/builtin/person-laurel-gold.png',
};

/**
 * Asset id of an empty logo slot in templates. It has no art: renderers skip it
 * like any missing asset, editors show it as a drop target for the org's logo.
 */
export const LOGO_SLOT_ASSET = 'builtin:logo-slot';

export function isBuiltinAsset(id: string): boolean {
  return id.startsWith('builtin:');
}
