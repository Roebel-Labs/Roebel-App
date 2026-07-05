# Onboarding-Rollen + echte Münzen für Gäste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three onboarding roles (Bürger:in / Besucher:in / Organisation) with a Bürger citizen-data step that auto-submits the verification request, plus honest on-chain Münzen for non-citizens (guest `personalMint`, unified balance, Punkte relabel) and a Besucher→Organisation upgrade CTA.

**Architecture:** All changes live in `apps/expo`. The welcome wizard (expo-router screens under `app/welcome/`) gains a role and a data step; the consent screen fires the existing gasless citizen-request hook. `RoebelTalerProvider` becomes the single unified-balance owner (group + personal Circles tokens) and branches `dailyMint` on on-chain group membership. Off-chain gamification points get relabeled "Punkte".

**Tech Stack:** Expo SDK 55 / React Native, expo-router, thirdweb (Gnosis reads/writes), Supabase, jest-expo.

**Spec:** `docs/superpowers/specs/2026-07-05-onboarding-roles-guest-muenzen-design.md`

## Global Constraints

- Styling: `StyleSheet.create()` + `useTheme()` — NO NativeWind. Match surrounding `fontFamily` usage (legacy `Inter-*` keys are aliased to Mona Sans and fine in edited files).
- All user-facing copy in German, du-Form inside the welcome wizard (the request form uses Sie-Form — do not change it).
- NEVER surface "CRC"/"Circles" in user-facing copy. Naming the external "Gnosis App" in the NotInvitedSheet is allowed (it's an app name, not a currency).
- DB values unchanged: `preferred_role='tourist'` stays; new value is `'organisation'`. No Supabase migration (`users.preferred_role` is plain text, no CHECK).
- Package manager: pnpm. Commit convention: `feat(expo): …` / `fix(expo): …`. After each task: `git add <exact files>` (NEVER `git add .`), commit, `git push`.
- Do NOT run full `pnpm tsc` (repo has ~431 pre-existing errors). Verify with the specific jest test commands given per task.
- Run jest as: `cd apps/expo && npx jest <path> --watchAll=false` (the package `test` script is watch-mode).
- Base directory for all relative paths below: `apps/expo/`.

---

### Task 1: Wizard state module — third role + citizen data (pure, tested)

**Files:**
- Create: `apps/expo/context/welcome-wizard-state.ts`
- Create: `apps/expo/context/__tests__/welcome-wizard-state.test.ts`
- Modify: `apps/expo/context/WelcomeWizardContext.tsx`
- Modify: `apps/expo/lib/supabase-users.ts` (updateUserOnboarding param type)
- Modify: `apps/expo/lib/types.ts:549` (UserRecord.preferred_role union)
- Modify: `apps/expo/components/RoleBadge.tsx` (Props.preferredRole union only — labels change in Task 6)

**Interfaces:**
- Consumes: `CitizenIdentity` from `@/lib/verification-types` (`{ firstName: string; lastName: string; birthdate: string /* ISO YYYY-MM-DD */; address: string }`).
- Produces: `PreferredRole = 'buerger' | 'tourist' | 'organisation'`; `WelcomeWizardState` with `citizenData: CitizenIdentity | null`; action `{ type: 'SET_CITIZEN_DATA'; payload: CitizenIdentity | null }`; exports `reducer`, `initialState` from `context/welcome-wizard-state.ts`. `WelcomeWizardContext.tsx` re-exports `PreferredRole` (existing imports in `role.tsx` keep working).

- [ ] **Step 1: Write the failing test**

Create `apps/expo/context/__tests__/welcome-wizard-state.test.ts`:

```ts
import { reducer, initialState } from '../welcome-wizard-state';

describe('welcome wizard reducer', () => {
  it('stores the organisation role', () => {
    const next = reducer(initialState, { type: 'SET_ROLE', payload: 'organisation' });
    expect(next.preferredRole).toBe('organisation');
  });

  it('stores and clears citizen data', () => {
    const data = {
      firstName: 'Anna',
      lastName: 'Müller',
      birthdate: '1990-01-01',
      address: 'Musterstraße 1, 17207 Röbel',
    };
    const withData = reducer(initialState, { type: 'SET_CITIZEN_DATA', payload: data });
    expect(withData.citizenData).toEqual(data);
    const cleared = reducer(withData, { type: 'SET_CITIZEN_DATA', payload: null });
    expect(cleared.citizenData).toBeNull();
  });

  it('RESET drops citizen data', () => {
    const data = {
      firstName: 'Anna',
      lastName: 'Müller',
      birthdate: '1990-01-01',
      address: 'Musterstraße 1, 17207 Röbel',
    };
    const withData = reducer(initialState, { type: 'SET_CITIZEN_DATA', payload: data });
    expect(reducer(withData, { type: 'RESET' })).toEqual(initialState);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/expo && npx jest context/__tests__/welcome-wizard-state.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '../welcome-wizard-state'`

- [ ] **Step 3: Create the pure state module**

Create `apps/expo/context/welcome-wizard-state.ts`:

```ts
import type { CitizenIdentity } from '@/lib/verification-types';

export type PreferredRole = 'buerger' | 'tourist' | 'organisation';

export type WelcomeWizardState = {
  displayName: string;
  preferredRole: PreferredRole | null;
  /** Bürger path only: identity fields collected in /welcome/citizen-data. */
  citizenData: CitizenIdentity | null;
  isSubmitting: boolean;
};

export type WelcomeWizardAction =
  | { type: 'SET_DISPLAY_NAME'; payload: string }
  | { type: 'SET_ROLE'; payload: PreferredRole }
  | { type: 'SET_CITIZEN_DATA'; payload: CitizenIdentity | null }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'RESET' };

export const initialState: WelcomeWizardState = {
  displayName: '',
  preferredRole: null,
  citizenData: null,
  isSubmitting: false,
};

export function reducer(state: WelcomeWizardState, action: WelcomeWizardAction): WelcomeWizardState {
  switch (action.type) {
    case 'SET_DISPLAY_NAME':
      return { ...state, displayName: action.payload };
    case 'SET_ROLE':
      return { ...state, preferredRole: action.payload };
    case 'SET_CITIZEN_DATA':
      return { ...state, citizenData: action.payload };
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/expo && npx jest context/__tests__/welcome-wizard-state.test.ts --watchAll=false`
Expected: PASS (3 tests)

- [ ] **Step 5: Rewire WelcomeWizardContext to the module**

In `apps/expo/context/WelcomeWizardContext.tsx`:
- DELETE the local `PreferredRole`, `WelcomeWizardState`, `WelcomeWizardAction`, `initialState`, and `reducer` definitions.
- ADD at the top:

```ts
import {
  reducer,
  initialState,
  type WelcomeWizardAction,
  type WelcomeWizardState,
  type PreferredRole,
} from '@/context/welcome-wizard-state';

export type { PreferredRole, WelcomeWizardState };
```

The rest of the file (provider, `useReducer(reducer, initialState)`, ExitWizardSheet) stays unchanged.

- [ ] **Step 6: Widen the persisted role unions**

In `apps/expo/lib/supabase-users.ts` change the `updateUserOnboarding` param:

```ts
    preferredRole?: 'buerger' | 'tourist' | 'organisation' | null;
```

In `apps/expo/lib/types.ts:549` change:

```ts
  preferred_role: 'buerger' | 'tourist' | 'organisation' | null;
```

In `apps/expo/components/RoleBadge.tsx` change the Props union (labels stay for Task 6):

```ts
  preferredRole?: 'buerger' | 'tourist' | 'organisation' | null;
```

- [ ] **Step 7: Re-run test + commit**

Run: `cd apps/expo && npx jest context/__tests__/welcome-wizard-state.test.ts --watchAll=false`
Expected: PASS

```bash
git add apps/expo/context/welcome-wizard-state.ts apps/expo/context/__tests__/welcome-wizard-state.test.ts apps/expo/context/WelcomeWizardContext.tsx apps/expo/lib/supabase-users.ts apps/expo/lib/types.ts apps/expo/components/RoleBadge.tsx
git commit -m "feat(expo): welcome wizard state — organisation role + citizen data"
git push
```

---

### Task 2: Role screen — three cards, dynamic steps, route registration

**Files:**
- Modify: `apps/expo/app/welcome/role.tsx`
- Modify: `apps/expo/app/welcome/_layout.tsx`

**Interfaces:**
- Consumes: `PreferredRole` (now includes `'organisation'`) from Task 1.
- Produces: navigation — Bürger goes to `/welcome/citizen-data` (Task 3 creates it), others to `/welcome/consent`. `STEP_SCREENS` includes `'citizen-data'` so the Abbrechen header renders there.

- [ ] **Step 1: Replace the ROLES array and next-routing in `role.tsx`**

Replace the `ROLES` constant with:

```ts
const ROLES: { value: PreferredRole; image: ImageSourcePropType; label: string; desc: string }[] = [
  {
    value: 'buerger',
    image: require('../../assets/illustration/onboarding/buerger.png'),
    label: 'Bürger:in',
    desc: 'Ich wohne in Röbel.',
  },
  {
    value: 'tourist',
    image: require('../../assets/illustration/onboarding/suitcase.png'),
    label: 'Besucher:in',
    desc: 'Ich besuche Röbel.',
  },
  {
    value: 'organisation',
    image: require('../../assets/illustration/small/services.png'),
    label: 'Organisation',
    desc: 'Ich führe ein Unternehmen oder einen Verein in Röbel.',
  },
];
```

Replace the `<StoryProgress step={2} totalSteps={3} />` line with:

```tsx
        <StoryProgress step={2} totalSteps={state.preferredRole === 'buerger' ? 4 : 3} />
```

Replace the `WizardFooter` `onNext`:

```tsx
      <WizardFooter
        onBack={() => router.back()}
        onNext={() =>
          state.preferredRole &&
          router.push(
            (state.preferredRole === 'buerger' ? '/welcome/citizen-data' : '/welcome/consent') as any,
          )
        }
        nextDisabled={!state.preferredRole}
      />
```

- [ ] **Step 2: Register the new screen in `_layout.tsx`**

Change:

```ts
const STEP_SCREENS = ['name', 'role', 'citizen-data', 'consent'];
```

and add inside the `TransitionStack` (between `role` and `consent`):

```tsx
        <TransitionStack.Screen name="citizen-data" />
```

- [ ] **Step 3: Manual sanity check**

The app can't route to `citizen-data` yet (file lands in Task 3) — that's fine; nothing references it at runtime until a Bürger taps Weiter. Verify no import errors: `cd apps/expo && npx jest context/__tests__/welcome-wizard-state.test.ts --watchAll=false` still passes.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/app/welcome/role.tsx apps/expo/app/welcome/_layout.tsx
git commit -m "feat(expo): onboarding role cards — Besucher rename + Organisation"
git push
```

---

### Task 3: Citizen-data wizard screen (new)

**Files:**
- Create: `apps/expo/app/welcome/citizen-data.tsx`

**Interfaces:**
- Consumes: `useWelcomeWizard()` (state/dispatch with `SET_CITIZEN_DATA` from Task 1), `WizardFooter` (`{ onBack, onNext, nextLabel?, nextDisabled? }`), `StoryProgress` (`{ step, totalSteps }`).
- Produces: on Weiter dispatches `SET_CITIZEN_DATA` with a complete `CitizenIdentity` then pushes `/welcome/consent`; "Später ausfüllen" dispatches `SET_CITIZEN_DATA: null` then pushes `/welcome/consent`.

- [ ] **Step 1: Create the screen**

Create `apps/expo/app/welcome/citizen-data.tsx` (du-Form; field hints mirror the request form's truthful commitment copy):

```tsx
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useWelcomeWizard } from '@/context/WelcomeWizardContext';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

const DEFAULT_PICKER_DATE = new Date(1990, 0, 1);
const MIN_BIRTHDATE = new Date(1900, 0, 1);
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatGerman = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function WelcomeCitizenDataScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useWelcomeWizard();

  const [firstName, setFirstName] = useState(state.citizenData?.firstName ?? '');
  const [lastName, setLastName] = useState(state.citizenData?.lastName ?? '');
  const [birthDate, setBirthDate] = useState<Date | null>(
    state.citizenData?.birthdate ? new Date(state.citizenData.birthdate) : null,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [address, setAddress] = useState(state.citizenData?.address ?? '');

  const complete =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !!birthDate && address.trim().length > 0;

  const handleNext = () => {
    if (!complete || !birthDate) return;
    dispatch({
      type: 'SET_CITIZEN_DATA',
      payload: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthdate: toIsoDate(birthDate),
        address: address.trim(),
      },
    });
    router.push('/welcome/consent' as any);
  };

  const handleSkip = () => {
    dispatch({ type: 'SET_CITIZEN_DATA', payload: null });
    router.push('/welcome/consent' as any);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        showsVerticalScrollIndicator={false}
        extraScrollHeight={100}
      >
        <StoryProgress step={3} totalSteps={4} />
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Werde verifizierte:r Bürger:in</Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Mit diesen Angaben startet dein Bürger-Antrag automatisch. Sie bleiben auf deinem Gerät —
          gespeichert wird nur ein nicht umkehrbarer Fingerabdruck, aus dem niemand deinen Namen lesen kann.
        </Text>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Vorname</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Anna"
            placeholderTextColor={colors.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Teil deines persönlichen Fingerabdrucks.</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Nachname</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Müller"
            placeholderTextColor={colors.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Teil deines persönlichen Fingerabdrucks.</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Geburtsdatum</Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={[styles.input, styles.dateField, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}
            accessibilityRole="button"
            accessibilityLabel="Geburtsdatum auswählen"
          >
            <Text style={[styles.dateText, { color: birthDate ? colors.textPrimary : colors.textTertiary }]}>
              {birthDate ? formatGerman(birthDate) : 'TT.MM.JJJJ'}
            </Text>
            <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={birthDate ?? DEFAULT_PICKER_DATE}
              mode="date"
              display="default"
              maximumDate={new Date()}
              minimumDate={MIN_BIRTHDATE}
              onChange={(event, date) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (date) setBirthDate(date);
                if (Platform.OS === 'android') setShowDatePicker(false);
              }}
            />
          )}
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Sichert: eine Person, eine Stimme.</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Adresse in Röbel/Müritz</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.borderSecondary, color: colors.textPrimary }]}
            placeholder="Musterstraße 123, 17207 Röbel"
            placeholderTextColor={colors.textTertiary}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="words"
          />
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>Belegt deinen Wohnsitz in Röbel/Müritz.</Text>
        </View>

        <Pressable onPress={handleSkip} style={styles.skipButton} accessibilityRole="button">
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Später ausfüllen</Text>
        </Pressable>
      </KeyboardAwareScrollView>

      <WizardFooter onBack={() => router.back()} onNext={handleNext} nextDisabled={!complete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  heading: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subheading: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 28, lineHeight: 22 },
  formGroup: { marginBottom: 20 },
  label: { fontFamily: 'Inter-Medium', fontSize: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: 'Inter-Regular' },
  dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 15, fontFamily: 'Inter-Regular' },
  fieldHint: { fontFamily: 'Inter-Regular', fontSize: 12, lineHeight: 16, marginTop: 6 },
  skipButton: { alignSelf: 'center', paddingVertical: 16 },
  skipText: { fontSize: 14, fontFamily: 'Inter-Medium', textDecorationLine: 'underline' },
});
```

- [ ] **Step 2: Verify + commit**

Run: `cd apps/expo && npx jest context/__tests__/welcome-wizard-state.test.ts --watchAll=false` (module graph unaffected — pass expected).

```bash
git add apps/expo/app/welcome/citizen-data.tsx
git commit -m "feat(expo): welcome citizen-data step with DSGVO field hints"
git push
```

---

### Task 4: Draft storage helpers + request-form prefill

**Files:**
- Modify: `apps/expo/lib/onboarding-storage.ts`
- Create: `apps/expo/lib/__tests__/onboarding-storage.test.ts`
- Modify: `apps/expo/app/verification/request-citizen/form.tsx`
- Modify: `apps/expo/hooks/useVerification.ts` (export the reason constant)

**Interfaces:**
- Produces: `saveCitizenDraft(d: CitizenIdentity): Promise<void>`, `loadCitizenDraft(): Promise<CitizenIdentity | null>`, `clearCitizenDraft(): Promise<void>` from `@/lib/onboarding-storage`; `DEFAULT_CITIZEN_REASON = 'Bürger von Röbel'` exported from `@/hooks/useVerification`. Task 5 consumes both.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/onboarding-storage.test.ts`:

```ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { saveCitizenDraft, loadCitizenDraft, clearCitizenDraft } from '../onboarding-storage';

const DRAFT = {
  firstName: 'Anna',
  lastName: 'Müller',
  birthdate: '1990-01-01',
  address: 'Musterstraße 1, 17207 Röbel',
};

describe('citizen draft storage', () => {
  it('round-trips a draft', async () => {
    await saveCitizenDraft(DRAFT);
    expect(await loadCitizenDraft()).toEqual(DRAFT);
  });

  it('clears the draft', async () => {
    await saveCitizenDraft(DRAFT);
    await clearCitizenDraft();
    expect(await loadCitizenDraft()).toBeNull();
  });

  it('returns null when nothing stored', async () => {
    await clearCitizenDraft();
    expect(await loadCitizenDraft()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/expo && npx jest lib/__tests__/onboarding-storage.test.ts --watchAll=false`
Expected: FAIL — `saveCitizenDraft` is not exported.

- [ ] **Step 3: Implement the helpers**

In `apps/expo/lib/onboarding-storage.ts`, add this import at the TOP of the file (below the existing `AsyncStorage` import):

```ts
import type { CitizenIdentity } from '@/lib/verification-types';
```

Then append to the end of the file:

```ts
/** Bürger onboarding: identity draft kept ONLY on-device so a failed auto-submit
 *  can prefill the manual request form. Cleared on successful submission. */
export const CITIZEN_DRAFT_KEY = '@roebel/onboarding/citizen-draft';

export async function saveCitizenDraft(draft: CitizenIdentity): Promise<void> {
  try {
    await AsyncStorage.setItem(CITIZEN_DRAFT_KEY, JSON.stringify(draft));
  } catch (err) {
    console.error('Failed to save citizen draft:', err);
  }
}

export async function loadCitizenDraft(): Promise<CitizenIdentity | null> {
  try {
    const raw = await AsyncStorage.getItem(CITIZEN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.firstName === 'string' &&
      typeof parsed?.lastName === 'string' &&
      typeof parsed?.birthdate === 'string' &&
      typeof parsed?.address === 'string'
    ) {
      return parsed as CitizenIdentity;
    }
    return null;
  } catch (err) {
    console.error('Failed to load citizen draft:', err);
    return null;
  }
}

export async function clearCitizenDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CITIZEN_DRAFT_KEY);
  } catch (err) {
    console.error('Failed to clear citizen draft:', err);
  }
}
```

(The file already imports `AsyncStorage` at the top.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/expo && npx jest lib/__tests__/onboarding-storage.test.ts --watchAll=false`
Expected: PASS (3 tests)

- [ ] **Step 5: Export the reason constant from the hook**

In `apps/expo/hooks/useVerification.ts`, directly below the `REQUEST_STAGE_LABEL` export, add:

```ts
/** Standard reason attached to citizen attestation requests. */
export const DEFAULT_CITIZEN_REASON = 'Bürger von Röbel';
```

In `apps/expo/app/verification/request-citizen/form.tsx`:
- Change the import line to `import { useCreateCitizenRequest, REQUEST_STAGE_LABEL, DEFAULT_CITIZEN_REASON } from '@/hooks/useVerification';`
- Delete the local `const DEFAULT_REASON = 'Bürger von Röbel';` (line 20) and replace its usage in `createRequest(…, DEFAULT_REASON)` with `DEFAULT_CITIZEN_REASON`.

- [ ] **Step 6: Prefill the form from the draft**

In `apps/expo/app/verification/request-citizen/form.tsx`:

Add imports:

```ts
import { useEffect } from 'react'; // merge into the existing react import
import { loadCitizenDraft, clearCitizenDraft } from '@/lib/onboarding-storage';
```

Add below the `useState` declarations:

```ts
  // Prefill from the onboarding draft (saved when the auto-submit at the end of
  // the welcome wizard failed) so the user never types their data twice.
  useEffect(() => {
    loadCitizenDraft().then((draft) => {
      if (!draft) return;
      setFirstName((v) => v || draft.firstName);
      setLastName((v) => v || draft.lastName);
      setAddress((v) => v || draft.address);
      setBirthDate((v) => v ?? (draft.birthdate ? new Date(draft.birthdate) : null));
    });
  }, []);
```

In `handleSubmit`, after `await refresh();` add:

```ts
      await clearCitizenDraft();
```

- [ ] **Step 7: Commit**

```bash
git add apps/expo/lib/onboarding-storage.ts apps/expo/lib/__tests__/onboarding-storage.test.ts apps/expo/hooks/useVerification.ts apps/expo/app/verification/request-citizen/form.tsx
git commit -m "feat(expo): citizen identity draft storage + request-form prefill"
git push
```

---

### Task 5: Consent screen — auto-submit citizen request + Organisation routing

**Files:**
- Modify: `apps/expo/app/welcome/consent.tsx`

**Interfaces:**
- Consumes: `state.citizenData`/`state.preferredRole` (Task 1), `useCreateCitizenRequest` + `REQUEST_STAGE_LABEL` + `DEFAULT_CITIZEN_REASON` (Task 4), `useVerificationContext` (`{ hasCitizenNFT, activePendingRequest, refresh }` — provider is global in `app/_layout.tsx:307`), `saveCitizenDraft` (Task 4), `useSnackbar` (global provider).
- Produces: after Akzeptieren — Bürger with complete data → request submitted (or draft saved on failure); Organisation → `router.replace('/create-org')`; everyone else → `router.replace('/')` (unchanged).

- [ ] **Step 1: Add imports and hooks**

In `apps/expo/app/welcome/consent.tsx` add imports:

```ts
import { useCreateCitizenRequest, REQUEST_STAGE_LABEL, DEFAULT_CITIZEN_REASON } from '@/hooks/useVerification';
import { useVerificationContext } from '@/context/VerificationContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { saveCitizenDraft } from '@/lib/onboarding-storage';
```

Inside the component add:

```ts
  const { createRequest, stage } = useCreateCitizenRequest();
  const { hasCitizenNFT, activePendingRequest, refresh: refreshVerification } = useVerificationContext();
  const { showSnackbar } = useSnackbar();
```

- [ ] **Step 2: Update StoryProgress**

Replace `<StoryProgress step={3} totalSteps={3} />` with:

```tsx
        <StoryProgress
          step={state.preferredRole === 'buerger' ? 4 : 3}
          totalSteps={state.preferredRole === 'buerger' ? 4 : 3}
        />
```

- [ ] **Step 3: Branch handleAccept**

At the very top of `handleAccept` (before `if (!user?.wallet_address)`), capture the wizard values so the `finally` RESET can't race them:

```ts
    const roleAtSubmit = state.preferredRole;
    const citizenDataAtSubmit = state.citizenData;
```

Inside the `try` block, AFTER `await refreshUser();`, add:

```ts
      // Bürger path: fire the verification request automatically so the data
      // from the citizen-data step is never typed twice. Never blocks onboarding.
      if (roleAtSubmit === 'buerger' && citizenDataAtSubmit && !hasCitizenNFT && !activePendingRequest) {
        try {
          await createRequest(citizenDataAtSubmit, DEFAULT_CITIZEN_REASON);
          await refreshVerification();
        } catch (err) {
          console.error('Auto citizen request failed (non-fatal):', err);
          await saveCitizenDraft(citizenDataAtSubmit);
          showSnackbar({
            message: 'Dein Bürger-Antrag konnte nicht gesendet werden — starte ihn später im Profil, deine Angaben sind vorausgefüllt.',
          });
        }
      }
```

In the `finally` block, replace `router.replace('/');` with:

```ts
      router.replace((roleAtSubmit === 'organisation' ? '/create-org' : '/') as any);
```

- [ ] **Step 4: Show request progress on the button**

The request takes 10–30 s. Replace the submit-button content (the `{submitting ? <ActivityIndicator … /> : <Text …>Akzeptieren</Text>}` block) with:

```tsx
          {submitting ? (
            <View style={styles.acceptProgressRow}>
              <ActivityIndicator color={colors.onPrimary} />
              {stage !== 'idle' && (
                <Text style={[styles.acceptText, { color: colors.onPrimary }]}>
                  {REQUEST_STAGE_LABEL[stage]}
                </Text>
              )}
            </View>
          ) : (
            <Text style={[styles.acceptText, { color: colors.onPrimary }]}>Akzeptieren</Text>
          )}
```

and add to the StyleSheet:

```ts
  acceptProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
```

- [ ] **Step 5: Verify + commit**

Run: `cd apps/expo && npx jest lib/__tests__/onboarding-storage.test.ts context/__tests__/welcome-wizard-state.test.ts --watchAll=false`
Expected: PASS.

Manual QA (dev client, needs a fresh test account): complete onboarding as Bürger with data → profile shows „Antrag läuft"; as Organisation → lands in `/create-org`; as Besucher → unchanged.

```bash
git add apps/expo/app/welcome/consent.tsx
git commit -m "feat(expo): consent auto-submits citizen request + org onboarding funnel"
git push
```

---

### Task 6: Tourist → Besucher rename (user-facing labels only)

**Files:**
- Modify: `apps/expo/context/UserContext.tsx:18-22`
- Modify: `apps/expo/components/RoleBadge.tsx` (tourist label)
- Modify: `apps/expo/app/profile.tsx:262,331,334`
- Modify: `apps/expo/components/FlippableIdentityCard.tsx:39`

**Interfaces:** none new — string changes. DB/tier values stay `'tourist'`.

- [ ] **Step 1: Apply the renames**

`context/UserContext.tsx` TIER_LABELS: `tourist: 'Tourist',` → `tourist: 'Besucher',`

`components/RoleBadge.tsx` TIER_CONFIG tourist: `label: 'Tourist',` → `label: 'Besucher',`

`app/profile.tsx`:
- line 262: `: 'Tourist:in';` → `: 'Besucher:in';`
- line 331: `name={displayName || 'Tourist'}` → `name={displayName || 'Besucher'}`
- line 334: `pillLabel="Tourist:in"` → `pillLabel="Besucher:in"`

`components/FlippableIdentityCard.tsx:39`: `tourist: 'Tourist Card',` → `tourist: 'Besucher Card',`

- [ ] **Step 2: Sweep for stragglers**

Run: `grep -rn "Tourist" apps/expo/app apps/expo/components apps/expo/context apps/expo/lib --include="*.tsx" --include="*.ts" | grep -v "tourist_info\|Tourist-Info\|TouristActionRow\|TouristBanner\|'tourist'\|\"tourist\"\|tier === 'tourist'\|Touristen"`

Fix any remaining **user-facing role labels** found (component names `TouristActionRow`/`TouristBanner`, the `'tourist'` DB/tier value, the POI category "Tourist-Info", and Mecky's generic "Touristen" prose stay unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/expo/context/UserContext.tsx apps/expo/components/RoleBadge.tsx apps/expo/app/profile.tsx apps/expo/components/FlippableIdentityCard.tsx
git commit -m "feat(expo): rename Tourist to Besucher in all user-facing labels"
git push
```

(Include any extra files fixed in Step 2 in the `git add`.)

---

### Task 7: Unified balance + membership-aware dailyMint in RoebelTalerProvider

**Files:**
- Modify: `apps/expo/lib/roebel-taler.ts` (add `isGroupMember`)
- Modify: `apps/expo/context/RoebelTalerProvider.tsx`

**Interfaces:**
- Produces (lib): `isGroupMember(address: string): Promise<boolean>` — true when the Röbel Münzen group trusts the address (Hub v2 `isTrusted(truster, trustee)`).
- Produces (context additions): `groupBalance: number` and `groupBalanceRaw: bigint` on `RoebelTalerContextValue`. `talerBalance`/`balanceRaw` become the UNIFIED balance (group + personal). Consumed by Tasks 8/10.

- [ ] **Step 1: Add `isGroupMember` to the lib**

In `apps/expo/lib/roebel-taler.ts`, below `getPersonalCrcBalance`, add:

```ts
/** True when the Röbel Münzen group trusts `addr` — i.e. groupMint is allowed
 *  (citizens). Guests mint personal Münzen only. */
export async function isGroupMember(address: string): Promise<boolean> {
	return readContract({
		contract: hubRead,
		method: "function isTrusted(address,address) view returns (bool)",
		params: [roebeltalerGroupAddress, address],
	});
}
```

- [ ] **Step 2: Rewire the provider**

In `apps/expo/context/RoebelTalerProvider.tsx`:

Update the lib import to include the new functions:

```ts
import {
  isOnboarded, findInviter, getRoebelTalerBalance, getPersonalCrcBalance,
  getMintableTaler, formatTaler, prepareDailyMint, prepareOnboard,
  prepareContributeToRoebelTaler, prepareSendRoebelTaler, isGroupMember,
} from '@/lib/roebel-taler';
```

Extend the context interface (after `balanceRaw: bigint;`):

```ts
  /** Sendable Röbel Münzen (group token only) — caps the Senden flow. */
  groupBalance: number;
  groupBalanceRaw: bigint;
```

Replace the single `balanceRaw` state with two sources:

```ts
  const [groupRaw, setGroupRaw] = useState<bigint>(0n);
  const [personalRaw, setPersonalRaw] = useState<bigint>(0n);
```

Replace `reconcile` with:

```ts
  const reconcile = useCallback(async () => {
    if (!address) return;
    const [ob, group, personal, mintable] = await Promise.all([
      isOnboarded(address).catch(() => false),
      getRoebelTalerBalance(address).catch(() => 0n),
      getPersonalCrcBalance(address).catch(() => 0n),
      getMintableTaler(address).catch(() => 0n),
    ]);
    setOnboarded(ob);
    setGroupRaw(group);
    setPersonalRaw(personal);
    setMintableRaw(mintable);
  }, [address]);
```

Replace `dailyMint` with (guests keep personal Münzen — the group would revert their contribute):

```ts
  const dailyMint = useCallback(async () => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setMinting(true);
    try {
      await sendTransaction({ account: gnosisAccount, transaction: prepareDailyMint() });
      // Citizens (trusted by the group) convert to the shared Röbel Münzen;
      // guests keep their personal Münzen — the group would revert their mint.
      const member = await isGroupMember(gnosisAccount.address).catch(() => false);
      if (member) {
        const pcrc = await getPersonalCrcBalance(gnosisAccount.address).catch(() => 0n);
        if (pcrc > 0n) {
          await sendTransaction({
            account: gnosisAccount,
            transaction: prepareContributeToRoebelTaler(gnosisAccount.address, pcrc),
          });
        }
      }
    } finally {
      setMinting(false);
    }
  }, [gnosisAccount]);
```

Replace the optimistic-balance line with:

```ts
  const balanceRaw = groupRaw + personalRaw;
  const optimisticRaw = balanceRaw + BigInt(Math.round(deltaSum)) * ONE;
```

Extend the memoized value (and its dependency array) with the group figures:

```ts
    talerBalance: Number(formatTaler(optimisticRaw)),
    balanceRaw: optimisticRaw,
    groupBalance: Number(formatTaler(groupRaw)),
    groupBalanceRaw: groupRaw,
```

(dependency array: replace `optimisticRaw` context with `optimisticRaw, groupRaw, …`.)

- [ ] **Step 3: Verify + commit**

Run: `cd apps/expo && npx jest lib/__tests__ context/__tests__ --watchAll=false`
Expected: PASS (existing + new tests; provider isn't unit-tested — on-chain deps).

Manual QA (dev client, citizen account): rewards page balance unchanged, „Heute abholen" still converts to group Münzen.

```bash
git add apps/expo/lib/roebel-taler.ts apps/expo/context/RoebelTalerProvider.tsx
git commit -m "feat(expo): unified Münzen balance + membership-aware dailyMint"
git push
```

---

### Task 8: Rewards page — Empfangen for everyone, Senden gated on group balance

**Files:**
- Modify: `apps/expo/app/rewards/index.tsx` (send/receive row)
- Modify: `apps/expo/app/rewards/send.tsx` (cap on group balance)

**Interfaces:**
- Consumes: `groupBalance` / `groupBalanceRaw` from Task 7 (via `useRoebelTaler()`).

- [ ] **Step 1: Gate the row in `rewards/index.tsx`**

Destructure the new field in the existing `useRoebelTaler()` call (add `groupBalanceRaw,` after `onboarded: talerOnboarded,` — keep local naming: `groupBalanceRaw: talerGroupRaw,`).

Replace the send/receive row condition and content. Current code:

```tsx
        {isConnected && talerOnboarded && (
          <View style={styles.sendRecvRow}>
            <Pressable
              onPress={() => router.push('/rewards/send' as any)}
```

New code — row shows for every connected user (guests can receive real Münzen from citizens); Senden only with a sendable group balance:

```tsx
        {isConnected && (
          <View style={styles.sendRecvRow}>
            {talerGroupRaw > 0n && (
              <Pressable
                onPress={() => router.push('/rewards/send' as any)}
```

(keep the existing Senden button body/styles; close the new conditional after the Senden `</Pressable>`; the Empfangen `Pressable` stays unconditional inside the row).

- [ ] **Step 2: Cap the send flow on the group balance in `send.tsx`**

- Line 38: `const { talerBalance, send, sending, account } = useRoebelTaler();` → `const { groupBalance, send, sending, account } = useRoebelTaler();`
- Line 73: `if (Number(amount.replace(',', '.')) > talerBalance) {` → `if (Number(amount.replace(',', '.')) > groupBalance) {`
- Line 104: `Verfügbar: {Math.round(talerBalance).toLocaleString('de-DE')} Röbel Münzen` → `Verfügbar: {Math.round(groupBalance).toLocaleString('de-DE')} Röbel Münzen`
- Check the rest of `send.tsx` for further `talerBalance` reads and switch them to `groupBalance`.

- [ ] **Step 3: Verify + commit**

Run: `cd apps/expo && npx jest lib/__tests__ context/__tests__ --watchAll=false` — PASS.
Manual QA: citizen sees Senden+Empfangen (unchanged); fresh guest account sees only Empfangen.

```bash
git add apps/expo/app/rewards/index.tsx apps/expo/app/rewards/send.tsx
git commit -m "feat(expo): rewards send/receive gating for guest accounts"
git push
```

---

### Task 9: NotInvitedSheet — hackathon invite copy + Gnosis referral link

**Files:**
- Modify: `apps/expo/constants/gnosis.ts` (referral URL constant)
- Modify: `apps/expo/components/rewards/NotInvitedSheet.tsx`

**Interfaces:**
- Produces: `gnosisReferralUrl: string` from `@/constants/gnosis` (env-overridable).

- [ ] **Step 1: Add the referral constant**

Append to `apps/expo/constants/gnosis.ts`:

```ts
/** External Gnosis-App referral link (Max's personal referral — new users who
 *  join there get a SEPARATE Gnosis account, independent of the app wallet). */
export const gnosisReferralUrl =
	process.env.EXPO_PUBLIC_GNOSIS_REFERRAL_URL ||
	"https://app.gnosis.io/referral/0x2d94a225f02d6cafebe7fda1a272c790b93750b5027443ad2b6f78398d672cc7?utm_campaign=referral";
```

- [ ] **Step 2: Extend the sheet**

In `apps/expo/components/rewards/NotInvitedSheet.tsx`:

Add imports:

```ts
import { openBrowserAsync } from 'expo-web-browser';
import { gnosisReferralUrl } from '@/constants/gnosis';
```

Replace the body `<Text>` copy with:

```tsx
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Um Röbel Münzen zu sammeln, muss dich zuerst ein:e Bürger:in aus Röbel einladen.
          Teile deine Adresse — sobald du eingeladen bist, tippe hier erneut.
        </Text>
```

Below the existing „Adresse teilen" CTA (keep it), add a secondary button plus a fine-print line:

```tsx
        <Pressable
          onPress={() => { void openBrowserAsync(gnosisReferralUrl); }}
          style={({ pressed }) => [
            styles.secondaryCta,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Gnosis App öffnen"
        >
          <Text style={[styles.secondaryCtaText, { color: colors.textPrimary }]}>
            Alternativ: Gnosis App ausprobieren
          </Text>
        </Pressable>
        <Text style={[styles.finePrint, { color: colors.textTertiary }]}>
          Die Gnosis App ist ein eigenes Konto außerhalb der Röbel App — dein Guthaben dort
          erscheint nicht hier.
        </Text>
```

Add to the StyleSheet:

```ts
  secondaryCta: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryCtaText: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 15,
  },
  finePrint: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
```

- [ ] **Step 3: Verify + commit**

Manual QA: guest taps „Belohnungen erhalten" → sheet shows share CTA + referral button; referral opens in-app browser.

```bash
git add apps/expo/constants/gnosis.ts apps/expo/components/rewards/NotInvitedSheet.tsx
git commit -m "feat(expo): NotInvitedSheet — invite copy + external Gnosis referral link"
git push
```

---

### Task 10: CoinsCard + TouristActionRow show the real balance

**Files:**
- Modify: `apps/expo/components/profile/CoinsCard.tsx`
- Modify: `apps/expo/components/profile/TouristActionRow.tsx`

**Interfaces:**
- Consumes: `talerBalance` (unified, Task 7) from `useRoebelTaler()`.

- [ ] **Step 1: CoinsCard — drop the off-chain coins**

In `apps/expo/components/profile/CoinsCard.tsx`:
- Remove the `useRewards` import and `const { coins } = useRewards();`.
- Remove the `useUser` import and `const { isCitizen } = useUser();` (no longer branches).
- Replace the `balanceRaw`/`display` logic with:

```ts
  const { talerBalance } = useRoebelTaler();
  const cardBg = colors.background;
  // The REAL on-chain Röbel Münzen for everyone — citizens hold the shared
  // Münzen, guests their personal ones. Whole Münzen, no decimals.
  const display = Math.round(talerBalance).toLocaleString('de-DE');
```

- Replace the balance `<Text>`:

```tsx
        <Text style={[styles.balance, { color: colors.textPrimary }]}>
          {display} Münzen
        </Text>
```

- Remove the now-unused `formatTaler` import.

- [ ] **Step 2: TouristActionRow — same source**

In `apps/expo/components/profile/TouristActionRow.tsx`:
- Replace the `useRewards` import with `import { useRoebelTaler } from '@/hooks/useRoebelTaler';`
- Replace `const { coins } = useRewards();` with `const { talerBalance } = useRoebelTaler();`
- Replace the label text:

```tsx
        <Text style={[styles.label, { color: colors.textPrimary }]}>
          {Math.round(talerBalance).toLocaleString('de-DE')} Münzen
        </Text>
```

- [ ] **Step 3: Verify + commit**

Manual QA: non-citizen profile now shows the real (typically 0) Münzen — the fake „140 Münzen" is gone; citizen profile unchanged.

```bash
git add apps/expo/components/profile/CoinsCard.tsx apps/expo/components/profile/TouristActionRow.tsx
git commit -m "fix(expo): profile Münzen shows real on-chain balance for non-citizens"
git push
```

---

### Task 11: Punkte relabel for off-chain points

**Files:**
- Modify: `apps/expo/context/RewardCelebrationContext.tsx`
- Modify: `apps/expo/components/rewards/MuenzenRewardOverlay.tsx`
- Modify: `apps/expo/components/rewards/MuenzenRewardView.tsx`
- Modify: `apps/expo/app/rewards/index.tsx` (task-completion celebrate)
- Modify: `apps/expo/app/rewards/referral.tsx` (strings)

**Interfaces:**
- Produces: `unit?: 'Münzen' | 'Punkte'` on `CelebrateOptions`, `MuenzenRewardOverlayProps`, and `MuenzenRewardViewProps` (default `'Münzen'`).

- [ ] **Step 1: Thread the `unit` prop**

`components/rewards/MuenzenRewardView.tsx`:
- Add `unit?: 'Münzen' | 'Punkte';` to `MuenzenRewardViewProps` and `unit = 'Münzen',` to the destructured props.
- Replace `const label = isSingle ? 'MÜNZE' : 'MÜNZEN';` with:

```ts
  const singular = unit === 'Punkte' ? 'Punkt' : 'Münze';
  const plural = unit === 'Punkte' ? 'Punkte' : 'Münzen';
  const label = (isSingle ? singular : plural).toUpperCase();
```

- Replace the accessibility label `` accessibilityLabel={`${amount} ${isSingle ? 'Münze' : 'Münzen'} erhalten`} `` with `` accessibilityLabel={`${amount} ${isSingle ? singular : plural} erhalten`} ``.

`components/rewards/MuenzenRewardOverlay.tsx`: add `unit?: 'Münzen' | 'Punkte';` to the props interface, destructure it, and pass `unit={unit}` through to `<MuenzenRewardView …>`.

`context/RewardCelebrationContext.tsx`: add `unit?: 'Münzen' | 'Punkte';` to `CelebrateOptions` AND `QueueItem`; in `celebrate` include `unit: opts?.unit` in the queued item; pass `unit={current?.unit}` on the `<MuenzenRewardOverlay …>` render.

- [ ] **Step 2: Task rewards celebrate as Punkte**

In `apps/expo/app/rewards/index.tsx` (handleTaskPress, ~line 322) change:

```ts
            celebrate(res.coins_awarded ?? 0, {
              subtitle: 'Mission erledigt! Deine Belohnung ist da — auf zur nächsten.',
              unit: 'Punkte',
            });
```

- [ ] **Step 3: Referral copy → Punkte**

In `apps/expo/app/rewards/referral.tsx` (referral rewards are the off-chain ledger):
- line ~54: `'Code eingelöst! Münzen gutgeschrieben.'` → `'Code eingelöst! Punkte gutgeschrieben.'`
- line ~112: `Lade Freunde ein, gewinnt beide Münzen` → `Lade Freunde ein, gewinnt beide Punkte`
- line ~116: `bekommt ihr beide Münzen.` → `bekommt ihr beide Punkte.`
- line ~231: `<HowStep n={3} title="Ihr bekommt beide Münzen" body="200 Münzen für dich, 100 für deinen Freund" …` → `<HowStep n={3} title="Ihr bekommt beide Punkte" body="200 Punkte für dich, 100 Punkte für deinen Freund" …`
- Also update any other user-facing "Münzen" string in this file that refers to referral/task points (check the whole file; on-chain "Röbel Münzen" strings, if any, stay).

- [ ] **Step 4: Verify + commit**

Run: `cd apps/expo && npx jest lib/__tests__ context/__tests__ --watchAll=false` — PASS.
Manual QA: complete a mission → overlay says „N PUNKTE"; daily mint overlay still says „N MÜNZEN".

```bash
git add apps/expo/context/RewardCelebrationContext.tsx apps/expo/components/rewards/MuenzenRewardOverlay.tsx apps/expo/components/rewards/MuenzenRewardView.tsx apps/expo/app/rewards/index.tsx apps/expo/app/rewards/referral.tsx
git commit -m "feat(expo): off-chain rewards labeled Punkte, on-chain stays Münzen"
git push
```

---

### Task 12: Besucher → Organisation upgrade CTA + org-role profile pill

**Files:**
- Modify: `apps/expo/components/profile/ProfileModeCards.tsx` (TouristCards)
- Modify: `apps/expo/app/profile.tsx` (pill label for organisation role)

**Interfaces:** none new.

- [ ] **Step 1: Add the create-org CTA for Besucher/Gast**

In `apps/expo/components/profile/ProfileModeCards.tsx`, inside `TouristCards`, below the existing „Bürger werden" `CTABanner`, add:

```tsx
      <CTABanner
        emoji="🚀"
        title="Starte durch in Röbel"
        subtitle="Gewerbe, Verein, Stadt, Freelancer..."
        onPress={() => requireAuth(() => router.push('/create-org' as any))}
      />
```

- [ ] **Step 2: Organisation pill on the profile**

In `apps/expo/app/profile.tsx`, in the tourist branch (line ~334 after Task 6), replace:

```tsx
                      pillLabel="Besucher:in"
```

with:

```tsx
                      pillLabel={user?.preferred_role === 'organisation' ? 'Organisation' : 'Besucher:in'}
```

and the name fallback (line ~331):

```tsx
                      name={displayName || (user?.preferred_role === 'organisation' ? 'Organisation' : 'Besucher')}
```

- [ ] **Step 3: Verify + commit**

Manual QA: Besucher profile shows both CTAs; tapping „Starte durch in Röbel" opens create-org; an organisation-role user without an org yet sees the „Organisation" pill.

```bash
git add apps/expo/components/profile/ProfileModeCards.tsx apps/expo/app/profile.tsx
git commit -m "feat(expo): Besucher→Organisation upgrade CTA + org-role profile pill"
git push
```

---

### Task 13: Final verification sweep

**Files:** none (verification only; fix-forward if anything fails).

- [ ] **Step 1: Run all new/affected tests**

Run: `cd apps/expo && npx jest lib/__tests__ context/__tests__ --watchAll=false`
Expected: all PASS.

- [ ] **Step 2: Lint the app**

Run: `cd apps/expo && pnpm lint`
Expected: no NEW errors versus main (pre-existing warnings are fine).

- [ ] **Step 3: Manual QA checklist (dev client)**

1. Fresh account → wizard shows 3 role cards (Bürger:in / Besucher:in / Organisation with services artwork).
2. Bürger path: 4 progress pills; data step validates; „Später ausfüllen" skips; Akzeptieren shows stage labels; profile lands on „Antrag läuft" (or Bürger-werden banner after a forced failure, with the manual form prefilled).
3. Organisation path: 3 pills; after Akzeptieren lands in `/create-org`; exiting create-org → profile shows „Starte durch in Röbel" CTA.
4. Besucher: profile pill says „Besucher:in"; Münzen figure is the real balance (0 for a fresh account) — no fake points number.
5. Guest rewards: „Belohnungen erhalten" → NotInvitedSheet with share + Gnosis referral buttons; after being trusted (mini-app invite) → onboard works → „Heute abholen" mints WITHOUT the group-convert step and the balance rises.
6. Citizen regression: balance unchanged, daily mint still converts, Senden/Empfangen both visible, mission rewards say „Punkte".

- [ ] **Step 4: Report**

Report QA results to the user (nothing left to commit if Tasks 1–12 pushed clean).
