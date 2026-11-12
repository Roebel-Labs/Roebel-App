// One-shot hints for cross-section navigation ("Zu den Routinen" from Für dich opens Funktionen › Routinen).
// The target section reads the hint once when it mounts.

export type SkillsTab = 'overview' | 'routines' | 'abilities' | 'integrations' | 'discover';

let skillsTab: SkillsTab | null = null;
let wikiSlug: string | null = null;

export function hintSkillsTab(tab: SkillsTab): void {
  skillsTab = tab;
}

export function takeSkillsTab(): SkillsTab | null {
  const t = skillsTab;
  skillsTab = null;
  return t;
}

export function hintWikiSlug(slug: string): void {
  wikiSlug = slug;
}

export function takeWikiSlug(): string | null {
  const s = wikiSlug;
  wikiSlug = null;
  return s;
}
