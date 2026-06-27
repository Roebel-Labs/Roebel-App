import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import {
  lightColors,
  darkColors,
  fontFamily,
  fontSize,
  spacing,
  borderRadius,
  ColorTokens,
} from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

// ─── Color Swatch ─────────────────────────────────────────

function ColorSwatch({ name, color }: { name: string; color: string }) {
  return (
    <View style={swatchStyles.container}>
      <View style={[swatchStyles.swatch, { backgroundColor: color }]} />
      <Text style={swatchStyles.name}>{name}</Text>
      <Text style={swatchStyles.hex}>{color}</Text>
    </View>
  );
}

const swatchStyles = StyleSheet.create({
  container: {
    width: '30%',
    marginBottom: 16,
    alignItems: 'center',
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 4,
  },
  name: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#6b7280',
    textAlign: 'center',
  },
  hex: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: '#9ca3af',
    textAlign: 'center',
  },
});

// ─── Section ──────────────────────────────────────────────

function DSSection({ title, children, colors }: { title: string; children: React.ReactNode; colors: ColorTokens }) {
  return (
    <View style={dsSectionStyles.section}>
      <Text style={[dsSectionStyles.title, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[dsSectionStyles.content, { backgroundColor: colors.surface }]}>
        {children}
      </View>
    </View>
  );
}

const dsSectionStyles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  title: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  content: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
});

// ─── Main Screen ──────────────────────────────────────────

export default function DesignSystemScreen() {
  const router = useRouter();
  const { colors, isDark, preference, setPreference, effectiveTheme } = useTheme();
  const { tier } = useUser();
  const isExtendedMode = tier !== 'guest';

  useEffect(() => {
    if (!isExtendedMode) {
      router.replace('/profile');
    }
  }, [isExtendedMode]);

  if (!isExtendedMode) return null;

  const colorEntries = Object.entries(isDark ? darkColors : lightColors) as [string, string][];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Design System</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Theme Info */}
        <View style={[styles.themeInfo, { backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16 }]}>
          <Text style={[styles.themeInfoLabel, { color: colors.textSecondary }]}>
            Aktuelles Schema: <Text style={{ color: colors.primary, fontFamily: 'Inter-Medium' }}>
              {effectiveTheme === 'dark' ? 'Dunkel' : 'Hell'}
            </Text> (Einstellung: {preference === 'system' ? 'System' : preference === 'light' ? 'Hell' : 'Dunkel'})
          </Text>
          <View style={styles.themeButtons}>
            {(['system', 'light', 'dark'] as const).map((p) => (
              <Pressable
                key={p}
                style={[
                  styles.themeButton,
                  { borderColor: preference === p ? colors.primary : colors.borderSecondary },
                  preference === p && { backgroundColor: colors.primaryLight },
                ]}
                onPress={() => setPreference(p)}
              >
                <Text style={[styles.themeButtonText, { color: preference === p ? colors.primary : colors.textSecondary }]}>
                  {p === 'system' ? 'System' : p === 'light' ? 'Hell' : 'Dunkel'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Colors */}
        <DSSection title="FARBEN" colors={colors}>
          <View style={styles.swatchGrid}>
            {colorEntries.map(([name, value]) => (
              <ColorSwatch key={name} name={name} color={value} />
            ))}
          </View>
        </DSSection>

        {/* Typography */}
        <DSSection title="TYPOGRAFIE" colors={colors}>
          {Object.entries(fontSize).map(([key, size]) => (
            <View key={key} style={styles.typoRow}>
              <Text style={[styles.typoLabel, { color: colors.textTertiary }]}>
                {key} ({size}px)
              </Text>
              <Text style={{ fontSize: size, fontFamily: fontFamily.regular, color: colors.textPrimary }}>
                Inter Regular
              </Text>
            </View>
          ))}
          <View style={[styles.typoDivider, { backgroundColor: colors.border }]} />
          {Object.entries(fontSize).slice(0, 5).map(([key, size]) => (
            <View key={`medium-${key}`} style={styles.typoRow}>
              <Text style={[styles.typoLabel, { color: colors.textTertiary }]}>
                {key} Medium
              </Text>
              <Text style={{ fontSize: size, fontFamily: fontFamily.medium, color: colors.textPrimary }}>
                Inter Medium
              </Text>
            </View>
          ))}
          <View style={[styles.typoDivider, { backgroundColor: colors.border }]} />
          {Object.entries(fontSize).slice(0, 5).map(([key, size]) => (
            <View key={`semi-${key}`} style={styles.typoRow}>
              <Text style={[styles.typoLabel, { color: colors.textTertiary }]}>
                {key} SemiBold
              </Text>
              <Text style={{ fontSize: size, fontFamily: fontFamily.semiBold, color: colors.textPrimary }}>
                Inter SemiBold
              </Text>
            </View>
          ))}
        </DSSection>

        {/* Spacing */}
        <DSSection title="ABSTÄNDE" colors={colors}>
          <View style={styles.spacingList}>
            {Object.entries(spacing).map(([key, value]) => (
              <View key={key} style={styles.spacingRow}>
                <Text style={[styles.spacingLabel, { color: colors.textTertiary }]}>
                  {key} ({value}px)
                </Text>
                <View style={[styles.spacingBar, { width: value, backgroundColor: colors.primary }]} />
              </View>
            ))}
          </View>
        </DSSection>

        {/* Border Radii */}
        <DSSection title="RADIEN" colors={colors}>
          <View style={styles.radiiRow}>
            {Object.entries(borderRadius).filter(([k]) => k !== 'full').map(([key, value]) => (
              <View key={key} style={styles.radiiItem}>
                <View style={[styles.radiiBox, { borderRadius: value, borderColor: colors.primary }]} />
                <Text style={[styles.radiiLabel, { color: colors.textTertiary }]}>{key} ({value})</Text>
              </View>
            ))}
          </View>
        </DSSection>

        {/* Buttons */}
        <DSSection title="BUTTONS" colors={colors}>
          <Pressable style={[styles.demoButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.demoButtonText, { color: colors.onPrimary }]}>
              Primär Button
            </Text>
          </Pressable>
          <View style={{ height: 12 }} />
          <Pressable style={[styles.demoButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }]}>
            <Text style={[styles.demoButtonText, { color: colors.primary }]}>
              Sekundär Button
            </Text>
          </Pressable>
          <View style={{ height: 12 }} />
          <Pressable style={[styles.demoButton, { backgroundColor: colors.disabled }]} disabled>
            <Text style={[styles.demoButtonText, { color: colors.disabledText }]}>
              Deaktiviert
            </Text>
          </Pressable>
        </DSSection>

        {/* Inputs */}
        <DSSection title="EINGABEFELDER" colors={colors}>
          <TextInput
            style={[styles.demoInput, {
              borderColor: colors.borderSecondary,
              color: colors.textPrimary,
              backgroundColor: colors.background,
            }]}
            placeholder="Eingabe..."
            placeholderTextColor={colors.textTertiary}
          />
          <View style={{ height: 16 }} />
          <View style={styles.switchRow}>
            <Text style={{ fontSize: 15, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
              Switch Beispiel
            </Text>
            <Switch
              value={isDark}
              onValueChange={(val) => setPreference(val ? 'dark' : 'light')}
              trackColor={{ false: colors.switchTrackOff, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>
        </DSSection>

        {/* Cards */}
        <DSSection title="KARTEN" colors={colors}>
          <View style={[styles.demoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.demoCardImage, { backgroundColor: colors.cardPlaceholder }]} />
            <View style={styles.demoCardContent}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter-Medium', color: colors.textPrimary }}>
                Beispiel Karte
              </Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter-Regular', color: colors.textSecondary, marginTop: 4 }}>
                Eine Beispielkarte mit Platzhalter-Bild und Text
              </Text>
            </View>
          </View>
        </DSSection>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  themeInfo: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  themeInfoLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
  },
  themeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  themeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  themeButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  typoRow: {
    marginBottom: 12,
  },
  typoLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  typoDivider: {
    height: 1,
    marginVertical: 12,
  },
  spacingList: {
    gap: 8,
  },
  spacingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  spacingLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    width: 70,
  },
  spacingBar: {
    height: 12,
    borderRadius: 4,
    minWidth: 2,
  },
  radiiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  radiiItem: {
    alignItems: 'center',
  },
  radiiBox: {
    width: 48,
    height: 48,
    borderWidth: 2,
    marginBottom: 4,
  },
  radiiLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
  },
  demoButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  demoInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  demoCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  demoCardImage: {
    height: 120,
  },
  demoCardContent: {
    padding: 12,
  },
});
