# Org Registration Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the org registration wizard with Airbnb-inspired UI, add AI-powered location geocoding with inline success state, and add post-submission status tracking on the profile.

**Architecture:** The wizard already has all screens, state management (CreateOrgWizardContext), and Supabase integration working. This is primarily a UI overhaul of 8 existing screens, a behavior change on the location screen (auto-geocode on blur instead of manual button), and two new components for status tracking (redesigned banner + new detail screen). No new DB tables or context changes needed.

**Tech Stack:** React Native, NativeWind v5 (Tailwind CSS v4 `className`), expo-router, Supabase, Google Maps geocoding API

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/create-org/index.tsx` | Modify | Intro screen — card-style step previews |
| `app/create-org/type.tsx` | Modify | Type selection — title/subtitle copy refinement |
| `app/create-org/info.tsx` | Modify | Info form — add character counter to name field |
| `app/create-org/location.tsx` | Modify | Location — auto-geocode on blur, inline success state |
| `app/create-org/contact.tsx` | Modify | Contact — title copy refinement |
| `app/create-org/photos.tsx` | Modify | Photos — title copy refinement |
| `app/create-org/review.tsx` | Modify | Review — title copy refinement |
| `app/create-org/success.tsx` | No change | Already well-styled |
| `app/create-org/_layout.tsx` | No change | Progress bar already works |
| `components/BusinessStatusBanner.tsx` | Modify | Redesign to card with icon+name+badge+chevron |
| `app/org-status.tsx` | Create | New timeline detail screen |

---

### Task 1: Redesign Intro Screen

**Files:**
- Modify: `apps/expo/app/create-org/index.tsx`

- [ ] **Step 1: Update the intro screen with card-style step previews**

Replace the current numbered-circle layout with Airbnb-style step preview cards:

```tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const STEPS = [
  { emoji: '🏪', title: 'Wähle deinen Typ', desc: 'Restaurant, Verein, Partei oder Unternehmen' },
  { emoji: '✏️', title: 'Erstelle dein Profil', desc: 'Name, Beschreibung, Fotos und Kontakt' },
  { emoji: '🚀', title: 'Werde sichtbar', desc: 'Nach Freigabe erscheint dein Profil in der App' },
];

export default function CreateOrgIntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 justify-center">
        <Text className="text-3xl font-inter-bold text-text-primary mb-2">
          Werde sichtbar{'\n'}in Röbel
        </Text>
        <Text className="text-base font-inter-regular text-text-secondary mb-10">
          In wenigen Schritten erstellst du dein Profil.
        </Text>

        <View className="gap-3 mb-12">
          {STEPS.map((step, i) => (
            <View key={i} className="flex-row items-center gap-4 border border-border rounded-2xl p-4">
              <Text className="text-3xl">{step.emoji}</Text>
              <View className="flex-1">
                <Text className="text-sm font-inter-semibold text-text-primary">{`${i + 1}. ${step.title}`}</Text>
                <Text className="text-xs font-inter-regular text-text-secondary mt-0.5">{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="px-6 pb-6">
        <Pressable
          onPress={() => router.push('/create-org/type')}
          className="bg-primary rounded-xl py-4 items-center"
        >
          <Text className="text-on-primary text-base font-inter-medium">Los geht's</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify intro screen renders correctly**

Run: `pnpm start` in `apps/expo`, open on simulator, navigate to Profile → Organisation erstellen. Verify:
- Large "Werde sichtbar in Röbel" heading
- 3 card-style steps with emojis and borders
- "Los geht's" navy button at bottom
- Dark mode renders correctly

- [ ] **Step 3: Commit**

```bash
git add apps/expo/app/create-org/index.tsx
git commit -m "feat(expo): redesign org wizard intro with Airbnb-style step cards"
git push
```

---

### Task 2: Refine Type Selection Screen

**Files:**
- Modify: `apps/expo/app/create-org/type.tsx`

- [ ] **Step 1: Update title copy for Airbnb conversational tone**

In `apps/expo/app/create-org/type.tsx`, update the header text and subtitle:

```tsx
// Change line 25-28 from:
<Text className="text-2xl font-inter-bold text-text-primary mb-2">
  Welcher Typ beschreibt dich am besten?
</Text>
<Text className="text-sm font-inter-regular text-text-secondary mb-8">
  Wähle den passenden Typ für deine Organisation.
</Text>

// To:
<Text className="text-2xl font-inter-bold text-text-primary mb-2">
  Welcher Typ passt?
</Text>
<Text className="text-sm font-inter-regular text-text-secondary mb-8">
  Wähle die Kategorie, die deine Organisation am besten beschreibt.
</Text>
```

- [ ] **Step 2: Add top border separator to bottom nav**

In the same file, add a top border to the bottom nav View (line 48):

```tsx
// Change:
<View className="flex-row justify-between px-6 pb-6 pt-3">

// To:
<View className="flex-row justify-between px-6 pb-6 pt-3 border-t border-border">
```

- [ ] **Step 3: Verify and commit**

Verify type selection looks correct with the updated copy and border, then:

```bash
git add apps/expo/app/create-org/type.tsx
git commit -m "feat(expo): refine org type screen copy and nav styling"
git push
```

---

### Task 3: Add Character Counter to Info Screen Name Field

**Files:**
- Modify: `apps/expo/app/create-org/info.tsx`

- [ ] **Step 1: Add character counter below the name field**

In `apps/expo/app/create-org/info.tsx`, add a counter after the name TextInput (after line 58):

```tsx
// After the name TextInput, add:
<Text className="text-xs font-inter-regular text-text-tertiary text-right mb-5">{name.length}/100</Text>
```

And change the name field's bottom margin from `mb-5` to `mb-1`:

```tsx
// Change line 58:
className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-5"
// To:
className="bg-surface rounded-xl px-4 py-3.5 text-base font-inter-regular text-text-primary mb-1"
```

Also update the header text:

```tsx
// Change line 45:
<Text className="text-2xl font-inter-bold text-text-primary mb-2">Erzähl uns von dir</Text>
// To:
<Text className="text-2xl font-inter-bold text-text-primary mb-2">Erzähl uns mehr</Text>
```

- [ ] **Step 2: Add bottom border to nav**

Same as type screen — add `border-t border-border` to the bottom nav View (line 106).

- [ ] **Step 3: Verify and commit**

```bash
git add apps/expo/app/create-org/info.tsx
git commit -m "feat(expo): add name character counter and refine info screen"
git push
```

---

### Task 4: Redesign Location Screen with Inline Geocoding

**Files:**
- Modify: `apps/expo/app/create-org/location.tsx`

This is the biggest change — remove the separate "Adresse prüfen" button and success card, replace with auto-geocode on blur and inline success state on the input field itself.

- [ ] **Step 1: Rewrite the location screen**

Replace the entire content of `apps/expo/app/create-org/location.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import { geocodeLocation } from '@/lib/utils/geocoding';

export default function CreateOrgLocationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateOrgWizard();

  const [address, setAddress] = useState(state.address);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoded, setGeocoded] = useState(!!state.formattedAddress);

  const apiKey = (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const handleGeocode = useCallback(async () => {
    if (!address.trim() || isGeocoding) return;
    setIsGeocoding(true);
    setGeocodeError(null);

    try {
      const result = await geocodeLocation(address.trim(), apiKey);
      if (result) {
        dispatch({
          type: 'SET_LOCATION',
          payload: {
            address: address.trim(),
            latitude: result.latitude,
            longitude: result.longitude,
            formattedAddress: result.formatted_address,
          },
        });
        setGeocoded(true);
      } else {
        setGeocodeError('Adresse nicht gefunden. Bitte versuche eine genauere Eingabe.');
      }
    } catch {
      setGeocodeError('Fehler bei der Adresssuche. Bitte versuche es erneut.');
    } finally {
      setIsGeocoding(false);
    }
  }, [address, apiKey, isGeocoding, dispatch]);

  const handleAddressChange = (text: string) => {
    setAddress(text);
    setGeocoded(false);
    setGeocodeError(null);
  };

  const handleNext = () => {
    if (!geocoded) {
      dispatch({ type: 'SET_LOCATION', payload: { address: address.trim(), latitude: null, longitude: null, formattedAddress: null } });
    }
    router.push('/create-org/contact');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 3</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">Wo befindet ihr euch?</Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Gib eure Adresse ein — wir finden die genauen Koordinaten automatisch.
        </Text>

        <Text className={`text-xs font-inter-medium mb-2 uppercase tracking-wider ${geocoded ? 'text-green-600 dark:text-green-400' : 'text-text-secondary'}`}>
          {geocoded ? 'Adresse ✓' : 'Adresse'}
        </Text>

        {/* Address input — changes to success state when geocoded */}
        <View className={`rounded-xl px-4 py-3.5 flex-row items-center gap-3 ${
          geocoded
            ? 'bg-green-50 dark:bg-green-950 border-2 border-green-500 dark:border-green-400'
            : geocodeError
              ? 'bg-red-50 dark:bg-red-950 border-2 border-red-500 dark:border-red-400'
              : 'bg-surface border border-border'
        }`}>
          <Text className="text-base">{geocoded ? '📍' : '📍'}</Text>
          <View className="flex-1">
            {geocoded && state.formattedAddress ? (
              <>
                <Text className="text-sm font-inter-medium text-text-primary">{state.formattedAddress}</Text>
                <Text className="text-xs font-inter-regular text-text-tertiary mt-0.5">
                  {state.latitude?.toFixed(4)}° N, {state.longitude?.toFixed(4)}° O
                </Text>
              </>
            ) : (
              <TextInput
                value={address}
                onChangeText={handleAddressChange}
                onBlur={handleGeocode}
                onSubmitEditing={handleGeocode}
                placeholder="z.B. Marktplatz 1, Röbel..."
                placeholderTextColor={colors.textTertiary}
                returnKeyType="search"
                className="text-base font-inter-regular text-text-primary p-0"
              />
            )}
          </View>
          {isGeocoding && <ActivityIndicator size="small" color={colors.primary} />}
          {geocoded && <Text className="text-green-600 dark:text-green-400 text-lg">✓</Text>}
        </View>

        {/* Error message */}
        {geocodeError && (
          <Text className="text-xs font-inter-regular text-red-600 dark:text-red-400 mt-2">{geocodeError}</Text>
        )}

        {/* Tap to edit when geocoded */}
        {geocoded && (
          <Pressable onPress={() => { setGeocoded(false); setAddress(state.formattedAddress || address); }} className="mt-3">
            <Text className="text-xs font-inter-medium text-primary text-center">Adresse ändern</Text>
          </Pressable>
        )}

        {/* Skip option */}
        <Pressable onPress={handleNext} className="mt-6">
          <Text className="text-sm font-inter-regular text-text-tertiary text-center underline">Adresse später hinzufügen</Text>
        </Pressable>
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3 border-t border-border">
        <Pressable onPress={() => router.back()} className="py-4 px-6">
          <Text className="text-base font-inter-medium text-text-secondary">Zurück</Text>
        </Pressable>
        <Pressable onPress={handleNext} className="bg-primary rounded-xl py-4 px-8">
          <Text className="text-on-primary text-base font-inter-medium">Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Test the geocoding flow**

Run on simulator and test:
1. Type "Marktplatz 1 Röbel" → tap away (blur) → should show green success state with resolved address + coordinates
2. Tap "Adresse ändern" → should return to editable input
3. Type garbage → blur → should show red error state
4. Tap "Adresse später hinzufügen" → should skip to next step
5. Verify dark mode renders correctly

- [ ] **Step 3: Commit**

```bash
git add apps/expo/app/create-org/location.tsx
git commit -m "feat(expo): redesign location screen with inline AI geocoding success state"
git push
```

---

### Task 5: Polish Contact & Photos Screens

**Files:**
- Modify: `apps/expo/app/create-org/contact.tsx`
- Modify: `apps/expo/app/create-org/photos.tsx`
- Modify: `apps/expo/app/create-org/review.tsx`

- [ ] **Step 1: Update contact screen header and nav**

In `apps/expo/app/create-org/contact.tsx`:

Change the step label (line 56) to use the refined style:
```tsx
// Change:
<Text className="text-sm font-inter-medium text-text-secondary mb-2">SCHRITT 4</Text>
// To:
<Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 4</Text>
```

Change the title (line 57):
```tsx
// Change:
<Text className="text-2xl font-inter-bold text-text-primary mb-2">Kontakt & Öffnungszeiten</Text>
// To:
<Text className="text-2xl font-inter-bold text-text-primary mb-2">Wie erreicht man euch?</Text>
```

Add border to bottom nav (line 150):
```tsx
<View className="flex-row justify-between px-6 pb-6 pt-3 border-t border-border">
```

- [ ] **Step 2: Update photos screen header and nav**

In `apps/expo/app/create-org/photos.tsx`:

Change step label (line 79):
```tsx
<Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 5</Text>
```

Change title (line 80):
```tsx
<Text className="text-2xl font-inter-bold text-text-primary mb-2">Zeigt euch von eurer besten Seite</Text>
```

Add border to bottom nav (line 120):
```tsx
<View className="flex-row justify-between px-6 pb-6 pt-3 border-t border-border">
```

- [ ] **Step 3: Update review screen header and nav**

In `apps/expo/app/create-org/review.tsx`:

Change step label (line 100):
```tsx
<Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 6</Text>
```

Change title (line 101):
```tsx
<Text className="text-2xl font-inter-bold text-text-primary mb-2">Alles richtig?</Text>
```

Add border to bottom nav (line 173):
```tsx
<View className="flex-row justify-between px-6 pb-6 pt-3 border-t border-border">
```

- [ ] **Step 4: Apply consistent step label style to type and info screens**

In `apps/expo/app/create-org/type.tsx` (line 23):
```tsx
<Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 1</Text>
```

In `apps/expo/app/create-org/info.tsx` (line 44):
```tsx
<Text className="text-xs font-inter-medium text-text-tertiary mb-2 uppercase tracking-wider">Schritt 2</Text>
```

- [ ] **Step 5: Verify all screens have consistent styling**

Walk through the entire wizard on simulator. Every screen should have:
- `text-xs text-text-tertiary uppercase tracking-wider` step label
- `text-2xl font-inter-bold` title
- `text-sm text-text-secondary` subtitle
- Bottom nav with `border-t border-border` separator

- [ ] **Step 6: Commit**

```bash
git add apps/expo/app/create-org/contact.tsx apps/expo/app/create-org/photos.tsx apps/expo/app/create-org/review.tsx apps/expo/app/create-org/type.tsx apps/expo/app/create-org/info.tsx
git commit -m "feat(expo): consistent Airbnb-style headers and nav across all wizard screens"
git push
```

---

### Task 6: Redesign Business Status Banner

**Files:**
- Modify: `apps/expo/components/BusinessStatusBanner.tsx`

- [ ] **Step 1: Rewrite BusinessStatusBanner with new card design**

Replace the entire content of `apps/expo/components/BusinessStatusBanner.tsx`:

```tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { BusinessRecord } from '@/lib/types';

const ORG_TYPE_EMOJI: Record<string, string> = {
  gastronomie: '🍽️',
  einzelhandel: '🏪',
  handwerk: '🔧',
  dienstleistung: '💼',
  gesundheit: '🏥',
  bildung: '📚',
  kultur: '🎭',
  sport: '⚽',
  tourismus: '🏖️',
  immobilien: '🏠',
  sonstiges: '🏢',
};

const STATUS_CONFIG: Record<string, { label: string; bgClass: string; textClass: string }> = {
  pending: { label: 'In Prüfung', bgClass: 'bg-amber-50 dark:bg-amber-950', textClass: 'text-amber-700 dark:text-amber-300' },
  approved: { label: 'Freigegeben', bgClass: 'bg-green-50 dark:bg-green-950', textClass: 'text-green-700 dark:text-green-300' },
  rejected: { label: 'Abgelehnt', bgClass: 'bg-red-50 dark:bg-red-950', textClass: 'text-red-700 dark:text-red-300' },
};

type Props = {
  business: BusinessRecord;
  onPress?: () => void;
};

export default function BusinessStatusBanner({ business, onPress }: Props) {
  const emoji = ORG_TYPE_EMOJI[business.category || ''] || '🏢';
  const status = STATUS_CONFIG[business.status] || STATUS_CONFIG.pending;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between border border-border rounded-2xl p-4 mx-4 mb-4"
    >
      <View className="flex-row items-center gap-3 flex-1">
        <View className="w-11 h-11 rounded-xl bg-surface items-center justify-center">
          <Text className="text-xl">{emoji}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-inter-semibold text-text-primary" numberOfLines={1}>{business.name}</Text>
          <Text className="text-xs font-inter-regular text-text-secondary">{business.category || 'Organisation'}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <View className={`px-2.5 py-1 rounded-full ${status.bgClass}`}>
          <Text className={`text-xs font-inter-medium ${status.textClass}`}>{status.label}</Text>
        </View>
        <Text className="text-text-tertiary text-base">›</Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2: Update profile.tsx to pass onPress for navigation**

In `apps/expo/app/profile.tsx`, find where `BusinessStatusBanner` is used and ensure it navigates to the new org-status screen. Search for `BusinessStatusBanner` usage in the file and update the `onPress` prop:

```tsx
<BusinessStatusBanner
  business={userBusiness}
  onPress={() => router.push('/org-status' as any)}
/>
```

If `BusinessStatusBanner` is not currently rendered in the profile view for pending businesses, add it. In the profile's business section (around line 409), after the "Mein Unternehmen" menu item block, ensure the banner shows:

```tsx
{isBusinessOwner && userBusiness && (
  <BusinessStatusBanner
    business={userBusiness}
    onPress={() => router.push({ pathname: '/org-status', params: { businessId: userBusiness.id } } as any)}
  />
)}
```

- [ ] **Step 3: Verify banner renders on profile**

On simulator, create an org registration (or use existing data). Navigate to profile and verify:
- Card with emoji icon, org name, category, status badge pill, and chevron
- Badge shows correct color for pending/approved/rejected
- Tapping the card doesn't crash (org-status screen doesn't exist yet, will be created next task)

- [ ] **Step 4: Commit**

```bash
git add apps/expo/components/BusinessStatusBanner.tsx apps/expo/app/profile.tsx
git commit -m "feat(expo): redesign business status banner with card layout and navigation"
git push
```

---

### Task 7: Create Org Status Detail Screen

**Files:**
- Create: `apps/expo/app/org-status.tsx`

- [ ] **Step 1: Create the org-status screen with timeline**

Create `apps/expo/app/org-status.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useActiveAccount } from 'thirdweb/react';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import type { BusinessRecord } from '@/lib/types';

const ORG_TYPE_EMOJI: Record<string, string> = {
  gastronomie: '🍽️',
  einzelhandel: '🏪',
  handwerk: '🔧',
  dienstleistung: '💼',
  gesundheit: '🏥',
  bildung: '📚',
  kultur: '🎭',
  sport: '⚽',
  tourismus: '🏖️',
  immobilien: '🏠',
  sonstiges: '🏢',
};

type TimelineStep = {
  title: string;
  subtitle: string;
  status: 'done' | 'active' | 'pending' | 'rejected';
};

function getTimelineSteps(business: BusinessRecord): TimelineStep[] {
  const createdDate = new Date(business.created_at).toLocaleDateString('de-DE', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  if (business.status === 'rejected') {
    return [
      { title: 'Antrag eingereicht', subtitle: createdDate, status: 'done' },
      { title: 'Abgelehnt', subtitle: business.admin_notes || 'Bitte kontaktiere die Verwaltung für Details.', status: 'rejected' },
      { title: 'Freigegeben', subtitle: 'Sichtbar in der App', status: 'pending' },
    ];
  }

  if (business.status === 'approved') {
    return [
      { title: 'Antrag eingereicht', subtitle: createdDate, status: 'done' },
      { title: 'Geprüft', subtitle: 'Von der Gemeinde genehmigt', status: 'done' },
      { title: 'Freigegeben', subtitle: 'Sichtbar in der App', status: 'done' },
    ];
  }

  // pending
  return [
    { title: 'Antrag eingereicht', subtitle: createdDate, status: 'done' },
    { title: 'In Prüfung', subtitle: 'Wird von der Gemeinde geprüft', status: 'active' },
    { title: 'Freigegeben', subtitle: 'Sichtbar in der App', status: 'pending' },
  ];
}

function TimelineItem({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const dotStyles = {
    done: 'bg-primary',
    active: 'bg-amber-50 dark:bg-amber-950 border-2 border-amber-600 dark:border-amber-400',
    pending: 'border-2 border-border bg-background',
    rejected: 'bg-red-50 dark:bg-red-950 border-2 border-red-600 dark:border-red-400',
  };

  const titleStyles = {
    done: 'text-text-primary',
    active: 'text-amber-700 dark:text-amber-300',
    pending: 'text-text-tertiary',
    rejected: 'text-red-700 dark:text-red-300',
  };

  const subtitleStyles = {
    done: 'text-text-tertiary',
    active: 'text-text-secondary',
    pending: 'text-text-tertiary',
    rejected: 'text-red-600 dark:text-red-400',
  };

  return (
    <View className="flex-row gap-3.5">
      {/* Dot + Line */}
      <View className="items-center">
        <View className={`w-7 h-7 rounded-full items-center justify-center ${dotStyles[step.status]}`}>
          {step.status === 'done' && <Text className="text-on-primary text-xs">✓</Text>}
          {step.status === 'active' && <View className="w-2.5 h-2.5 rounded-full bg-amber-600 dark:bg-amber-400" />}
          {step.status === 'rejected' && <View className="w-2.5 h-2.5 rounded-full bg-red-600 dark:bg-red-400" />}
        </View>
        {!isLast && (
          <View className={`w-0.5 h-8 ${step.status === 'done' ? 'bg-primary' : 'bg-border'}`} />
        )}
      </View>

      {/* Content */}
      <View className={isLast ? '' : 'pb-4'}>
        <Text className={`text-sm font-inter-semibold ${titleStyles[step.status]}`}>{step.title}</Text>
        <Text className={`text-xs font-inter-regular mt-0.5 ${subtitleStyles[step.status]}`}>{step.subtitle}</Text>
      </View>
    </View>
  );
}

export default function OrgStatusScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const { businessId } = useLocalSearchParams<{ businessId: string }>();

  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!account?.address) { setLoading(false); return; }
      const businesses = await fetchBusinessesByOwner(account.address);
      const found = businessId
        ? businesses.find(b => b.id === businessId)
        : businesses[0];
      setBusiness(found || null);
      setLoading(false);
    }
    load();
  }, [account?.address, businessId]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-base font-inter-regular text-text-secondary text-center">Keine Organisation gefunden.</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-base font-inter-medium text-primary">Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const emoji = ORG_TYPE_EMOJI[business.category || ''] || '🏢';
  const steps = getTimelineSteps(business);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="flex-row items-center gap-3 px-6 pt-4 pb-6 border-b border-border">
          <Pressable onPress={() => router.back()} className="mr-1">
            <Text className="text-2xl text-text-secondary">‹</Text>
          </Pressable>
          <View className="w-11 h-11 rounded-xl bg-surface items-center justify-center">
            <Text className="text-xl">{emoji}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-inter-bold text-text-primary">{business.name}</Text>
            <Text className="text-xs font-inter-regular text-text-secondary">{business.category || 'Organisation'} — Registrierungsstatus</Text>
          </View>
        </View>

        {/* Timeline */}
        <View className="px-6 pt-6">
          {steps.map((step, i) => (
            <TimelineItem key={i} step={step} isLast={i === steps.length - 1} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Test the status detail screen**

Navigate to profile → tap the business status banner → verify:
1. Header shows org emoji, name, and category
2. Timeline renders 3 steps with correct states
3. For pending business: step 1 done (navy checkmark), step 2 active (orange dot), step 3 pending (grey circle)
4. Back button works
5. Dark mode renders correctly

- [ ] **Step 3: Commit**

```bash
git add apps/expo/app/org-status.tsx
git commit -m "feat(expo): add org registration status detail screen with timeline"
git push
```

---

### Task 8: Final Verification

- [ ] **Step 1: Full end-to-end walkthrough**

On the iOS simulator, run through the complete flow:

1. Profile → "Organisation erstellen" → verify intro screen with card steps
2. "Los geht's" → type selection → select Restaurant → verify blue highlight → "Weiter"
3. Info → enter name "Test Restaurant" → verify character counter shows "15/100" → "Weiter"
4. Location → type "Marktplatz 1 Röbel" → tap away → verify green success state with resolved address → "Weiter"
5. Contact → add phone number → "Weiter"
6. Photos → optionally upload → "Weiter"
7. Review → verify all data displays → "Antrag einreichen"
8. Success screen → "Zurück zum Profil"
9. Profile → verify status banner card with "In Prüfung" badge
10. Tap banner → verify timeline detail screen

- [ ] **Step 2: Test dark mode**

Toggle dark mode and repeat key screens: intro, type selection, location (success state), status banner, timeline.

- [ ] **Step 3: Test edge cases**

1. Location: submit with empty address → should allow skipping
2. Location: type invalid address → verify red error state
3. Type selection: try to proceed without selecting → "Weiter" should be disabled
4. Info: try to proceed without name → "Weiter" should be disabled
