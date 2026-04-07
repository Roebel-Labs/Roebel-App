import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchDealById, updateDeal, deleteDeal, toggleDealBoost } from '@/lib/supabase-deals';
import type { BusinessDealRecord, DealStatus } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  paused: 'Pausiert',
  expired: 'Abgelaufen',
};

export default function DealDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();

  const [deal, setDeal] = useState<BusinessDealRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Edit state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [status, setStatus] = useState<DealStatus>('draft');

  useEffect(() => {
    if (id) loadDeal();
  }, [id]);

  const loadDeal = async () => {
    try {
      const data = await fetchDealById(id!);
      setDeal(data);
      if (data) {
        setTitle(data.title);
        setDescription(data.description || '');
        setDealValue(data.deal_value || '');
        setStatus(data.status);
      }
    } catch (error) {
      console.error('Error loading deal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!deal) return;
    setSaving(true);
    try {
      const updated = await updateDeal(deal.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        deal_value: dealValue.trim() || undefined,
        status,
        is_active: status === 'active',
      });
      setDeal(updated);
      setEditMode(false);
    } catch (error: any) {
      Alert.alert('Fehler', error?.message || 'Änderungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Angebot löschen',
      'Möchten Sie dieses Angebot wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDeal(deal!.id);
              router.back();
            } catch (error: any) {
              Alert.alert('Fehler', error?.message || 'Löschen fehlgeschlagen.');
            }
          },
        },
      ]
    );
  };

  const handleToggleBoost = async () => {
    if (!deal) return;
    try {
      const newBoosted = !deal.is_boosted;
      const expiresAt = newBoosted
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
      await toggleDealBoost(deal.id, newBoosted, expiresAt);
      setDeal(prev => prev ? { ...prev, is_boosted: newBoosted, boost_expires_at: expiresAt || null } : null);
    } catch (error: any) {
      Alert.alert('Fehler', error?.message || 'Boost-Status konnte nicht geändert werden.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!deal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Angebot nicht gefunden</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {editMode ? 'Bearbeiten' : 'Angebot'}
        </Text>
        <Pressable onPress={() => editMode ? handleSave() : setEditMode(true)} style={styles.headerAction}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.headerActionText, { color: colors.primary }]}>
              {editMode ? 'Speichern' : 'Bearbeiten'}
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAwareScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" enableOnAndroid={true} enableAutomaticScroll={true} extraScrollHeight={100} extraHeight={150}>
        {editMode ? (
          // Edit Mode
          <>
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>TITEL</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
            </View>

            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>WERT</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={dealValue}
                  onChangeText={setDealValue}
                />
              </View>
            </View>

            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BESCHREIBUNG</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
                <TextInput
                  style={[styles.input, styles.textArea, { color: colors.textPrimary }]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>STATUS</Text>
              <View style={styles.statusRow}>
                {(['draft', 'active', 'paused'] as DealStatus[]).map(s => (
                  <Pressable
                    key={s}
                    style={[styles.statusButton, status === s && [styles.statusButtonActive, { backgroundColor: colors.primary }]]}
                    onPress={() => setStatus(s)}
                  >
                    <Text style={[styles.statusButtonText, { color: colors.textSecondary }, status === s && { color: colors.onPrimary }]}>
                      {STATUS_LABELS[s]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable style={[styles.deleteButton, { borderColor: '#EF4444' }]} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Angebot löschen</Text>
            </Pressable>
          </>
        ) : (
          // View Mode
          <>
            <View style={[styles.detailCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.dealTitle, { color: colors.textPrimary }]}>{deal.title}</Text>
              {deal.deal_value && (
                <Text style={[styles.dealValue, { color: colors.primary }]}>{deal.deal_value}</Text>
              )}
              {deal.description && (
                <Text style={[styles.dealDescription, { color: colors.textSecondary }]}>{deal.description}</Text>
              )}
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{deal.views_count.toLocaleString('de-DE')}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Aufrufe</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{deal.clicks_count.toLocaleString('de-DE')}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Klicks</Text>
              </View>
            </View>

            {/* Boost Toggle */}
            <Pressable
              style={[styles.boostButton, { backgroundColor: deal.is_boosted ? (isDark ? '#78350F' : '#FEF3C7') : colors.surface }]}
              onPress={handleToggleBoost}
            >
              <Text style={[styles.boostButtonText, { color: deal.is_boosted ? (isDark ? '#FCD34D' : '#92400E') : colors.textPrimary }]}>
                {deal.is_boosted ? 'Hervorhebung beenden' : 'Hervorheben (7 Tage)'}
              </Text>
              {deal.is_boosted && deal.boost_expires_at && (
                <Text style={[styles.boostExpiry, { color: isDark ? '#D97706' : '#B45309' }]}>
                  Läuft ab: {new Date(deal.boost_expires_at).toLocaleDateString('de-DE')}
                </Text>
              )}
            </Pressable>
          </>
        )}

        <View style={styles.bottomPadding} />
      </KeyboardAwareScrollView>
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
    fontFamily: 'Inter-Medium',
  },
  headerAction: {
    width: 80,
    alignItems: 'flex-end',
  },
  headerActionText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    marginBottom: 24,
  },
  detailCard: {
    margin: 16,
    borderRadius: 12,
    padding: 20,
    gap: 8,
  },
  dealTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  dealValue: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  dealDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
  },
  statLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  boostButton: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  boostButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  boostExpiry: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  fieldSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 100,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusButtonActive: {
    borderWidth: 0,
  },
  statusButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  deleteButton: {
    marginHorizontal: 16,
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#EF4444',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  bottomPadding: {
    height: 40,
  },
});
