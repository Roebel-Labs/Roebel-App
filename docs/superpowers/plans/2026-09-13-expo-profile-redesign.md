# Expo Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Expo profile screen around peeking credential cards, a glass account switcher, rounded-square action tiles, an org mode, and a crafted golden Münzen button with a coin-flip claim animation; rework the credential explainer into a swipeable card screen.

**Architecture:** `app/profile.tsx` becomes a thin composition of focused components under `components/profile/`. Pure decisions (which cards, which actions, header title, daily-mint math) live in `lib/` and are unit-tested. The daily mint reuses the Röbel Taler provider's settlement queue and the same AsyncStorage keys as the Münzen page, so both screens agree.

**Tech Stack:** Expo SDK 56, React Native 0.85, expo-router, `StyleSheet` + `useTheme()`, react-native-reanimated 4.3, expo-linear-gradient, expo-blur (via `GlassSurface`), expo-haptics, react-native-qrcode-svg, jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-13-expo-profile-redesign-design.md`

## Global Constraints

- Styling: `StyleSheet.create()` + `useTheme()`; NO NativeWind. Fonts via `fontFamily` tokens from `constants/theme.ts` (legacy `Inter-*` keys are aliases and still render).
- UI copy German; identifiers and comments English. Never write "CRC"; the currency is "Röbel Münzen" / "Münzen".
- Never show raw wallet addresses.
- Glass: `GlassSurface` must be the first child of a transparent, `overflow: 'hidden'` container; the bottom nav stays the only `androidExperimentalBlur` sampler on `/profile`.
- Reanimated: keep worklet bodies inline in `useAnimatedStyle`; any helper called from a worklet needs the `'worklet'` directive.
- Shadows via `boxShadow` (`lib/shadow.ts` style), never `elevation`.
- Haptics only when `Platform.OS !== 'web'`.
- Package manager: pnpm. Run jest from `apps/expo` with `CI=true npx jest <path> --watchAll=false`.
- Type-check touched files only: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "<touched paths>"`; the repo baseline has ~1235 unrelated errors.
- Commit after every task (`git add <files>`; never `git add .`), message prefixed `feat(expo):` / `test(expo):` / `chore(expo):`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Push the branch `feat/profile-redesign` after each commit.
- Never run `eas update`; Max ships builds himself.

## File map

| Path | Responsibility |
|---|---|
| `apps/expo/scripts/render-credential-cards.mjs` | SVG → PNG (2x/3x) for the three cards |
| `apps/expo/assets/cards/png/*.png` | rendered card art |
| `apps/expo/components/profile/credential-art.ts` | `require`s for card PNGs |
| `apps/expo/lib/credentials.ts` | `CredentialKind`, `credentialKindsFor`, explainer copy |
| `apps/expo/lib/muenzen-daily-mint.ts` | daily-mint constants and pure helpers (shared with Münzen page) |
| `apps/expo/lib/profile-header.ts` | header title per active account |
| `apps/expo/lib/profile-actions.ts` | tile lists for personal and org |
| `apps/expo/components/PressableScale.tsx` | spring-scale pressable primitive |
| `apps/expo/components/GlassPill.tsx` | frosted pill (header switcher) |
| `apps/expo/components/profile/CredentialCard.tsx` | one card image |
| `apps/expo/components/profile/CredentialCardStack.tsx` | peeking stack on the profile |
| `apps/expo/components/profile/CredentialCarousel.tsx` | swipeable full cards on the explainer |
| `apps/expo/components/profile/CredentialQrSheet.tsx` | citizen QR bottom drawer |
| `apps/expo/components/profile/ProfileSheet.tsx` | white content surface with top radius |
| `apps/expo/components/profile/ProfileHeader.tsx` | title + glass switcher pill |
| `apps/expo/components/profile/IdentityRow.tsx` | avatar/name/"Zum Profil" + right slot |
| `apps/expo/components/profile/OrgIdentityRow.tsx` | org avatar/name + Mitglieder pill |
| `apps/expo/hooks/useOrgMemberPreview.ts` | member avatars for the pill |
| `apps/expo/components/profile/ProfileActionTile.tsx` | rounded-square tile |
| `apps/expo/components/profile/ProfileActionGrid.tsx` | 3-column tile grid (rewritten) |
| `apps/expo/components/profile/ProfileMenu.tsx` | menu rows per variant |
| `apps/expo/components/profile/AccountSwitchSheet.tsx` | account switch drawer (extracted) |
| `apps/expo/hooks/useDailyMint.ts` | claimable state + claim() |
| `apps/expo/components/profile/CoinFlipBurst.tsx` | coin sprites |
| `apps/expo/components/profile/MuenzenButton.tsx` | golden / neutral pill with claim choreography |
| `apps/expo/app/profile.tsx` | composition (rewritten) |
| `apps/expo/app/citizen-verification.tsx` | credential explainer (rewritten) |
| `apps/expo/app/rewards/index.tsx` | imports shared daily-mint helpers |

---

### Task 1: Card asset pipeline

**Files:**
- Create: `apps/expo/scripts/render-credential-cards.mjs`
- Create: `apps/expo/assets/cards/png/{guest,citizen,attester}@2x.png`, `@3x.png` (generated)
- Create: `apps/expo/components/profile/credential-art.ts`

**Interfaces:**
- Produces: `CREDENTIAL_ART: Record<CredentialKind, ImageSourcePropType>` (kind → `require`), `CARD_ASPECT = 462 / 290`, `CARD_RADIUS_AT_462 = 24`.

- [ ] **Step 1: Write the render script**

```js
// apps/expo/scripts/render-credential-cards.mjs
// Renders assets/cards/*.svg to PNG at 2x and 3x. The SVGs use a soft-light
// sheen and inner-shadow filters that react-native-svg cannot reproduce, so
// the app ships PNGs and keeps the SVGs as the design source.
//
// Run from apps/expo:  node scripts/render-credential-cards.mjs
// Uses sharp from the monorepo pnpm store (no new dependency).
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const storeDir = path.join(repoRoot, 'node_modules', '.pnpm');
const sharpDir = readdirSync(storeDir).find((d) => d.startsWith('sharp@'));
if (!sharpDir) throw new Error('sharp not found in node_modules/.pnpm — run pnpm install at the repo root');
const sharp = createRequire(import.meta.url)(path.join(storeDir, sharpDir, 'node_modules', 'sharp'));

const SRC = path.join(here, '..', 'assets', 'cards');
const OUT = path.join(SRC, 'png');
mkdirSync(OUT, { recursive: true });

const CARDS = { Guest: 'guest', Citizen: 'citizen', Attester: 'attester' };
const SCALES = [2, 3];

for (const [file, name] of Object.entries(CARDS)) {
  for (const scale of SCALES) {
    const out = path.join(OUT, `${name}@${scale}x.png`);
    await sharp(path.join(SRC, `${file}.svg`), { density: 72 * scale }).png().toFile(out);
    const { width, height } = await sharp(out).metadata();
    console.log(`${name}@${scale}x.png ${width}x${height}`);
  }
}
```

- [ ] **Step 2: Run it**

Run: `cd apps/expo && node scripts/render-credential-cards.mjs`
Expected: six lines, `guest@2x.png 924x580` … `attester@3x.png 1386x870`.

- [ ] **Step 3: Write the art module**

```ts
// apps/expo/components/profile/credential-art.ts
// PNGs generated by scripts/render-credential-cards.mjs from assets/cards/*.svg.
// Metro picks the @2x/@3x variant for the device scale.
import type { ImageSourcePropType } from 'react-native';
import type { CredentialKind } from '@/lib/credentials';

export const CARD_ASPECT = 462 / 290;
export const CARD_RADIUS_AT_462 = 24;

export const CREDENTIAL_ART: Record<CredentialKind, ImageSourcePropType> = {
  guest: require('../../assets/cards/png/guest.png'),
  citizen: require('../../assets/cards/png/citizen.png'),
  attester: require('../../assets/cards/png/attester.png'),
};
```

Metro resolves `guest.png` to `guest@2x.png` / `guest@3x.png` even though no bare `guest.png` exists.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/scripts/render-credential-cards.mjs apps/expo/assets/cards/png apps/expo/components/profile/credential-art.ts
git commit -m "feat(expo): render credential card art from the SVG sources"
git push
```

---

### Task 2: Credential model and copy

**Files:**
- Create: `apps/expo/lib/credentials.ts`
- Test: `apps/expo/lib/__tests__/credentials.test.ts`

**Interfaces:**
- Produces: `type CredentialKind`, `credentialKindsFor({ isCitizen, isAttester }): CredentialKind[]`, `type BenefitIcon`, `type CredentialCopy`, `CREDENTIAL_COPY`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/expo/lib/__tests__/credentials.test.ts
import { credentialKindsFor, CREDENTIAL_COPY, type CredentialKind } from '../credentials';

describe('credentialKindsFor', () => {
  it('gives guests the guest card only', () => {
    expect(credentialKindsFor({ isCitizen: false, isAttester: false })).toEqual(['guest']);
  });
  it('gives citizens the citizen card only', () => {
    expect(credentialKindsFor({ isCitizen: true, isAttester: false })).toEqual(['citizen']);
  });
  it('stacks the attester card in front of the citizen card', () => {
    expect(credentialKindsFor({ isCitizen: true, isAttester: true })).toEqual(['citizen', 'attester']);
  });
  it('treats an attester without the citizen flag as citizen + attester', () => {
    expect(credentialKindsFor({ isCitizen: false, isAttester: true })).toEqual(['citizen', 'attester']);
  });
});

describe('CREDENTIAL_COPY', () => {
  const kinds: CredentialKind[] = ['guest', 'citizen', 'attester'];
  it.each(kinds)('%s has a title, intro and at least three benefits', (kind) => {
    const copy = CREDENTIAL_COPY[kind];
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.label.length).toBeGreaterThan(0);
    expect(copy.intro.length).toBeGreaterThan(20);
    expect(copy.benefits.length).toBeGreaterThanOrEqual(3);
    for (const b of copy.benefits) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.desc.length).toBeGreaterThan(0);
    }
  });
  it('never mentions CRC', () => {
    const text = JSON.stringify(CREDENTIAL_COPY);
    expect(text).not.toMatch(/\bCRC\b/);
  });
  it('guest CTA leads to becoming a citizen', () => {
    expect(CREDENTIAL_COPY.guest.cta?.kind).toBe('become-citizen');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/expo && CI=true npx jest lib/__tests__/credentials.test.ts --watchAll=false`
Expected: FAIL, cannot find module `../credentials`.

- [ ] **Step 3: Write the module**

```ts
// apps/expo/lib/credentials.ts
// Which soulbound credential cards an account holds and what each unlocks.
// Pure: no React, no assets (art lives in components/profile/credential-art.ts).

export type CredentialKind = 'guest' | 'citizen' | 'attester';

export type BenefitIcon =
  | 'vote'
  | 'coins'
  | 'org'
  | 'upload'
  | 'signature'
  | 'shield'
  | 'calendar'
  | 'listing'
  | 'feedback'
  | 'scan'
  | 'tally';

export type CredentialCta = {
  label: string;
  kind: 'become-citizen' | 'show-qr' | 'scan';
};

export type CredentialBenefit = { icon: BenefitIcon; title: string; desc: string };

export type CredentialCopy = {
  /** Screen-reader and explainer heading, e.g. "Bürgerausweis". */
  title: string;
  /** Short label printed on the card art, e.g. "Bürger". */
  label: string;
  intro: string;
  benefits: CredentialBenefit[];
  cta?: CredentialCta;
};

/**
 * Cards ordered back → front. Attesters always hold the citizen card too
 * (the contracts require it), so an attester flag implies both cards.
 */
export function credentialKindsFor(input: { isCitizen: boolean; isAttester: boolean }): CredentialKind[] {
  if (input.isAttester) return ['citizen', 'attester'];
  if (input.isCitizen) return ['citizen'];
  return ['guest'];
}

export const CREDENTIAL_COPY: Record<CredentialKind, CredentialCopy> = {
  guest: {
    title: 'Gastkarte',
    label: 'Gast',
    intro:
      'Mit der Gastkarte entdeckst du Röbel: Veranstaltungen, Neuigkeiten, Anzeigen und die Menschen dahinter. Als Bürger:in kommen Mitbestimmung und die Röbel Münzen der Stadt dazu.',
    benefits: [
      { icon: 'calendar', title: 'Veranstaltungen & News', desc: 'Alles, was in Röbel und an der Müritz passiert.' },
      { icon: 'listing', title: 'Anzeigen ansehen', desc: 'Kleinanzeigen, Angebote und Dienstleistungen aus der Region.' },
      { icon: 'coins', title: 'Röbel Münzen sammeln', desc: 'Deine persönlichen Münzen wachsen, sobald du dabei bist.' },
      { icon: 'feedback', title: 'Feedback geben', desc: 'Sag uns, was der App noch fehlt.' },
    ],
    cta: { label: 'Bürger:in werden', kind: 'become-citizen' },
  },
  citizen: {
    title: 'Bürgerausweis',
    label: 'Bürger',
    intro:
      'Der Bürgerausweis ist dein digitaler Nachweis, dass du zu Röbel gehörst. Er ist an dich gebunden, kann nicht übertragen werden und wurde von anderen Bürger:innen bestätigt.',
    benefits: [
      { icon: 'vote', title: 'Anonym abstimmen', desc: 'Nimm an Bürgerbefragungen teil. Deine Stimme bleibt geheim.' },
      { icon: 'coins', title: 'Röbel Münzen der Stadt', desc: 'Du erhältst stündlich Münzen und kannst sie in Röbel einsetzen.' },
      { icon: 'org', title: 'Organisation gründen', desc: 'Verein, Betrieb oder Fraktion mit eigenem Profil und Team.' },
      { icon: 'upload', title: 'Einreichen & anbieten', desc: 'Veranstaltungen, Anzeigen und Dienstleistungen veröffentlichen.' },
      { icon: 'signature', title: 'Bürger:innen bestätigen', desc: 'Gib deine Unterschrift, wenn jemand Neues dazukommt.' },
    ],
    cta: { label: 'Ausweis vorzeigen', kind: 'show-qr' },
  },
  attester: {
    title: 'Bescheiniger-Ausweis',
    label: 'Bescheiniger',
    intro:
      'Als Bescheiniger:in trägst du Verantwortung für die Gemeinschaft: Du prüfst Anträge, bestätigst neue Bürger:innen und hältst gemeinsam mit anderen die Schlüssel für Auszählungen.',
    benefits: [
      { icon: 'shield', title: 'Neue Bürger:innen bestätigen', desc: 'Deine Bescheinigung zählt mit größerem Gewicht.' },
      { icon: 'scan', title: 'Anträge prüfen', desc: 'Scanne den Ausweis-Code und prüfe Anträge vor Ort.' },
      { icon: 'tally', title: 'Auszählungen freischalten', desc: 'Drei von fünf Bescheiniger:innen geben eine Befragung zur Auszählung frei.' },
      { icon: 'vote', title: 'Alles aus dem Bürgerausweis', desc: 'Abstimmen, Münzen, Organisationen und Einreichungen bleiben enthalten.' },
    ],
    cta: { label: 'QR-Code scannen', kind: 'scan' },
  },
};
```

- [ ] **Step 4: Run the test**

Run: `cd apps/expo && CI=true npx jest lib/__tests__/credentials.test.ts --watchAll=false`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/credentials.ts apps/expo/lib/__tests__/credentials.test.ts
git commit -m "feat(expo): credential kinds and explainer copy"
git push
```

---

### Task 3: Shared daily-mint helpers

**Files:**
- Create: `apps/expo/lib/muenzen-daily-mint.ts`
- Test: `apps/expo/lib/__tests__/muenzen-daily-mint.test.ts`
- Modify: `apps/expo/app/rewards/index.tsx:49-84` (replace local constants/helpers with imports)

**Interfaces:**
- Produces: `MIN_MINTABLE`, `MINT_COOLDOWN_MS`, `rtClaimKey(addr)`, `rtStreakKey(addr)`, `dayStart(ts)`, `nextMidnight(ts)`, `fmtCountdown(ms)`, `claimAmount(mintable)`, `isInCooldown(lastClaim, now)`, `computeNextStreak(prevStreak, prevLastClaim, now)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/expo/lib/__tests__/muenzen-daily-mint.test.ts
import {
  MIN_MINTABLE,
  MINT_COOLDOWN_MS,
  claimAmount,
  computeNextStreak,
  dayStart,
  isInCooldown,
  rtClaimKey,
  rtStreakKey,
} from '../muenzen-daily-mint';

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0).getTime();

describe('claimAmount', () => {
  it('never claims less than one whole Münze', () => {
    expect(claimAmount(0)).toBe(1);
    expect(claimAmount(0.3)).toBe(1);
  });
  it('rounds the accrued amount', () => {
    expect(claimAmount(2.4)).toBe(2);
    expect(claimAmount(2.6)).toBe(3);
  });
});

describe('isInCooldown', () => {
  it('is false without a previous claim', () => {
    expect(isInCooldown(null, 1_000)).toBe(false);
  });
  it('is true inside the cooldown window and false after', () => {
    const last = 10_000;
    expect(isInCooldown(last, last + MINT_COOLDOWN_MS - 1)).toBe(true);
    expect(isInCooldown(last, last + MINT_COOLDOWN_MS)).toBe(false);
  });
});

describe('computeNextStreak', () => {
  it('starts at 1 on the first claim', () => {
    expect(computeNextStreak(0, null, noon(2026, 9, 13))).toBe(1);
  });
  it('keeps the streak on a second claim the same day', () => {
    expect(computeNextStreak(4, noon(2026, 9, 13) - 3_600_000, noon(2026, 9, 13))).toBe(4);
  });
  it('repairs a zero streak on the same day to 1', () => {
    expect(computeNextStreak(0, noon(2026, 9, 13) - 3_600_000, noon(2026, 9, 13))).toBe(1);
  });
  it('increments when the last claim was yesterday', () => {
    expect(computeNextStreak(4, noon(2026, 9, 12), noon(2026, 9, 13))).toBe(5);
  });
  it('increments across a DST change', () => {
    // 2026-10-25 is the European DST switch (25h day).
    expect(computeNextStreak(2, noon(2026, 10, 25), noon(2026, 10, 26))).toBe(3);
  });
  it('resets after a gap', () => {
    expect(computeNextStreak(9, noon(2026, 9, 10), noon(2026, 9, 13))).toBe(1);
  });
});

describe('storage keys', () => {
  it('are lower-cased per wallet', () => {
    expect(rtClaimKey('0xABC')).toBe('rt_lastclaim_0xabc');
    expect(rtStreakKey('0xABC')).toBe('rt_streak_0xabc');
  });
});

describe('dayStart', () => {
  it('is idempotent', () => {
    const t = noon(2026, 9, 13);
    expect(dayStart(dayStart(t))).toBe(dayStart(t));
    expect(dayStart(t)).toBeLessThan(t);
  });
});

it('exposes the threshold', () => {
  expect(MIN_MINTABLE).toBe(0.1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/expo && CI=true npx jest lib/__tests__/muenzen-daily-mint.test.ts --watchAll=false`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the module**

```ts
// apps/expo/lib/muenzen-daily-mint.ts
// Röbel Münzen hourly mint: constants and pure helpers shared by the Münzen
// page (app/rewards/index.tsx) and the profile's Münzen button. Both persist
// the same AsyncStorage keys so the cooldown and streak agree everywhere.

/** Min claimable Röbel Münzen before the mint activates (≈6 min of accrual at ~1/hour). */
export const MIN_MINTABLE = 0.1;
/** One full Röbel Münze accrues ≈1h after a mint. */
export const MINT_COOLDOWN_MS = 3_600_000;

export const rtClaimKey = (addr: string) => `rt_lastclaim_${addr.toLowerCase()}`;
export const rtStreakKey = (addr: string) => `rt_streak_${addr.toLowerCase()}`;

/** Local midnight at the start of the day containing `ts`. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight at the end of the day containing `ts`. */
export function nextMidnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min ${sec} s`;
}

/** Whole Münzen a mint lands right now; never below one. */
export function claimAmount(mintable: number): number {
  return Math.max(1, Math.round(mintable));
}

export function isInCooldown(lastClaim: number | null, now: number): boolean {
  return lastClaim != null && now < lastClaim + MINT_COOLDOWN_MS;
}

/**
 * Consecutive-day streak after a claim at `now`. Same day keeps the streak
 * (repairing 0 → 1), yesterday extends it, anything older restarts at 1.
 * "Yesterday" is derived through dayStart so DST days (23h/25h) still count.
 */
export function computeNextStreak(prevStreak: number, prevLastClaim: number | null, now: number): number {
  if (prevLastClaim == null) return 1;
  const today = dayStart(now);
  const yesterday = dayStart(today - 12 * 3_600_000);
  const lastDay = dayStart(prevLastClaim);
  if (lastDay === today) return Math.max(1, prevStreak);
  if (lastDay === yesterday) return prevStreak + 1;
  return 1;
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/expo && CI=true npx jest lib/__tests__/muenzen-daily-mint.test.ts --watchAll=false`
Expected: PASS (13 tests).

- [ ] **Step 5: Point the Münzen page at the shared module**

In `apps/expo/app/rewards/index.tsx`:

Delete these local definitions (lines 49–52 and 60–84): `MIN_MINTABLE`, `MINT_COOLDOWN_MS`, `rtClaimKey`, `nextMidnight`, `fmtCountdown`, `rtStreakKey`, `dayStart` (keep `WELCOME_MECKY`, `STADTKASSE_IMG`, `SCHATZTRUHE_IMG`, `MUENZEN_INTRO_KEY`).

Add after the `import { getTreasuryEuro } from '@/lib/roebel-taler';` line:

```ts
import {
  MIN_MINTABLE,
  MINT_COOLDOWN_MS,
  computeNextStreak,
  dayStart,
  fmtCountdown,
  nextMidnight,
  rtClaimKey,
  rtStreakKey,
} from '@/lib/muenzen-daily-mint';
```

In `onDailyMint` replace the streak block

```ts
    let nextStreak = 1;
    try {
      const lastDay = prevLastClaim != null ? dayStart(prevLastClaim) : 0;
      if (lastDay === today) nextStreak = prevStreak;
      else if (lastDay === today - 86_400_000) nextStreak = prevStreak + 1;
    } catch { /* fresh streak */ }
```

with

```ts
    const nextStreak = computeNextStreak(prevStreak, prevLastClaim, ts);
```

`today` stays in use for the persisted `lastDay`.

- [ ] **Step 6: Type-check the page**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/rewards/index.tsx|lib/muenzen-daily-mint" || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add apps/expo/lib/muenzen-daily-mint.ts apps/expo/lib/__tests__/muenzen-daily-mint.test.ts apps/expo/app/rewards/index.tsx
git commit -m "feat(expo): share the daily-mint helpers between the Münzen page and the profile"
git push
```

---

### Task 4: Header title and action lists

**Files:**
- Create: `apps/expo/lib/profile-header.ts`
- Create: `apps/expo/lib/profile-actions.ts`
- Test: `apps/expo/lib/__tests__/profile-header.test.ts`, `apps/expo/lib/__tests__/profile-actions.test.ts`

**Interfaces:**
- Produces: `profileHeaderTitle(account: Pick<Account, 'account_type' | 'sub_type'> | null): string`; `type ProfileActionKey`, `type ProfileAction = { key; label; href; params?; auth? }`, `PERSONAL_PROFILE_ACTIONS`, `ORG_PROFILE_ACTIONS`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/expo/lib/__tests__/profile-header.test.ts
import { profileHeaderTitle } from '../profile-header';

describe('profileHeaderTitle', () => {
  it('is "Profil" for a personal account or no account', () => {
    expect(profileHeaderTitle(null)).toBe('Profil');
    expect(profileHeaderTitle({ account_type: 'personal', sub_type: null })).toBe('Profil');
  });
  it('uses the org sub-type label', () => {
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: 'verein' })).toBe('Verein');
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: 'unternehmen' })).toBe('Unternehmen');
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: 'journalist' })).toBe('Journalist:in');
  });
  it('falls back for an unknown sub-type', () => {
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: null })).toBe('Organisation');
  });
});
```

```ts
// apps/expo/lib/__tests__/profile-actions.test.ts
import { ORG_PROFILE_ACTIONS, PERSONAL_PROFILE_ACTIONS } from '../profile-actions';

describe('PERSONAL_PROFILE_ACTIONS', () => {
  it('has the six mockup actions in order', () => {
    expect(PERSONAL_PROFILE_ACTIONS.map((a) => a.key)).toEqual([
      'roebel-card',
      'governance',
      'create-org',
      'submit-event',
      'create-listing',
      'create-service',
    ]);
  });
  it('routes the service tile to the listing form with the service type', () => {
    const svc = PERSONAL_PROFILE_ACTIONS.find((a) => a.key === 'create-service')!;
    expect(svc.href).toBe('/create-listing');
    expect(svc.params).toEqual({ listingType: 'service' });
  });
});

describe('ORG_PROFILE_ACTIONS', () => {
  it('has five actions and keeps the auth gate on the create actions', () => {
    expect(ORG_PROFILE_ACTIONS.map((a) => a.key)).toEqual([
      'create-product',
      'create-service',
      'submit-event',
      'org-ads',
      'org-dashboard',
    ]);
    expect(ORG_PROFILE_ACTIONS.filter((a) => a.auth).map((a) => a.key)).toEqual([
      'create-product',
      'create-service',
      'submit-event',
    ]);
  });
});

it('every href is an absolute route', () => {
  for (const a of [...PERSONAL_PROFILE_ACTIONS, ...ORG_PROFILE_ACTIONS]) {
    expect(a.href.startsWith('/')).toBe(true);
    expect(a.label.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/expo && CI=true npx jest lib/__tests__/profile-header.test.ts lib/__tests__/profile-actions.test.ts --watchAll=false`
Expected: FAIL, modules missing.

- [ ] **Step 3: Write the modules**

```ts
// apps/expo/lib/profile-header.ts
import { SUB_TYPE_LABELS, type Account } from '@/lib/types';

/** Header title of the profile screen: "Profil", or the org type in org mode. */
export function profileHeaderTitle(account: Pick<Account, 'account_type' | 'sub_type'> | null): string {
  if (!account || account.account_type !== 'organisation') return 'Profil';
  return (account.sub_type && SUB_TYPE_LABELS[account.sub_type]) || 'Organisation';
}
```

```ts
// apps/expo/lib/profile-actions.ts
// Quick-action tiles on the profile. Art is attached in ProfileActionGrid.

export type ProfileActionKey =
  | 'roebel-card'
  | 'governance'
  | 'create-org'
  | 'submit-event'
  | 'create-listing'
  | 'create-service'
  | 'create-product'
  | 'org-ads'
  | 'org-dashboard';

export type ProfileAction = {
  key: ProfileActionKey;
  /** Tile label; "\n" marks the preferred line break. */
  label: string;
  href: string;
  params?: Record<string, string>;
  /** Wrap navigation in the auth gate (org create actions). */
  auth?: boolean;
};

export const PERSONAL_PROFILE_ACTIONS: ProfileAction[] = [
  { key: 'roebel-card', label: 'Röbel Card', href: '/roebel-card' },
  { key: 'governance', label: 'Bürger-\nbefragung', href: '/governance' },
  { key: 'create-org', label: 'Durchstarten', href: '/create-org' },
  { key: 'submit-event', label: 'Veranstaltung\neinsenden', href: '/submit-event' },
  { key: 'create-listing', label: 'Anzeige\nerstellen', href: '/create-listing' },
  { key: 'create-service', label: 'Dienstleistung\nanbieten', href: '/create-listing', params: { listingType: 'service' } },
];

export const ORG_PROFILE_ACTIONS: ProfileAction[] = [
  { key: 'create-product', label: 'Anzeige\nerstellen', href: '/create-listing', params: { listingType: 'product' }, auth: true },
  { key: 'create-service', label: 'Dienstleistung\nanbieten', href: '/create-listing', params: { listingType: 'service' }, auth: true },
  { key: 'submit-event', label: 'Veranstaltung\nerstellen', href: '/submit-event', auth: true },
  { key: 'org-ads', label: 'Anzeigen', href: '/org/ads' },
  { key: 'org-dashboard', label: 'Dashboard', href: '/org/dashboard' },
];
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/expo && CI=true npx jest lib/__tests__/profile-header.test.ts lib/__tests__/profile-actions.test.ts --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/profile-header.ts apps/expo/lib/profile-actions.ts apps/expo/lib/__tests__/profile-header.test.ts apps/expo/lib/__tests__/profile-actions.test.ts
git commit -m "feat(expo): profile header title and quick-action lists"
git push
```

---

### Task 5: `PressableScale` and `GlassPill` primitives

**Files:**
- Create: `apps/expo/components/PressableScale.tsx`
- Create: `apps/expo/components/GlassPill.tsx`

**Interfaces:**
- Produces: `PressableScale` (props: `PressableProps` minus `style`, plus `scaleTo?: number` (0.96), `haptic?: 'selection' | 'light' | 'none'` (none), `style?: StyleProp<ViewStyle>`); `GlassPill` (props: `onPress`, `accessibilityLabel`, `children`, `style?`).

- [ ] **Step 1: Write `PressableScale`**

```tsx
// apps/expo/components/PressableScale.tsx
import React, { useCallback } from 'react';
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  /** Scale while pressed. */
  scaleTo?: number;
  haptic?: 'selection' | 'light' | 'none';
  style?: StyleProp<ViewStyle>;
};

const SPRING = { damping: 15, stiffness: 300 };

/**
 * Pressable that springs its content down to `scaleTo` while pressed —
 * the shared press affordance for tiles, pills and the credential stack.
 */
export default function PressableScale({
  scaleTo = 0.96,
  haptic = 'none',
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(scaleTo, SPRING);
      if (haptic !== 'none' && Platform.OS !== 'web') {
        if (haptic === 'selection') Haptics.selectionAsync().catch(() => {});
        else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPressIn?.(e);
    },
    [haptic, onPressIn, scale, scaleTo],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, SPRING);
      onPressOut?.(e);
    },
    [onPressOut, scale],
  );

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
}
```

- [ ] **Step 2: Write `GlassPill`**

```tsx
// apps/expo/components/GlassPill.tsx
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import GlassSurface, { glassEdgeColor } from '@/components/GlassSurface';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const GLASS_PILL_HEIGHT = 36;

/**
 * Frosted pill with the same material as the bottom navigation. The outer
 * pressable carries the shadow; the inner view clips the glass to the pill
 * (GlassSurface must be its first child and the container transparent).
 * Not an Android blur sampler — the nav keeps that role on each screen.
 */
export default function GlassPill({ onPress, accessibilityLabel, children, style }: Props) {
  const { isDark } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      haptic="selection"
      style={[styles.shadow, softShadow(1, isDark), style]}
    >
      <View style={[styles.clip, { borderColor: glassEdgeColor(isDark) }]}>
        <GlassSurface />
        <View style={styles.content}>{children}</View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: GLASS_PILL_HEIGHT / 2,
  },
  clip: {
    height: GLASS_PILL_HEIGHT,
    borderRadius: GLASS_PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
});
```

- [ ] **Step 3: Type-check**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/PressableScale|components/GlassPill" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/components/PressableScale.tsx apps/expo/components/GlassPill.tsx
git commit -m "feat(expo): PressableScale and GlassPill primitives"
git push
```

---

### Task 6: Credential card and stack

**Files:**
- Create: `apps/expo/components/profile/CredentialCard.tsx`
- Create: `apps/expo/components/profile/CredentialCardStack.tsx`
- Test: `apps/expo/components/__tests__/CredentialCardStack-test.tsx`

**Interfaces:**
- Consumes: `CREDENTIAL_ART`, `CARD_ASPECT`, `CARD_RADIUS_AT_462` (Task 1); `CredentialKind`, `CREDENTIAL_COPY` (Task 2); `PressableScale` (Task 5).
- Produces: `CredentialCard` (props `kind`, `width`, `style?`, `shadow?: boolean`); `CredentialCardStack` (props `kinds: CredentialKind[]`, `onPress(kind)`); `CARD_PEEK_FRONT = 64`, `CARD_PEEK_STEP = 44`, `STACK_TOP = 12`, `stackHeight(n)`.

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/expo/components/__tests__/CredentialCardStack-test.tsx
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('@/components/PressableScale', () => {
  const { Pressable } = require('react-native');
  return { __esModule: true, default: Pressable };
});

import CredentialCardStack, { stackHeight } from '../profile/CredentialCardStack';

function labelsOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll((n) => n.props.accessibilityRole === 'image')
    .map((n) => n.props.accessibilityLabel);
}

describe('CredentialCardStack', () => {
  it('renders one card for a citizen', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CredentialCardStack kinds={['citizen']} onPress={() => {}} />);
    });
    expect(labelsOf(tree)).toEqual(['Bürgerausweis']);
  });

  it('renders citizen behind attester and reports the front card on press', () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<CredentialCardStack kinds={['citizen', 'attester']} onPress={onPress} />);
    });
    expect(labelsOf(tree)).toEqual(['Bürgerausweis', 'Bescheiniger-Ausweis']);
    const zone = tree.root.findAll((n) => n.props.accessibilityRole === 'button')[0];
    act(() => {
      zone.props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith('attester');
  });

  it('grows by one peek step per extra card', () => {
    expect(stackHeight(1)).toBe(64);
    expect(stackHeight(2)).toBe(108);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/expo && CI=true npx jest components/__tests__/CredentialCardStack-test.tsx --watchAll=false`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write `CredentialCard`**

```tsx
// apps/expo/components/profile/CredentialCard.tsx
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { CREDENTIAL_COPY, type CredentialKind } from '@/lib/credentials';
import { softShadow } from '@/lib/shadow';
import { CARD_ASPECT, CARD_RADIUS_AT_462, CREDENTIAL_ART } from './credential-art';

type Props = {
  kind: CredentialKind;
  width: number;
  style?: StyleProp<ViewStyle>;
  shadow?: boolean;
};

export function cardHeightFor(width: number): number {
  return Math.round(width / CARD_ASPECT);
}

/** One credential card image at the given width (462:290 aspect). */
export default function CredentialCard({ kind, width, style, shadow = true }: Props) {
  const { isDark } = useTheme();
  const height = cardHeightFor(width);
  const radius = Math.round((CARD_RADIUS_AT_462 * width) / 462);
  return (
    <View
      style={[{ width, height, borderRadius: radius }, shadow && softShadow(2, isDark), style]}
      accessibilityRole="image"
      accessibilityLabel={CREDENTIAL_COPY[kind].title}
    >
      <Image
        source={CREDENTIAL_ART[kind]}
        style={[styles.image, { width, height, borderRadius: radius }]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: 'transparent',
  },
});
```

- [ ] **Step 4: Write `CredentialCardStack`**

```tsx
// apps/expo/components/profile/CredentialCardStack.tsx
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { CREDENTIAL_COPY, type CredentialKind } from '@/lib/credentials';
import CredentialCard from './CredentialCard';

/** Visible height of the front card above the content sheet. */
export const CARD_PEEK_FRONT = 64;
/** Vertical offset between stacked cards. */
export const CARD_PEEK_STEP = 44;
/** Gap between the header and the first card. */
export const STACK_TOP = 12;

export function stackHeight(count: number): number {
  return CARD_PEEK_STEP * Math.max(0, count - 1) + CARD_PEEK_FRONT;
}

type Props = {
  /** Back → front. */
  kinds: CredentialKind[];
  onPress: (front: CredentialKind) => void;
};

/**
 * The wallet peek at the top of the profile: cards are absolutely placed so
 * only their top band shows; the sheet that follows in flow covers the rest.
 * The zone must not clip (cards overflow downward on purpose).
 */
export default function CredentialCardStack({ kinds, onPress }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 32;
  const front = kinds[kinds.length - 1];

  return (
    <PressableScale
      scaleTo={0.985}
      haptic="selection"
      onPress={() => onPress(front)}
      accessibilityRole="button"
      accessibilityLabel={`${CREDENTIAL_COPY[front].title} anzeigen`}
      style={[styles.zone, { height: STACK_TOP + stackHeight(kinds.length) }]}
    >
      {kinds.map((kind, index) => (
        <CredentialCard
          key={kind}
          kind={kind}
          width={cardWidth}
          style={[styles.card, { top: STACK_TOP + index * CARD_PEEK_STEP }]}
        />
      ))}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  zone: {
    overflow: 'visible',
    zIndex: 1,
  },
  card: {
    position: 'absolute',
    left: 16,
  },
});
```

- [ ] **Step 5: Run the test**

Run: `cd apps/expo && CI=true npx jest components/__tests__/CredentialCardStack-test.tsx --watchAll=false`
Expected: PASS (3 tests). If `useWindowDimensions` is undefined in the renderer, jest-expo provides it; if the Image `require` of a `@2x`-only asset throws under jest, add `"moduleNameMapper": { "\\.(png)$": "<rootDir>/__mocks__/fileMock.js" }` is NOT needed because jest-expo already stubs image requires.

- [ ] **Step 6: Commit**

```bash
git add apps/expo/components/profile/CredentialCard.tsx apps/expo/components/profile/CredentialCardStack.tsx apps/expo/components/__tests__/CredentialCardStack-test.tsx
git commit -m "feat(expo): credential card and the peeking card stack"
git push
```

---

### Task 7: Sheet, header, account switch sheet

**Files:**
- Create: `apps/expo/components/profile/ProfileSheet.tsx`
- Create: `apps/expo/components/profile/ProfileHeader.tsx`
- Create: `apps/expo/components/profile/AccountSwitchSheet.tsx`

**Interfaces:**
- Consumes: `GlassPill` (Task 5), `AvatarStack` (existing), `BottomDrawer` (existing), `SUB_TYPE_LABELS`/`SUB_TYPE_EMOJI`/`Account` (`lib/types`).
- Produces: `ProfileSheet` (props `children`, `flat?: boolean`, `style?`); `ProfileHeader` (props `title`, `switcherVisible`, `recentOtherAccounts: Account[]`, `personalAvatarUrl: string | null`, `onSwitch`); `AccountSwitchSheet` (props `visible`, `onClose`, `accounts: Account[]`, `activeAccountId: string | null`, `personalAvatarUrl`, `personalName`, `onSelect(accountId)`, `onLogout`).

- [ ] **Step 1: Write `ProfileSheet`**

```tsx
// apps/expo/components/profile/ProfileSheet.tsx
import React from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  children: React.ReactNode;
  /** No top radius / shadow — used when nothing peeks out from behind. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const SHEET_RADIUS = 24;

/**
 * The white content surface of the profile. Rounded top corners and an
 * upward shadow make it read as a sheet lying over the credential cards.
 */
export default function ProfileSheet({ children, flat = false, style }: Props) {
  const { colors, isDark } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.background, minHeight: height },
        !flat && {
          borderTopLeftRadius: SHEET_RADIUS,
          borderTopRightRadius: SHEET_RADIUS,
          boxShadow: isDark ? '0px -8px 24px rgba(0,0,0,0.35)' : '0px -8px 24px rgba(0,0,0,0.10)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 20,
    zIndex: 2,
  },
});
```

- [ ] **Step 2: Write `ProfileHeader`**

```tsx
// apps/expo/components/profile/ProfileHeader.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AvatarStack from '@/components/AvatarStack';
import GlassPill from '@/components/GlassPill';
import { useTheme } from '@/context/ThemeContext';
import type { Account } from '@/lib/types';

type Props = {
  title: string;
  switcherVisible: boolean;
  recentOtherAccounts: Account[];
  personalAvatarUrl: string | null;
  onSwitch: () => void;
};

/** Screen title plus the frosted "Account wechseln" pill (multi-account users only). */
export default function ProfileHeader({
  title,
  switcherVisible,
  recentOtherAccounts,
  personalAvatarUrl,
  onSwitch,
}: Props) {
  const { colors } = useTheme();
  const stackUsers = recentOtherAccounts.map((a) => ({
    avatar_url: a.account_type === 'personal' ? personalAvatarUrl : a.avatar_url || a.cover_url,
    username: a.name,
  }));

  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      {switcherVisible && (
        <GlassPill onPress={onSwitch} accessibilityLabel="Account wechseln">
          {stackUsers.length > 0 && <AvatarStack users={stackUsers} maxVisible={2} size="small" />}
          <Text style={[styles.pillText, { color: colors.textPrimary }]}>Account wechseln</Text>
        </GlassPill>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
```

- [ ] **Step 3: Write `AccountSwitchSheet`** (behaviour lifted from the old inline drawer; labels from `lib/types`)

```tsx
// apps/expo/components/profile/AccountSwitchSheet.tsx
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { SUB_TYPE_EMOJI, SUB_TYPE_LABELS, type Account } from '@/lib/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  activeAccountId: string | null;
  personalAvatarUrl: string | null;
  personalName: string | null;
  onSelect: (accountId: string) => void;
  onLogout: () => void;
};

export default function AccountSwitchSheet({
  visible,
  onClose,
  accounts,
  activeAccountId,
  personalAvatarUrl,
  personalName,
  onSelect,
  onLogout,
}: Props) {
  const { colors } = useTheme();

  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.7}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Account wechseln</Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {accounts.map((acc) => {
          const isPersonal = acc.account_type === 'personal';
          const isActive = acc.id === activeAccountId;
          const emoji = isPersonal ? '👤' : (acc.sub_type && SUB_TYPE_EMOJI[acc.sub_type]) || '🏢';
          const typeLabel = isPersonal ? 'Persönlich' : (acc.sub_type && SUB_TYPE_LABELS[acc.sub_type]) || 'Organisation';
          const avatar = isPersonal ? personalAvatarUrl : acc.avatar_url || acc.cover_url;
          const name = isPersonal ? personalName || acc.name : acc.name;
          const pending = !isPersonal && !acc.is_verified;

          return (
            <Pressable
              key={acc.id}
              onPress={() => onSelect(acc.id)}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${typeLabel}`}
              accessibilityState={{ selected: isActive }}
              style={[
                styles.row,
                { borderColor: isActive ? colors.primary : colors.border },
                isActive && { backgroundColor: colors.primaryLight },
              ]}
            >
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.emojiWrap, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={styles.emoji}>{emoji}</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
                <Text style={[styles.type, { color: colors.textSecondary }]}>{typeLabel}</Text>
              </View>
              {pending && (
                <View style={[styles.statusPill, { backgroundColor: colors.warningBackground }]}>
                  <Text style={[styles.statusText, { color: colors.warning }]}>In Prüfung</Text>
                </View>
              )}
              {isActive && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Pressable onPress={onLogout} style={styles.logout} accessibilityRole="button" accessibilityLabel="Ausloggen">
        <Text style={[styles.logoutText, { color: colors.error }]}>Ausloggen</Text>
      </Pressable>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginBottom: 16 },
  list: { flex: 1 },
  listContent: { paddingBottom: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  emojiWrap: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  type: { fontSize: 13, fontFamily: 'Inter-Regular' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  check: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  divider: { height: 1, marginVertical: 12 },
  logout: { paddingVertical: 14, alignItems: 'center' },
  logoutText: { fontSize: 15, fontFamily: 'Inter-Medium' },
});
```

- [ ] **Step 4: Type-check**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/profile/(ProfileSheet|ProfileHeader|AccountSwitchSheet)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/profile/ProfileSheet.tsx apps/expo/components/profile/ProfileHeader.tsx apps/expo/components/profile/AccountSwitchSheet.tsx
git commit -m "feat(expo): profile sheet, glass header and extracted account switch sheet"
git push
```

---

### Task 8: Identity rows and member preview

**Files:**
- Create: `apps/expo/hooks/useOrgMemberPreview.ts`
- Create: `apps/expo/components/profile/IdentityRow.tsx`
- Create: `apps/expo/components/profile/OrgIdentityRow.tsx`

**Interfaces:**
- Consumes: `UserAvatarWithFrame`, `AvatarStack`, `PressableScale`, `fetchMembersWithProfiles` (`lib/supabase-member-management`), `badge-check.svg`, `chevron-right.svg`.
- Produces: `useOrgMemberPreview(accountId?: string): { users: { avatar_url: string | null; username: string | null }[]; count: number }`; `IdentityRow` (props `name`, `avatarUrl`, `verified`, `onPress`, `right?: ReactNode`); `OrgIdentityRow` (props `name`, `avatarUrl`, `emoji`, `verified`, `members`, `memberCount`, `onMembers`).

- [ ] **Step 1: Write the hook**

```ts
// apps/expo/hooks/useOrgMemberPreview.ts
import { useEffect, useState } from 'react';
import { fetchMembersWithProfiles } from '@/lib/supabase-member-management';

export type MemberPreviewUser = { avatar_url: string | null; username: string | null };

/** Member avatars + count for the org "Mitglieder" pill. One fetch per account id. */
export function useOrgMemberPreview(accountId: string | undefined) {
  const [users, setUsers] = useState<MemberPreviewUser[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!accountId) {
      setUsers([]);
      setCount(0);
      return;
    }
    let cancelled = false;
    fetchMembersWithProfiles(accountId)
      .then((members) => {
        if (cancelled) return;
        setUsers(
          members.map((m) => ({
            avatar_url: m.user?.profile_picture_url ?? null,
            username: m.user?.username ?? null,
          })),
        );
        setCount(members.length);
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
          setCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return { users, count };
}
```

- [ ] **Step 2: Write `IdentityRow`**

```tsx
// apps/expo/components/profile/IdentityRow.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { useTheme } from '@/context/ThemeContext';
import BadgeCheckIcon from '@/assets/icons/badge-check.svg';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';

type Props = {
  name: string;
  avatarUrl: string | null;
  /** Citizens and attesters get the gold check on the avatar. */
  verified: boolean;
  onPress: () => void;
  /** Right slot, e.g. the Münzen button. */
  right?: React.ReactNode;
};

export const VERIFIED_GOLD = '#E5A800';

/** Avatar, name and "Zum Profil ›" on the left; an optional action on the right. */
export default function IdentityRow({ name, avatarUrl, verified, onPress, right }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.left, { opacity: pressed ? 0.7 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Profil von ${name} öffnen`}
      >
        <View style={styles.avatarWrap}>
          <UserAvatarWithFrame size={48} uri={avatarUrl} fallbackInitial={(name || '?').charAt(0).toUpperCase()} />
          {verified && (
            <View style={[styles.badge, { backgroundColor: colors.background }]}>
              <BadgeCheckIcon width={16} height={16} color={VERIFIED_GOLD} />
            </View>
          )}
        </View>
        <View style={styles.texts}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.subRow}>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>Zum Profil</Text>
            <ChevronRightIcon width={14} height={14} color={colors.textSecondary} />
          </View>
        </View>
      </Pressable>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatarWrap: {
    width: 48,
    height: 48,
  },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sub: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  right: {
    flexShrink: 0,
  },
});
```

- [ ] **Step 3: Write `OrgIdentityRow`**

```tsx
// apps/expo/components/profile/OrgIdentityRow.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import AvatarStack from '@/components/AvatarStack';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';
import { softShadow } from '@/lib/shadow';
import BadgeCheckIcon from '@/assets/icons/badge-check.svg';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import { VERIFIED_GOLD } from './IdentityRow';
import type { MemberPreviewUser } from '@/hooks/useOrgMemberPreview';

type Props = {
  name: string;
  avatarUrl: string | null;
  emoji: string;
  verified: boolean;
  members: MemberPreviewUser[];
  memberCount: number;
  onMembers: () => void;
};

/** Org avatar + name on the left, the "Mitglieder ›" pill with member avatars on the right. */
export default function OrgIdentityRow({ name, avatarUrl, emoji, verified, members, memberCount, onMembers }: Props) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.emojiWrap, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          )}
          {verified && (
            <View style={[styles.badge, { backgroundColor: colors.background }]}>
              <BadgeCheckIcon width={16} height={16} color={VERIFIED_GOLD} />
            </View>
          )}
        </View>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
      </View>

      <PressableScale
        onPress={onMembers}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={`Mitglieder verwalten, ${memberCount}`}
        style={[styles.pill, { backgroundColor: colors.background, borderColor: colors.border }, softShadow(1, isDark)]}
      >
        {members.length > 0 && <AvatarStack users={members} maxVisible={2} size="small" />}
        <Text style={[styles.pillText, { color: colors.textPrimary }]}>Mitglieder</Text>
        <ChevronRightIcon width={16} height={16} color={colors.textSecondary} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatarWrap: { width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  emojiWrap: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
```

- [ ] **Step 4: Type-check**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "hooks/useOrgMemberPreview|components/profile/(IdentityRow|OrgIdentityRow)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/hooks/useOrgMemberPreview.ts apps/expo/components/profile/IdentityRow.tsx apps/expo/components/profile/OrgIdentityRow.tsx
git commit -m "feat(expo): identity rows for personal and org profiles"
git push
```

---

### Task 9: Action tiles, grid and menu

**Files:**
- Create: `apps/expo/components/profile/ProfileActionTile.tsx`
- Rewrite: `apps/expo/components/profile/ProfileActionGrid.tsx`
- Create: `apps/expo/components/profile/ProfileMenu.tsx`

**Interfaces:**
- Consumes: `ProfileAction`, `ProfileActionKey` (Task 4); `PressableScale`; `useRequireAuth` (`context/AuthGateContext`); `ProfileMenuItem` (existing).
- Produces: `ProfileActionTile` (props `label`, `image`, `onPress`); `ProfileActionGrid` (props `items: ProfileAction[]`); `ProfileMenu` (props `variant: 'guest' | 'personal' | 'org'`, `showSubmitEventRow?: boolean`, `profileHref?: Href`).

- [ ] **Step 1: Write `ProfileActionTile`**

```tsx
// apps/expo/components/profile/ProfileActionTile.tsx
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  label: string;
  image: ImageSourcePropType;
  onPress: () => void;
};

export const TILE_SIZE = 64;
export const TILE_RADIUS = 18;
const TILE_LIGHT = '#F2F3F5';
const TILE_LIGHT_PRESSED = '#E6E8EB';

/** Illustration inside a rounded gray square, label underneath. */
export default function ProfileActionTile({ label, image, onPress }: Props) {
  const { colors, isDark } = useTheme();
  const [pressed, setPressed] = useState(false);
  const idle = isDark ? colors.surfaceSecondary : TILE_LIGHT;
  const active = isDark ? colors.surface : TILE_LIGHT_PRESSED;

  return (
    <PressableScale
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={label.replace('\n', ' ').replace('-', '')}
      style={styles.cell}
    >
      <View style={[styles.square, { backgroundColor: pressed ? active : idle }]}>
        <Image source={image} style={styles.image} resizeMode="contain" />
      </View>
      <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: '33.333%',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 8,
  },
  square: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 40,
    height: 40,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Rewrite `ProfileActionGrid`**

```tsx
// apps/expo/components/profile/ProfileActionGrid.tsx
import React from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useRouter } from 'expo-router';
import { useRequireAuth } from '@/context/AuthGateContext';
import type { ProfileAction, ProfileActionKey } from '@/lib/profile-actions';
import ProfileActionTile from './ProfileActionTile';

const ACTION_ART: Record<ProfileActionKey, ImageSourcePropType> = {
  'roebel-card': require('../../assets/images/card.png'),
  governance: require('../../assets/illustration/profile/02.png'),
  'create-org': require('../../assets/illustration/profile/03.png'),
  'submit-event': require('../../assets/illustration/profile/04.png'),
  'create-listing': require('../../assets/illustration/profile/05.png'),
  'create-service': require('../../assets/illustration/profile/06.png'),
  'create-product': require('../../assets/illustration/profile/05.png'),
  'org-ads': require('../../assets/illustration/profile/ads.png'),
  'org-dashboard': require('../../assets/illustration/profile/dashboard.png'),
};

type Props = {
  items: ProfileAction[];
};

/** Three-column grid of quick-action tiles. */
export default function ProfileActionGrid({ items }: Props) {
  const router = useRouter();
  const requireAuth = useRequireAuth();

  const navigate = (action: ProfileAction) => {
    const target = action.params ? { pathname: action.href, params: action.params } : action.href;
    const go = () => router.push(target as any);
    if (action.auth) requireAuth(go);
    else go();
  };

  return (
    <View style={styles.grid}>
      {items.map((action) => (
        <ProfileActionTile
          key={action.key}
          label={action.label}
          image={ACTION_ART[action.key]}
          onPress={() => navigate(action)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    paddingHorizontal: 12,
    marginTop: 24,
  },
});
```

- [ ] **Step 3: Write `ProfileMenu`**

```tsx
// apps/expo/components/profile/ProfileMenu.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import ProfileMenuItem from '@/components/ProfileMenuItem';
import { useTheme } from '@/context/ThemeContext';
import UploadIcon from '@/assets/icons/profile/upload.svg';
import SentIcon from '@/assets/icons/profile/sent.svg';
import NotificationIcon from '@/assets/icons/profile/notification.svg';
import HelpCircleIcon from '@/assets/icons/profile/help-circle.svg';
import ShieldUserIcon from '@/assets/icons/profile/shield-user.svg';
import SettingsIcon from '@/assets/icons/settings-01.svg';
import PencilIcon from '@/assets/icons/pencil.svg';
import CalendarIcon from '@/assets/icons/calendar-02.svg';
import TrashIcon from '@/assets/icons/profile/trash.svg';

type Props = {
  variant: 'guest' | 'personal' | 'org';
  /** Personal only: tourists/guests get the row, citizens have the tile. */
  showSubmitEventRow?: boolean;
};

const ICON = 20;

/** The two groups of menu rows under the profile content. */
export default function ProfileMenu({ variant, showSubmitEventRow = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const c = colors.textPrimary;
  const push = (href: Href) => () => router.push(href as any);
  const open = (url: string) => () => openBrowserAsync(url);

  const divider = <View style={[styles.divider, { backgroundColor: colors.border }]} />;

  if (variant === 'org') {
    return (
      <View style={styles.section}>
        <View style={styles.group}>
          <ProfileMenuItem icon={<PencilIcon width={ICON} height={ICON} color={c} />} label="Mein Profil" onPress={push('/edit-org' as Href)} />
          <ProfileMenuItem icon={<CalendarIcon width={ICON} height={ICON} color={c} />} label="Meine Veranstaltungen" onPress={push('/my-events' as Href)} />
          <ProfileMenuItem icon={<SentIcon width={ICON} height={ICON} color={c} />} label="Feedback geben" onPress={push('/feedback' as Href)} />
        </View>
        {divider}
        <View style={styles.group}>
          <ProfileMenuItem icon={<NotificationIcon width={ICON} height={ICON} color={c} />} label="Benachrichtigungen" onPress={push('/notifications' as Href)} />
          <ProfileMenuItem icon={<SettingsIcon width={ICON} height={ICON} color={c} />} label="Einstellungen" onPress={push('/org/settings' as Href)} />
          <ProfileMenuItem icon={<HelpCircleIcon width={ICON} height={ICON} color={c} />} label="Hilfe" onPress={push('/help' as Href)} />
          <ProfileMenuItem icon={<ShieldUserIcon width={ICON} height={ICON} color={c} />} label="Datenschutz" onPress={open('https://www.roebel.app/datenschutz')} />
        </View>
      </View>
    );
  }

  const isGuest = variant === 'guest';
  return (
    <View style={styles.section}>
      <View style={styles.group}>
        {(isGuest || showSubmitEventRow) && (
          <ProfileMenuItem icon={<UploadIcon width={ICON} height={ICON} color={c} />} label="Veranstaltung einsenden" onPress={push('/submit-event' as Href)} />
        )}
        <ProfileMenuItem icon={<CalendarIcon width={ICON} height={ICON} color={c} />} label="Meine Veranstaltungen" onPress={push('/my-events' as Href)} />
        {!isGuest && (
          <ProfileMenuItem icon={<TrashIcon width={ICON} height={ICON} color={c} />} label="Abfallkalender" onPress={push('/abfallkalender' as Href)} />
        )}
        <ProfileMenuItem icon={<SentIcon width={ICON} height={ICON} color={c} />} label="Feedback geben" onPress={push('/feedback' as Href)} />
      </View>
      {divider}
      <View style={styles.group}>
        <ProfileMenuItem icon={<NotificationIcon width={ICON} height={ICON} color={c} />} label="Benachrichtigungen" onPress={push('/notifications' as Href)} />
        <ProfileMenuItem icon={<SettingsIcon width={ICON} height={ICON} color={c} />} label="Einstellungen" onPress={push('/settings' as Href)} />
        <ProfileMenuItem icon={<HelpCircleIcon width={ICON} height={ICON} color={c} />} label="Hilfe" onPress={push('/help' as Href)} />
        {isGuest && (
          <ProfileMenuItem icon={<HelpCircleIcon width={ICON} height={ICON} color={c} />} label="Über die App" onPress={open('https://www.roebel.app/about')} />
        )}
        <ProfileMenuItem icon={<ShieldUserIcon width={ICON} height={ICON} color={c} />} label="Datenschutz" onPress={open('https://www.roebel.app/datenschutz')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  group: {
    gap: 8,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
});
```

`assets/icons/profile/trash.svg` does not exist yet: copy the outline from an existing 24px icon set or create a simple stroke SVG:

```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4 7H20M10 11V17M14 11V17M5 7L6 19C6 20.1046 6.89543 21 8 21H16C17.1046 21 18 20.1046 18 19L19 7M9 7V4C9 3.44772 9.44772 3 10 3H14C14.5523 3 15 3.44772 15 4V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Save it as `apps/expo/assets/icons/profile/trash.svg`. (The transformer maps `color` → `currentColor`.)

- [ ] **Step 4: Type-check**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/profile/(ProfileActionTile|ProfileActionGrid|ProfileMenu)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/profile/ProfileActionTile.tsx apps/expo/components/profile/ProfileActionGrid.tsx apps/expo/components/profile/ProfileMenu.tsx apps/expo/assets/icons/profile/trash.svg
git commit -m "feat(expo): rounded-square action tiles, grid and profile menu"
git push
```

---

### Task 10: `useDailyMint`

**Files:**
- Create: `apps/expo/hooks/useDailyMint.ts`

**Interfaces:**
- Consumes: `useRoebelTaler()` (`mintable`, `minting`, `onboarded`, `talerBalance`, `dailyMint`, `enqueueSettlement`, `account`), helpers from Task 3.
- Produces: `type DailyMintState = 'hidden' | 'idle' | 'claimable'`; `useDailyMint({ isCitizen }): { state; amount; claim(): boolean }`.

- [ ] **Step 1: Write the hook**

```ts
// apps/expo/hooks/useDailyMint.ts
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';
import {
  MIN_MINTABLE,
  MINT_COOLDOWN_MS,
  claimAmount,
  computeNextStreak,
  dayStart,
  isInCooldown,
  rtClaimKey,
  rtStreakKey,
} from '@/lib/muenzen-daily-mint';

export type DailyMintState = 'hidden' | 'idle' | 'claimable';

/**
 * Drives the profile's Münzen button. `claimable` when the hourly Circles
 * mint has accrued; `claim()` writes the same optimistic cooldown/streak the
 * Münzen page writes and hands the mint to the provider's settlement queue
 * (no full-screen overlay — the button animates instead).
 */
export function useDailyMint(opts: { isCitizen: boolean }) {
  const { mintable, minting, onboarded, talerBalance, dailyMint, enqueueSettlement, account } = useRoebelTaler();
  const address = account?.address ?? null;

  const [lastClaim, setLastClaim] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setLoaded(false);
    if (!address) {
      setLastClaim(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(rtClaimKey(address))
      .then((v) => {
        if (cancelled) return;
        setLastClaim(v ? Number(v) : null);
        setNow(Date.now());
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Wake once when the cooldown ends instead of ticking every second.
  useEffect(() => {
    if (lastClaim == null) return;
    const remaining = lastClaim + MINT_COOLDOWN_MS - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(id);
  }, [lastClaim]);

  const inCooldown = isInCooldown(lastClaim, now);
  const amount = claimAmount(mintable);
  const claimable = loaded && !!address && onboarded && !minting && !inCooldown && mintable >= MIN_MINTABLE;
  const hasMoney = onboarded || talerBalance > 0;

  const state: DailyMintState = !address
    ? 'hidden'
    : claimable
      ? 'claimable'
      : opts.isCitizen || hasMoney
        ? 'idle'
        : 'hidden';

  const claim = useCallback((): boolean => {
    if (!address || !claimable) return false;
    const ts = Date.now();
    const prevLastClaim = lastClaim;
    const received = amount;

    setLastClaim(ts);
    setNow(ts);
    AsyncStorage.setItem(rtClaimKey(address), String(ts)).catch(() => {});
    AsyncStorage.getItem(rtStreakKey(address))
      .then((raw) => {
        let prevStreak = 0;
        try {
          prevStreak = raw ? Number(JSON.parse(raw)?.count) || 0 : 0;
        } catch {
          prevStreak = 0;
        }
        const next = computeNextStreak(prevStreak, prevLastClaim, ts);
        return AsyncStorage.setItem(rtStreakKey(address), JSON.stringify({ count: next, lastDay: dayStart(ts) }));
      })
      .catch(() => {});

    enqueueSettlement({
      label: 'Münzen',
      amount: received,
      settle: dailyMint,
      onFailed: () => {
        // Roll the optimistic cooldown back so the user can retry; the accrual
        // is still on-chain and reappears on the next refresh.
        setLastClaim(prevLastClaim);
        if (prevLastClaim != null) AsyncStorage.setItem(rtClaimKey(address), String(prevLastClaim)).catch(() => {});
        else AsyncStorage.removeItem(rtClaimKey(address)).catch(() => {});
      },
    });
    return true;
  }, [address, amount, claimable, dailyMint, enqueueSettlement, lastClaim]);

  return { state, amount, claim };
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "hooks/useDailyMint" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/hooks/useDailyMint.ts
git commit -m "feat(expo): useDailyMint drives the profile Münzen button"
git push
```

---

### Task 11: `CoinFlipBurst` and `MuenzenButton`

**Files:**
- Create: `apps/expo/components/profile/CoinFlipBurst.tsx`
- Create: `apps/expo/components/profile/MuenzenButton.tsx`

**Interfaces:**
- Consumes: reanimated 4, expo-linear-gradient, expo-haptics, `chevron-right.svg`, coin art (`assets/illustration/muenzen/top_hero_coin.png`, `assets/illustration/gamification/single.png`, `assets/illustration/gamification/stack.png`).
- Produces: `CoinFlipBurst` (props `count`, `onDone`); `MuenzenButton` (props `state: 'idle' | 'claimable'`, `amount`, `onClaim: () => boolean`, `onOpen: () => void`).

- [ ] **Step 1: Write `CoinFlipBurst`**

```tsx
// apps/expo/components/profile/CoinFlipBurst.tsx
import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const COIN = require('../../assets/illustration/gamification/single.png');

export const BURST_STAGGER_MS = 90;
export const BURST_DURATION_MS = 640;
const MAX_COINS = 5;
const COIN_SIZE = 24;

type Props = {
  count: number;
  onDone: () => void;
};

/**
 * Coins that pop up from the button, flip once and a half, and fade.
 * Absolutely positioned over the button's top edge; pointer-events off.
 */
export default function CoinFlipBurst({ count, onDone }: Props) {
  const n = Math.min(Math.max(count, 1), MAX_COINS);

  useEffect(() => {
    const id = setTimeout(onDone, BURST_STAGGER_MS * (n - 1) + BURST_DURATION_MS + 60);
    return () => clearTimeout(id);
  }, [n, onDone]);

  return (
    <View pointerEvents="none" style={styles.layer}>
      {Array.from({ length: n }, (_, i) => (
        <CoinSprite key={i} index={i} total={n} />
      ))}
    </View>
  );
}

function CoinSprite({ index, total }: { index: number; total: number }) {
  const progress = useSharedValue(0);
  const spreadX = (index - (total - 1) / 2) * 16;

  useEffect(() => {
    progress.value = withDelay(
      index * BURST_STAGGER_MS,
      withTiming(1, { duration: BURST_DURATION_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [index, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const rise = interpolate(p, [0, 0.6, 1], [0, -56, -44], Extrapolation.CLAMP);
    const scale = interpolate(p, [0, 0.4, 1], [0.5, 1, 0.8], Extrapolation.CLAMP);
    const opacity = interpolate(p, [0, 0.05, 0.65, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [
        { perspective: 500 },
        { translateX: spreadX },
        { translateY: rise },
        { rotateY: `${p * 540}deg` },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.sprite, style]}>
      <Image source={COIN} style={styles.coin} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 0,
    alignItems: 'center',
    overflow: 'visible',
  },
  sprite: {
    position: 'absolute',
    top: -COIN_SIZE / 2,
    width: COIN_SIZE,
    height: COIN_SIZE,
  },
  coin: {
    width: COIN_SIZE,
    height: COIN_SIZE,
  },
});
```

- [ ] **Step 2: Write `MuenzenButton`**

```tsx
// apps/expo/components/profile/MuenzenButton.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import CoinFlipBurst from './CoinFlipBurst';

const COIN_TILTED = require('../../assets/illustration/muenzen/top_hero_coin.png');
const COIN_STACK = require('../../assets/illustration/gamification/stack.png');

export type MuenzenButtonState = 'idle' | 'claimable';

type Props = {
  state: MuenzenButtonState;
  /** Whole Münzen the claim lands (label "+N Münze(n)"). */
  amount: number;
  /** Runs the claim; return false to abort the animation. */
  onClaim: () => boolean;
  /** Idle press → Münzen page. */
  onOpen: () => void;
};

const HEIGHT = 44;
const RADIUS = HEIGHT / 2;
const BORDER = 1.5;
const PRESS_DEPTH = 3;
const SWAP_AT_MS = 300;
const DONE_AT_MS = 900;

const GOLD = {
  border: ['#EAD98A', '#B9992F'] as const,
  fill: ['#FFF9D6', '#FFEE93', '#F9DF63'] as const,
  fillLocations: [0, 0.55, 1] as const,
  text: '#4A3E0B',
  shadow: '0px 4px 10px rgba(110, 85, 0, 0.28)',
  shadowFill: '#F9DF63',
};

/**
 * The profile's Münzen button. Claimable: a golden 3D pill ("+1 Münze") that
 * pushes down on press; on release coins flip up out of it and it morphs into
 * the neutral "Münzen ›" pill that opens the Münzen page.
 */
export default function MuenzenButton({ state, amount, onClaim, onOpen }: Props) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();

  // Choreography state: hold the golden look until the crossfade point.
  const [claiming, setClaiming] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [burstCount, setBurstCount] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const visual: MuenzenButtonState = claiming ? (swapped ? 'idle' : 'claimable') : state;
  const isGold = visual === 'claimable';

  // Press mechanics: surface sinks, shadow hides.
  const pressed = useSharedValue(0);
  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * PRESS_DEPTH }],
  }));
  const shadowStyle = useAnimatedStyle(() => ({ opacity: 1 - pressed.value }));

  // Skin crossfade (gold ↔ neutral) independent of the content swap.
  const gold = useSharedValue(isGold ? 1 : 0);
  useEffect(() => {
    gold.value = reducedMotion ? (isGold ? 1 : 0) : withTiming(isGold ? 1 : 0, { duration: 260 });
  }, [gold, isGold, reducedMotion]);
  const goldSkinStyle = useAnimatedStyle(() => ({ opacity: gold.value }));
  const neutralSkinStyle = useAnimatedStyle(() => ({ opacity: 1 - gold.value }));

  const handlePressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: 90 });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [pressed]);

  const handlePressOut = useCallback(() => {
    pressed.value = withSpring(0, { damping: 14, stiffness: 260 });
  }, [pressed]);

  const handlePress = useCallback(() => {
    if (claiming) return;
    if (visual === 'idle') {
      onOpen();
      return;
    }
    if (!onClaim()) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (reducedMotion) return; // the prop flips to idle; skin swaps instantly
    setClaiming(true);
    setSwapped(false);
    timers.current.push(setTimeout(() => setBurstCount(amount), 40));
    timers.current.push(setTimeout(() => setSwapped(true), SWAP_AT_MS));
    timers.current.push(
      setTimeout(() => {
        setClaiming(false);
        setSwapped(false);
      }, DONE_AT_MS),
    );
  }, [amount, claiming, onClaim, onOpen, reducedMotion, visual]);

  const handleBurstDone = useCallback(() => setBurstCount(0), []);

  const label = isGold ? (amount === 1 ? '+1 Münze' : `+${amount} Münzen`) : 'Münzen';
  const neutralBorder = isDark ? (['#4A4D52', '#2D2E31'] as const) : (['#E9E9E9', '#CFCFCF'] as const);
  const neutralFill = isDark ? ([colors.surfaceSecondary, colors.surface] as const) : (['#FFFFFF', '#F4F4F5'] as const);
  const neutralShadow = isDark ? '0px 2px 6px rgba(0,0,0,0.35)' : '0px 2px 6px rgba(0,0,0,0.10)';

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={claiming}
      accessibilityRole="button"
      accessibilityLabel={isGold ? `${label} abholen` : 'Münzen anzeigen'}
      style={styles.root}
    >
      {/* Static shadow layer: the surface sinks onto it while it fades. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadowLayer,
          shadowStyle,
          { backgroundColor: isGold ? GOLD.shadowFill : neutralFill[1], boxShadow: isGold ? GOLD.shadow : neutralShadow },
        ]}
      />

      <Animated.View style={[styles.surface, surfaceStyle]} layout={LinearTransition.duration(260)}>
        <View style={styles.clip}>
          {/* Gold skin */}
          <Animated.View style={[StyleSheet.absoluteFill, goldSkinStyle]} pointerEvents="none">
            <LinearGradient colors={[...GOLD.border]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.borderFill}>
              <LinearGradient
                colors={[...GOLD.fill]}
                locations={[...GOLD.fillLocations]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.innerFill}
              />
              <View style={styles.rim} />
            </LinearGradient>
          </Animated.View>
          {/* Neutral skin */}
          <Animated.View style={[StyleSheet.absoluteFill, neutralSkinStyle]} pointerEvents="none">
            <LinearGradient colors={[...neutralBorder]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.borderFill}>
              <LinearGradient colors={[...neutralFill]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.innerFill} />
            </LinearGradient>
          </Animated.View>

          {isGold ? (
            <Animated.View key="claimable" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.content}>
              <Image source={COIN_TILTED} style={styles.coinTilted} resizeMode="contain" />
              <Text style={[styles.label, { color: GOLD.text }]}>{label}</Text>
            </Animated.View>
          ) : (
            <Animated.View key="idle" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.content}>
              <Image source={COIN_STACK} style={styles.coinStack} resizeMode="contain" />
              <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
              <ChevronRightIcon width={16} height={16} color={colors.textSecondary} />
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {burstCount > 0 && <CoinFlipBurst count={burstCount} onDone={handleBurstDone} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
  },
  shadowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS,
  },
  surface: {
    height: HEIGHT,
    borderRadius: RADIUS,
  },
  clip: {
    flex: 1,
    borderRadius: RADIUS,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  borderFill: {
    flex: 1,
    borderRadius: RADIUS,
  },
  innerFill: {
    flex: 1,
    margin: BORDER,
    borderRadius: RADIUS - BORDER,
  },
  rim: {
    position: 'absolute',
    top: BORDER + 1,
    left: 14,
    right: 14,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 14,
  },
  coinTilted: {
    width: 26,
    height: 28,
  },
  coinStack: {
    width: 28,
    height: 28,
  },
  label: {
    fontSize: 15,
    fontFamily: 'MonaSans-SemiBold',
  },
});
```

- [ ] **Step 3: Type-check**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/profile/(CoinFlipBurst|MuenzenButton)" || echo "clean"`
Expected: `clean`. If `boxShadow` is rejected on `ViewStyle`, cast the style object `as ViewStyle` (same as `lib/shadow.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/expo/components/profile/CoinFlipBurst.tsx apps/expo/components/profile/MuenzenButton.tsx
git commit -m "feat(expo): golden Münzen button with push-down press and coin-flip claim"
git push
```

---

### Task 12: Compose the new profile screen

**Files:**
- Rewrite: `apps/expo/app/profile.tsx`
- Delete: `apps/expo/components/profile/ProfileHeaderCard.tsx`, `CoinsCard.tsx`, `TouristActionRow.tsx`, `OrgActionCards.tsx`, `ProfileContent.tsx`, `ProfileModeCards.tsx`, `apps/expo/components/AccountSwitcher.tsx`, `apps/expo/components/FlippableIdentityCard.tsx`, `apps/expo/components/ProfilePromoCard.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–11 plus existing `BottomNavigation`, `GlassProvider`/`GlassBackdrop`, `LoginDrawer`, `LogoutDrawer`, `KontoCard`, `StoryCollectionsBar`, `RewardsCTABanner`, `CitizenVerificationBanner`, `BuergerWerdenBanner`, `BusinessStatusBanner`, `useIsCitizen`, `useVerificationContext`, `useUser`, `useAccount`, `useIsBusinessOwner`.

- [ ] **Step 1: Write the new screen**

```tsx
// apps/expo/app/profile.tsx
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { useIsBusinessOwner } from '@/hooks/useIsBusinessOwner';
import { useIsCitizen } from '@/hooks/useIsCitizen';
import { useDailyMint } from '@/hooks/useDailyMint';
import { useOrgMemberPreview } from '@/hooks/useOrgMemberPreview';
import { useAccount } from '@/context/AccountContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useUser } from '@/context/UserContext';
import { useTheme } from '@/context/ThemeContext';
import { Events, track } from '@/lib/analytics';
import { credentialKindsFor, type CredentialKind } from '@/lib/credentials';
import { profileHeaderTitle } from '@/lib/profile-header';
import { ORG_PROFILE_ACTIONS, PERSONAL_PROFILE_ACTIONS } from '@/lib/profile-actions';
import { SUB_TYPE_EMOJI } from '@/lib/types';
import KontoCard from '@/components/payments/KontoCard';
import BottomNavigation, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';
import { GlassBackdrop, GlassProvider } from '@/components/GlassSurface';
import LoginDrawer from '@/components/LoginDrawer';
import LogoutDrawer from '@/components/LogoutDrawer';
import BuergerWerdenBanner from '@/components/profile/BuergerWerdenBanner';
import BusinessStatusBanner from '@/components/BusinessStatusBanner';
import RewardsCTABanner from '@/components/profile/RewardsCTABanner';
import CitizenVerificationBanner from '@/components/profile/CitizenVerificationBanner';
import StoryCollectionsBar from '@/components/feed/StoryCollectionsBar';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ProfileSheet from '@/components/profile/ProfileSheet';
import CredentialCardStack from '@/components/profile/CredentialCardStack';
import IdentityRow from '@/components/profile/IdentityRow';
import OrgIdentityRow from '@/components/profile/OrgIdentityRow';
import MuenzenButton from '@/components/profile/MuenzenButton';
import ProfileActionGrid from '@/components/profile/ProfileActionGrid';
import ProfileMenu from '@/components/profile/ProfileMenu';
import AccountSwitchSheet from '@/components/profile/AccountSwitchSheet';
import { fetchProfileStoryCollections, type StoryCollection } from '@/lib/supabase-story-collections';
import QrCodeIcon from '@/assets/icons/qr-code.svg';

type Tab = 'home' | 'explore' | 'profile';

export default function ProfileScreen() {
  const router = useRouter();
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { hasAttesterNFT, hasAnyNFT, activePendingRequest, userRequests, refresh } = useVerificationContext();
  const isCitizen = useIsCitizen();
  const { user, refreshUser } = useUser();
  const { activeAccount, ownedAccounts, recentOtherAccounts, switchAccount, refreshAccounts } = useAccount();
  const { isBusinessOwner, businesses } = useIsBusinessOwner();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [showLoginDrawer, setShowLoginDrawer] = useState(false);
  const [showLogoutDrawer, setShowLogoutDrawer] = useState(false);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [storyCollections, setStoryCollections] = useState<StoryCollection[]>([]);

  const isConnected = !!account;
  const isOrg = activeAccount?.account_type === 'organisation';
  const citizenRequest = userRequests.find((r: any) => r.nft_type === 'citizen') || null;
  const isAspiringCitizen = !isOrg && !isCitizen && !!citizenRequest && user?.preferred_role !== 'tourist';
  const wantsToBeCitizen = !isOrg && !isCitizen && !isAspiringCitizen && user?.preferred_role === 'buerger';
  const showGrid = !isOrg && (isCitizen || isAspiringCitizen);
  const userBusiness = businesses.find((b) => b.status === 'published') || businesses[0] || null;

  const mint = useDailyMint({ isCitizen });
  const members = useOrgMemberPreview(isOrg ? activeAccount?.id : undefined);

  useEffect(() => {
    if (isConnected && showLoginDrawer) setShowLoginDrawer(false);
  }, [isConnected, showLoginDrawer]);

  useEffect(() => {
    fetchProfileStoryCollections().then(setStoryCollections);
  }, []);

  const handleDisconnect = async () => {
    if (wallet) {
      track(Events.LOGOUT, { tier: user?.tier });
      disconnect(wallet);
      setShowLogoutDrawer(false);
    }
  };

  const handleTabPress = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'home') router.replace('/');
    else if (tab === 'explore') router.push('/explore');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshUser(), refreshAccounts()]);
    setRefreshing(false);
  };

  const displayName = user?.display_name || user?.username || 'Du';
  const personalAvatarUrl = user?.profile_picture_url ?? null;
  const profileHref = user?.username
    ? ({ pathname: '/user/[username]', params: { username: user.username } } as const)
    : ('/edit-profile' as const);
  const credentialKinds = credentialKindsFor({ isCitizen, isAttester: !!hasAttesterNFT });
  const openExplainer = (kind: CredentialKind) =>
    router.push({ pathname: '/citizen-verification', params: { card: kind } } as any);

  const muenzenSlot =
    mint.state === 'hidden' ? null : (
      <MuenzenButton
        state={mint.state}
        amount={mint.amount}
        onClaim={mint.claim}
        onOpen={() => router.push('/rewards' as any)}
      />
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <GlassProvider>
        <ProfileHeader
          title={isConnected ? profileHeaderTitle(activeAccount) : 'Profil'}
          switcherVisible={isConnected && ownedAccounts.length > 1}
          recentOtherAccounts={recentOtherAccounts}
          personalAvatarUrl={personalAvatarUrl}
          onSwitch={() => setShowAccountSheet(true)}
        />

        <GlassBackdrop style={styles.content}>
          <ScrollView
            style={styles.content}
            contentContainerStyle={{ paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          >
            {!isConnected ? (
              <ProfileSheet flat>
                <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Noch keinen Account</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Sie sind noch nicht angemeldet.</Text>
                  <Pressable
                    style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                    onPress={() => setShowLoginDrawer(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Jetzt anmelden"
                  >
                    <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Jetzt Anmelden</Text>
                  </Pressable>
                </View>
                <RewardsCTABanner variant="guest" />
                <ProfileMenu variant="guest" />
              </ProfileSheet>
            ) : isOrg ? (
              <ProfileSheet flat>
                <OrgIdentityRow
                  name={activeAccount?.name || 'Organisation'}
                  avatarUrl={activeAccount?.avatar_url || activeAccount?.cover_url || null}
                  emoji={(activeAccount?.sub_type && SUB_TYPE_EMOJI[activeAccount.sub_type]) || '🏢'}
                  verified={!!activeAccount?.is_verified}
                  members={members.users}
                  memberCount={members.count}
                  onMembers={() => router.push('/org/manage' as any)}
                />
                {isBusinessOwner && userBusiness && userBusiness.status !== 'published' && (
                  <View style={styles.bannerWrap}>
                    <BusinessStatusBanner
                      business={userBusiness}
                      onPress={() => router.push({ pathname: '/org-status', params: { businessId: userBusiness.id } } as any)}
                    />
                  </View>
                )}
                <ProfileActionGrid items={ORG_PROFILE_ACTIONS} />
                <ProfileMenu variant="org" />
              </ProfileSheet>
            ) : (
              <>
                <CredentialCardStack kinds={credentialKinds} onPress={openExplainer} />
                <ProfileSheet>
                  <IdentityRow
                    name={displayName}
                    avatarUrl={personalAvatarUrl}
                    verified={isCitizen || !!hasAttesterNFT}
                    onPress={() => router.push(profileHref as any)}
                    right={muenzenSlot}
                  />
                  {isAspiringCitizen && (
                    <View style={styles.bannerWrap}>
                      <CitizenVerificationBanner pending={!!activePendingRequest} />
                    </View>
                  )}
                  {wantsToBeCitizen && (
                    <View style={styles.bannerWrap}>
                      <BuergerWerdenBanner />
                    </View>
                  )}
                  {showGrid && <ProfileActionGrid items={PERSONAL_PROFILE_ACTIONS} />}
                  <KontoCard />
                  {(isCitizen || isAspiringCitizen || wantsToBeCitizen) && (
                    <StoryCollectionsBar collections={storyCollections} heading="Lerne mehr über die Röbel App" />
                  )}
                  <ProfileMenu variant="personal" showSubmitEventRow={!showGrid} />
                </ProfileSheet>
              </>
            )}
          </ScrollView>
        </GlassBackdrop>

        {hasAnyNFT && (
          <Pressable
            onPress={() => router.push('/verification/scan' as any)}
            style={[styles.qrFab, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="QR-Code scannen"
          >
            <QrCodeIcon width={24} height={24} color={colors.onPrimary} />
          </Pressable>
        )}

        <View style={styles.navOverlay}>
          <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} glass />
        </View>

        <LoginDrawer visible={showLoginDrawer} onClose={() => setShowLoginDrawer(false)} />
        <LogoutDrawer visible={showLogoutDrawer} onClose={() => setShowLogoutDrawer(false)} onLogout={handleDisconnect} />
        <AccountSwitchSheet
          visible={showAccountSheet}
          onClose={() => setShowAccountSheet(false)}
          accounts={ownedAccounts}
          activeAccountId={activeAccount?.id ?? null}
          personalAvatarUrl={personalAvatarUrl}
          personalName={user?.username ?? null}
          onSelect={(id) => {
            switchAccount(id);
            setShowAccountSheet(false);
          }}
          onLogout={() => {
            setShowAccountSheet(false);
            if (wallet) disconnect(wallet);
          }}
        />
      </GlassProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  navOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bannerWrap: { marginTop: 16 },
  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Medium', marginBottom: 4 },
  emptySubtitle: { fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 12 },
  primaryButton: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  qrFab: {
    position: 'absolute',
    bottom: BOTTOM_NAV_HEIGHT + 40,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
});
```

Check that `CitizenVerificationBanner` and `BuergerWerdenBanner` set their own horizontal margins (they do: `marginHorizontal: 16` inside their card styles); `bannerWrap` only adds the vertical gap. `KontoCard` and `StoryCollectionsBar` keep their own spacing as before.

- [ ] **Step 2: Delete superseded components**

```bash
cd apps/expo
git rm components/profile/ProfileHeaderCard.tsx components/profile/CoinsCard.tsx components/profile/TouristActionRow.tsx components/profile/OrgActionCards.tsx components/profile/ProfileContent.tsx components/profile/ProfileModeCards.tsx components/AccountSwitcher.tsx components/FlippableIdentityCard.tsx components/ProfilePromoCard.tsx
grep -rlE "ProfileHeaderCard|CoinsCard|TouristActionRow|OrgActionCards|ProfileContent|ProfileModeCards|components/AccountSwitcher|FlippableIdentityCard|ProfilePromoCard" app components hooks lib context || echo "no importers left"
```
Expected: `no importers left` (a comment-only mention in `hooks/useIsBusinessOwner.ts` is fine; check it is a comment).

- [ ] **Step 3: Type-check the screen and its components**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/profile.tsx|components/profile/|components/PressableScale|components/GlassPill|hooks/useDailyMint|hooks/useOrgMemberPreview|lib/(credentials|profile-header|profile-actions|muenzen-daily-mint)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Run the whole profile test set**

Run: `cd apps/expo && CI=true npx jest lib/__tests__/credentials.test.ts lib/__tests__/muenzen-daily-mint.test.ts lib/__tests__/profile-header.test.ts lib/__tests__/profile-actions.test.ts components/__tests__/CredentialCardStack-test.tsx --watchAll=false`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/app/profile.tsx
git commit -m "feat(expo): compose the redesigned profile screen and drop the superseded cards"
git push
```

---

### Task 13: Credential explainer with swipeable cards

**Files:**
- Create: `apps/expo/components/profile/CredentialCarousel.tsx`
- Create: `apps/expo/components/profile/CredentialQrSheet.tsx`
- Rewrite: `apps/expo/app/citizen-verification.tsx`
- Delete: `apps/expo/components/profile/CitizenPassportCard.tsx`

**Interfaces:**
- Consumes: `CredentialCard` (Task 6), `CREDENTIAL_COPY`, `credentialKindsFor`, `BenefitIcon` (Task 2), `BottomDrawer`, `CompleteCitizenDataBanner`, `react-native-qrcode-svg`.
- Produces: `CredentialCarousel` (props `kinds: CredentialKind[]` front-first, `initialKind`, `onActiveChange(kind)`); `CredentialQrSheet` (props `visible`, `onClose`, `requestId: number | null`).

- [ ] **Step 1: Write `CredentialCarousel`**

```tsx
// apps/expo/components/profile/CredentialCarousel.tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { CredentialKind } from '@/lib/credentials';
import CredentialCard from './CredentialCard';

const GAP = 12;
/** How much of the next card is teased at the right edge. */
const TEASE = 28;

type Props = {
  /** Front-first: the card the user tapped comes first. */
  kinds: CredentialKind[];
  initialKind?: CredentialKind;
  onActiveChange: (kind: CredentialKind) => void;
};

/**
 * Full-size cards in a horizontally snapping row. With one card it is a
 * plain full-width card; with more, the next card peeks in from the right.
 */
export default function CredentialCarousel({ kinds, initialKind, onActiveChange }: Props) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const multi = kinds.length > 1;
  const cardWidth = multi ? screenWidth - 32 - TEASE : screenWidth - 32;
  const interval = cardWidth + GAP;
  const initialIndex = Math.max(0, kinds.indexOf(initialKind ?? kinds[0]));
  const [active, setActive] = useState(initialIndex);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 55 }), []);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') {
      setActive(first.index);
      onActiveChange(kinds[first.index]);
    }
  }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: CredentialKind; index: number }) => (
      <CredentialCard kind={item} width={cardWidth} style={{ marginRight: index === kinds.length - 1 ? 0 : GAP }} />
    ),
    [cardWidth, kinds.length],
  );

  if (!multi) {
    return (
      <View style={styles.single}>
        <CredentialCard kind={kinds[0]} width={cardWidth} />
      </View>
    );
  }

  return (
    <View>
      <FlatList
        horizontal
        data={kinds}
        keyExtractor={(k) => k}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: interval, offset: interval * index, index })}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        style={styles.overflow}
      />
      <View style={styles.dots} accessibilityRole="none">
        {kinds.map((k, i) => (
          <View key={k} style={[styles.dot, { backgroundColor: i === active ? colors.primary : colors.border }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  single: { paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 8 },
  overflow: { overflow: 'visible' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
```

- [ ] **Step 2: Write `CredentialQrSheet`**

```tsx
// apps/expo/components/profile/CredentialQrSheet.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  requestId: number | null;
};

/** The Bürgerausweis QR (deep link to the verification request) in a drawer. */
export default function CredentialQrSheet({ visible, onClose, requestId }: Props) {
  const { colors } = useTheme();
  return (
    <BottomDrawer visible={visible} onClose={onClose} snapPoint={0.55}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Bürgerausweis vorzeigen</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Bescheiniger:innen scannen diesen Code, um deinen Ausweis zu prüfen.
      </Text>
      <View style={styles.qrWrap}>
        {requestId ? (
          <View style={styles.qrCard}>
            <QRCode value={`roebel://verification/request/${requestId}?type=citizen`} size={200} />
          </View>
        ) : (
          <Text style={[styles.sub, { color: colors.textSecondary }]}>Für diesen Ausweis liegt kein Antrag vor.</Text>
        )}
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginBottom: 6 },
  sub: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  qrWrap: { alignItems: 'center', paddingVertical: 24 },
  qrCard: { padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF' },
});
```

- [ ] **Step 3: Rewrite the explainer screen**

```tsx
// apps/expo/app/citizen-verification.tsx
// Credential explainer: the account's cards, swipeable, with what each unlocks.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useIsCitizen } from '@/hooks/useIsCitizen';
import { CREDENTIAL_COPY, credentialKindsFor, type BenefitIcon, type CredentialKind } from '@/lib/credentials';
import CredentialCarousel from '@/components/profile/CredentialCarousel';
import CredentialQrSheet from '@/components/profile/CredentialQrSheet';
import CompleteCitizenDataBanner from '@/components/profile/CompleteCitizenDataBanner';
import VoteIcon from '@/assets/icons/delegate.svg';
import CoinsIcon from '@/assets/icons/coins-01.svg';
import OrgIcon from '@/assets/icons/community.svg';
import UploadIcon from '@/assets/icons/profile/upload.svg';
import SignatureIcon from '@/assets/icons/pencil-edit-01.svg';
import ShieldIcon from '@/assets/icons/profile/shield-user.svg';
import CalendarIcon from '@/assets/icons/calendar-02.svg';
import ListingIcon from '@/assets/icons/package.svg';
import FeedbackIcon from '@/assets/icons/profile/sent.svg';
import ScanIcon from '@/assets/icons/qr-code.svg';
import TallyIcon from '@/assets/icons/badge-check.svg';

const BENEFIT_ICONS: Record<BenefitIcon, React.ComponentType<{ width: number; height: number; color: string }>> = {
  vote: VoteIcon,
  coins: CoinsIcon,
  org: OrgIcon,
  upload: UploadIcon,
  signature: SignatureIcon,
  shield: ShieldIcon,
  calendar: CalendarIcon,
  listing: ListingIcon,
  feedback: FeedbackIcon,
  scan: ScanIcon,
  tally: TallyIcon,
};

const KINDS: CredentialKind[] = ['guest', 'citizen', 'attester'];

export default function CredentialExplainerScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { card } = useLocalSearchParams<{ card?: string }>();
  const isCitizen = useIsCitizen();
  const { hasAttesterNFT, userRequests, activePendingRequest } = useVerificationContext();

  // Front-first so the tapped card is the one on screen.
  const kinds = useMemo(
    () => [...credentialKindsFor({ isCitizen, isAttester: !!hasAttesterNFT })].reverse(),
    [hasAttesterNFT, isCitizen],
  );
  const requested = KINDS.includes(card as CredentialKind) ? (card as CredentialKind) : undefined;
  const initialKind = requested && kinds.includes(requested) ? requested : kinds[0];
  const [active, setActive] = useState<CredentialKind>(initialKind);
  const [showQr, setShowQr] = useState(false);

  const citizenRequest = userRequests.find((r: any) => r.nft_type === 'citizen') || null;
  const copy = CREDENTIAL_COPY[active];
  const tileBg = isDark ? colors.surfaceSecondary : '#F2F3F5';

  const onCta = () => {
    switch (copy.cta?.kind) {
      case 'become-citizen':
        router.push((activePendingRequest ? '/verification/my-request' : '/verification/request-citizen') as any);
        return;
      case 'show-qr':
        setShowQr(true);
        return;
      case 'scan':
        router.push('/verification/scan' as any);
        return;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          hitSlop={12}
        >
          <ArrowLeftIcon size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CredentialCarousel kinds={kinds} initialKind={initialKind} onActiveChange={setActive} />

        <Animated.View key={active} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.body}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{copy.title}</Text>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>{copy.intro}</Text>

          {active === 'citizen' && <CompleteCitizenDataBanner embedded />}

          <View style={styles.benefits}>
            {copy.benefits.map((b) => {
              const Icon = BENEFIT_ICONS[b.icon];
              return (
                <View key={b.title} style={styles.benefit}>
                  <View style={[styles.benefitIcon, { backgroundColor: tileBg }]}>
                    <Icon width={20} height={20} color={colors.textPrimary} />
                  </View>
                  <View style={styles.benefitText}>
                    <Text style={[styles.benefitTitle, { color: colors.textPrimary }]}>{b.title}</Text>
                    <Text style={[styles.benefitDesc, { color: colors.textSecondary }]}>{b.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {copy.cta && (
            <Pressable
              onPress={onCta}
              style={({ pressed }) => [styles.cta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={copy.cta.label}
            >
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{copy.cta.label}</Text>
            </Pressable>
          )}

          {active === 'citizen' && (
            <Text style={[styles.footnote, { color: colors.textSecondary }]}>
              Unser Verifizierungsprozess gleicht die Daten einer Person mit vertrauenswürdigen Drittquellen oder einem
              amtlichen Ausweis ab.{' '}
              <Text
                style={[styles.link, { color: colors.textPrimary }]}
                onPress={() => openBrowserAsync('https://www.roebel.app/buergerausweis')}
              >
                Mehr erfahren
              </Text>
            </Text>
          )}
        </Animated.View>
      </ScrollView>

      <CredentialQrSheet visible={showQr} onClose={() => setShowQr(false)} requestId={citizenRequest?.request_id ?? null} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 8, paddingBottom: 48 },
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  title: { fontSize: 22, fontFamily: 'MonaSansSemiCondensed-Bold' },
  intro: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter-Regular' },
  benefits: { gap: 14, marginTop: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, gap: 2 },
  benefitTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  benefitDesc: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter-Regular' },
  cta: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaText: { fontSize: 14, fontFamily: 'MonaSansSemiCondensed-Bold' },
  footnote: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter-Regular' },
  link: { fontFamily: 'Inter-Medium', textDecorationLine: 'underline' },
});
```

If an icon SVG lacks `currentColor` and ignores `color`, swap it for another from `assets/icons` that renders in one stroke color; verify by reading the SVG's `stroke`/`fill` attributes.

- [ ] **Step 4: Delete `CitizenPassportCard`**

```bash
cd apps/expo && git rm components/profile/CitizenPassportCard.tsx
grep -rl "CitizenPassportCard" app components hooks lib context || echo "no importers left"
```

- [ ] **Step 5: Type-check**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/citizen-verification|components/profile/(CredentialCarousel|CredentialQrSheet)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add apps/expo/app/citizen-verification.tsx apps/expo/components/profile/CredentialCarousel.tsx apps/expo/components/profile/CredentialQrSheet.tsx
git commit -m "feat(expo): credential explainer with swipeable cards and a QR sheet"
git push
```

---

### Task 14: Final verification

**Files:** none new.

- [ ] **Step 1: Run every test in the repo's expo app once**

Run: `cd apps/expo && CI=true npx jest --watchAll=false 2>&1 | tail -6`
Expected: the new suites pass; note any pre-existing failures unrelated to profile files.

- [ ] **Step 2: Full type-check filtered to touched paths**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/(profile|citizen-verification|rewards/index).tsx|components/profile/|components/(PressableScale|GlassPill)|hooks/(useDailyMint|useOrgMemberPreview)|lib/(credentials|profile-header|profile-actions|muenzen-daily-mint)" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Lint the touched files**

Run: `cd apps/expo && npx eslint app/profile.tsx app/citizen-verification.tsx components/profile components/PressableScale.tsx components/GlassPill.tsx hooks/useDailyMint.ts hooks/useOrgMemberPreview.ts lib/credentials.ts lib/profile-header.ts lib/profile-actions.ts lib/muenzen-daily-mint.ts 2>&1 | tail -20`
Expected: no errors (warnings acceptable).

- [ ] **Step 4: Push and report**

```bash
git push
git log --oneline origin/main..HEAD
```

Hand the branch to Max for the device pass (Android emulator: Gast, Bürger, Bescheiniger, Org; dark mode; claim choreography; two-card swipe).
