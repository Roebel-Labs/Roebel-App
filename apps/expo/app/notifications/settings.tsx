import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNotificationsContext } from '@/context/NotificationsContext';
import { EVENT_CATEGORIES } from '@/lib/categories';
import { useTheme } from '@/context/ThemeContext';

// Import SVG icons
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ChevronRightIcon from '@/assets/icons/chevron-right.svg';
import CheckIcon from '@/assets/icons/check.svg';

type SectionProps = {
  title: string;
  children: React.ReactNode;
  colors: any;
};

function Section({ title, children, colors }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

type ToggleRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
  colors: any;
};

function ToggleRow({ label, description, value, onValueChange, disabled, isLast, colors }: ToggleRowProps) {
  return (
    <View style={[styles.toggleRow, { borderBottomColor: colors.borderSecondary }, isLast && styles.toggleRowLast]}>
      <View style={styles.toggleTextContainer}>
        <Text style={[styles.toggleLabel, { color: colors.textPrimary }, disabled && { color: colors.textTertiary }]}>{label}</Text>
        {description && (
          <Text style={[styles.toggleDescription, { color: colors.textSecondary }, disabled && { color: colors.textTertiary }]}>
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderSecondary, true: colors.primary }}
        thumbColor={colors.textInverted}
        ios_backgroundColor={colors.borderSecondary}
      />
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    preferences,
    permissionStatus,
    isLoading,
    error,
    updatePreference,
    toggleCategory,
  } = useNotificationsContext();

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const isPermissionDenied = permissionStatus === 'denied';
  const eventsEnabled = preferences?.events_enabled ?? true;

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const selectedCategoriesCount = preferences?.event_categories?.length || 0;
  const allCategoriesSelected = selectedCategoriesCount === EVENT_CATEGORIES.length;

  const handleSelectAllCategories = async () => {
    if (allCategoriesSelected) {
      await updatePreference('event_categories', []);
    } else {
      await updatePreference('event_categories', [...EVENT_CATEGORIES]);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Pushnachrichten</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Laden...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Denied state - show overlay with settings prompt
  if (isPermissionDenied) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Pushnachrichten</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.deniedContainer}>
          {/* Settings sections (disabled/greyed out in background) */}
          <View style={styles.disabledContent}>
            <Section title="Veranstaltungen" colors={colors}>
              <ToggleRow
                label="Neue Veranstaltungen"
                description="Wir informieren Sie über die wichtigsten Veranstaltungen"
                value={false}
                onValueChange={() => {}}
                disabled
                colors={colors}
              />
              <View style={[styles.categorySelector, styles.categorySelectorDisabled, { borderBottomColor: colors.borderSecondary }]}>
                <View style={styles.categorySelectorTextContainer}>
                  <Text style={[styles.categorySelectorLabel, { color: colors.textTertiary }]}>
                    Kategorie
                  </Text>
                </View>
                <View style={styles.categorySelectorRight}>
                  <Text style={[styles.categorySelectorValue, { color: colors.textTertiary }]}>
                    0/{EVENT_CATEGORIES.length}
                  </Text>
                  <ChevronRightIcon width={20} height={20} color={colors.textTertiary} style={styles.chevronIcon} />
                </View>
              </View>
            </Section>

            <Section title="Nachrichten" colors={colors}>
              <ToggleRow
                label="Eilmeldungen"
                description="Wir informieren Sie über die wichtigsten Nachrichten"
                value={false}
                onValueChange={() => {}}
                disabled
                isLast
                colors={colors}
              />
            </Section>
          </View>

          {/* Overlay card */}
          <View style={styles.deniedOverlay}>
            <View style={[styles.deniedCard, { backgroundColor: colors.warningBackground }]}>
              <Text style={[styles.deniedTitle, { color: colors.warning }]}>Push-Benachrichtigungen sind deaktiviert</Text>
              <Text style={[styles.deniedDescription, { color: colors.warning }]}>
                Der App fehlt derzeit die Berechtigung, Ihnen Push-Benachrichtigungen zu senden.
                Bitte aktivieren Sie diese in den Geräteeinstellungen, um informiert zu bleiben.
              </Text>
              <Pressable style={[styles.settingsButton, { backgroundColor: colors.primary }]} onPress={handleOpenSettings}>
                <Text style={[styles.settingsButtonText, { color: colors.onPrimary }]}>Einstellungen Anpassen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Granted/Undetermined state - show full settings
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Pushnachrichten</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Intro text */}
        <View style={styles.introContainer}>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            Über Push Nachrichten informieren wir Sie über die wichtigsten Meldungen über Themen
            für Ihre Region relevant sind.
          </Text>
        </View>

        {/* Error Message */}
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {/* Events Section */}
        <Section title="Veranstaltungen" colors={colors}>
          <ToggleRow
            label="Neue Veranstaltungen"
            description="Wir informieren Sie über die wichtigsten Veranstaltungen"
            value={preferences?.events_enabled ?? true}
            onValueChange={(value) => updatePreference('events_enabled', value)}
            colors={colors}
          />

          {/* Category Selection */}
          <Pressable
            style={[
              styles.categorySelector,
              { borderBottomColor: colors.borderSecondary },
              !eventsEnabled && styles.categorySelectorDisabled
            ]}
            onPress={() => eventsEnabled && setShowCategoryPicker(!showCategoryPicker)}
            disabled={!eventsEnabled}
          >
            <View style={styles.categorySelectorTextContainer}>
              <Text style={[
                styles.categorySelectorLabel,
                { color: colors.textPrimary },
                !eventsEnabled && { color: colors.textTertiary }
              ]}>
                Kategorie
              </Text>
            </View>
            <View style={styles.categorySelectorRight}>
              <Text style={[
                styles.categorySelectorValue,
                { color: colors.primary },
                !eventsEnabled && { color: colors.textTertiary }
              ]}>
                {selectedCategoriesCount}/{EVENT_CATEGORIES.length}
              </Text>
              <ChevronRightIcon
                width={20}
                height={20}
                style={[
                  styles.chevronIcon,
                  showCategoryPicker && styles.chevronIconRotated,
                ]}
              />
            </View>
          </Pressable>

          {showCategoryPicker && eventsEnabled && (
            <View style={[styles.categoryList, { backgroundColor: colors.background, borderBottomColor: colors.borderSecondary }]}>
              {/* Select All / Deselect All */}
              <Pressable
                style={[styles.selectAllRow, { borderBottomColor: colors.surface, backgroundColor: colors.pressedOverlay }]}
                onPress={handleSelectAllCategories}
              >
                <Text style={[styles.selectAllText, { color: colors.primary }]}>
                  {allCategoriesSelected ? 'Alle abwählen' : 'Alle auswählen'}
                </Text>
              </Pressable>

              {EVENT_CATEGORIES.map((category, index) => (
                <Pressable
                  key={category}
                  style={[
                    styles.categoryItem,
                    { borderBottomColor: colors.surface },
                    index === EVENT_CATEGORIES.length - 1 && styles.categoryItemLast,
                  ]}
                  onPress={() => toggleCategory(category)}
                >
                  <Text style={[styles.categoryItemText, { color: colors.textPrimary }]}>{category}</Text>
                  <View
                    style={[
                      styles.categoryCheckbox,
                      { borderColor: colors.disabled, backgroundColor: colors.background },
                      preferences?.event_categories?.includes(category) &&
                        { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    {preferences?.event_categories?.includes(category) && (
                      <CheckIcon width={14} height={14} color={colors.textInverted} />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Section>

        {/* News Section */}
        <Section title="Nachrichten" colors={colors}>
          <ToggleRow
            label="Eilmeldungen"
            description="Wir informieren Sie über die wichtigsten Nachrichten"
            value={preferences?.news_breaking ?? true}
            onValueChange={(value) => updatePreference('news_breaking', value)}
            isLast
            colors={colors}
          />
        </Section>

        {/* Feed Posts Section */}
        <Section title="Beiträge" colors={colors}>
          <ToggleRow
            label="Neue Beiträge"
            description="Benachrichtigung bei jedem neuen Beitrag im „Für Alle“-Feed"
            value={preferences?.feed_posts_enabled ?? true}
            onValueChange={(value) => updatePreference('feed_posts_enabled', value)}
            isLast
            colors={colors}
          />
        </Section>

        {/* Direct Messages Section */}
        <Section title="Direktnachrichten" colors={colors}>
          <ToggleRow
            label="Direktnachrichten"
            description="Benachrichtigung bei neuen Direktnachrichten"
            value={preferences?.dms_enabled ?? true}
            onValueChange={(value) => updatePreference('dms_enabled', value)}
            isLast
            colors={colors}
          />
        </Section>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={[styles.infoText, { color: colors.textTertiary }]}>
            Benachrichtigungen helfen Ihnen, keine wichtigen Veranstaltungen und Nachrichten aus
            Röbel zu verpassen. Sie können die Einstellungen jederzeit ändern.
          </Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
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
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  introContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  introText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  // Denied state styles
  deniedContainer: {
    flex: 1,
    position: 'relative',
  },
  disabledContent: {
    opacity: 0.4,
  },
  deniedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  deniedCard: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  deniedTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  deniedDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: 20,
  },
  settingsButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  settingsButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  toggleRowLast: {
    borderBottomWidth: 0,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  toggleDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  categorySelectorDisabled: {
    opacity: 0.6,
  },
  categorySelectorTextContainer: {
    flex: 1,
  },
  categorySelectorLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  categorySelectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categorySelectorValue: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  chevronIcon: {
    transform: [{ rotate: '90deg' }],
  },
  chevronIconRotated: {
    transform: [{ rotate: '-90deg' }],
  },
  categoryList: {
    borderBottomWidth: 1,
  },
  selectAllRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  selectAllText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  categoryItemLast: {
    borderBottomWidth: 0,
  },
  categoryItemText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  categoryCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  bottomPadding: {
    height: 40,
  },
});
