/**
 * "Profil vervollständigen": which first-launch onboarding steps (app/welcome/*) a logged-in
 * person skipped, each with the route of the same step UI. Pure; works the same for thirdweb and
 * passkey sessions because it only reads the users row.
 *
 * Steps of the welcome flow: name → role → (Bürger: citizen data) → terms. The citizen request is
 * NOT listed here: the profile already shows its own "Bürger werden" banner for that. The photo is
 * not a wizard step but part of a complete profile, so it is listed too (edit-profile).
 */
import type { UserRecord } from '@/lib/types';

export type CompletionStepId = 'name' | 'photo' | 'role' | 'terms';

export type CompletionStep = {
  id: CompletionStepId;
  title: string;
  subtitle: string;
  route: string;
};

type UserLike = Pick<UserRecord, 'display_name' | 'profile_picture_url' | 'preferred_role' | 'terms_accepted_at' | 'auth_provider'>;

const STEPS: Record<CompletionStepId, Omit<CompletionStep, 'id'>> = {
  name: { title: 'Namen eintragen', subtitle: 'So erkennen dich andere in Röbel.', route: '/welcome/name?single=1' },
  photo: { title: 'Profilbild hinzufügen', subtitle: 'Ein Foto macht dein Profil persönlich.', route: '/edit-profile' },
  role: { title: 'Was trifft auf dich zu?', subtitle: 'Wir zeigen dir passende Funktionen.', route: '/welcome/role?single=1' },
  terms: {
    title: 'Nutzungsbedingungen bestätigen',
    subtitle: 'Einmal zustimmen, dann ist alles erledigt.',
    route: '/welcome/consent?single=1',
  },
};

const ORDER: CompletionStepId[] = ['name', 'photo', 'role', 'terms'];

export function missingProfileSteps(user: UserLike | null | undefined): CompletionStep[] {
  if (!user) return [];
  const missing = new Set<CompletionStepId>();
  // Apple Sign in policy: the name comes from Apple, the app never asks for it again.
  if (!user.display_name?.trim() && user.auth_provider !== 'apple') missing.add('name');
  if (!user.profile_picture_url?.trim()) missing.add('photo');
  if (!user.preferred_role) missing.add('role');
  if (!user.terms_accepted_at) missing.add('terms');
  return ORDER.filter((id) => missing.has(id)).map((id) => ({ id, ...STEPS[id] }));
}

/** "2 von 4 erledigt" */
export function completionProgress(missing: number, total = ORDER.length): string {
  const done = Math.max(0, Math.min(total, total - missing));
  return `${done} von ${total} erledigt`;
}

/** Whether a welcome screen runs as one standalone step (opened from the profile card). */
export function isSingleStep(param: string | string[] | undefined): boolean {
  const v = Array.isArray(param) ? param[0] : param;
  return v === '1' || v === 'true';
}
