import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useActiveAccount } from 'thirdweb/react';
import { useSnackbar } from '@/context/SnackbarContext';
import { supabase } from '@/lib/supabase';
import { EventRecord } from '@/lib/types';
import { ArrowLeftIcon, EyeIcon, HeartIcon } from '@/components/Icons';
import { CATEGORIES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { getAccountRole, canEditEvents, AccountRole } from '@/lib/supabase-account-roles';
import { getViewCount } from '@/lib/supabase-event-views';
import { getInterestCount } from '@/lib/supabase-interests';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const account = useActiveAccount();
  const { showSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [viewCount, setViewCount] = useState(0);
  const [interestCount, setInterestCount] = useState(0);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [organizerName, setOrganizerName] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [organizerPhone, setOrganizerPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [ticketPrice, setTicketPrice] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!id) return;

      // Fetch event
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      const event = data as EventRecord;
      setTitle(event.title);
      setDescription(event.description ?? '');
      setDate(event.date);
      setTime(event.time ?? '');
      setEndTime(event.end_time ?? '');
      setLocation(event.location);
      setCategory(event.category);
      setOrganizerName(event.organizer_name);
      setOrganizerEmail(event.organizer_email);
      setOrganizerPhone(event.organizer_phone ?? '');
      setWebsiteUrl(event.website_url ?? '');
      setTicketPrice(event.ticket_price != null ? String(event.ticket_price) : '');
      setImageUrl(event.image_url);

      // Fetch role + stats
      if (account?.address && event.account_id) {
        const userRole = await getAccountRole(event.account_id, account.address);
        setRole(userRole);
      }

      const [views, interests] = await Promise.all([
        getViewCount(event.id),
        getInterestCount(event.id),
      ]);
      setViewCount(views);
      setInterestCount(interests);

      setLoading(false);
    }

    load();
  }, [id, account?.address]);

  const handleSave = useCallback(async () => {
    if (!id || !title.trim() || !location.trim() || !organizerName.trim() || !organizerEmail.trim()) {
      Alert.alert('Fehler', 'Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('events')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        date,
        time: time || null,
        end_time: endTime || null,
        location: location.trim(),
        category,
        organizer_name: organizerName.trim(),
        organizer_email: organizerEmail.trim(),
        organizer_phone: organizerPhone.trim() || null,
        website_url: websiteUrl.trim() || null,
        ticket_price: ticketPrice ? parseFloat(ticketPrice.replace(',', '.')) : null,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    setSaving(false);

    if (error) {
      Alert.alert('Fehler', 'Änderungen konnten nicht gespeichert werden.');
      return;
    }

    showSnackbar({
      message: 'Änderungen gespeichert — wird erneut geprüft',
      duration: 4000,
    });
    router.back();
  }, [id, title, description, date, time, endTime, location, category, organizerName, organizerEmail, organizerPhone, websiteUrl, ticketPrice]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Veranstaltung löschen',
      'Veranstaltung endgültig löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('events').delete().eq('id', id);
            showSnackbar({
              message: 'Veranstaltung gelöscht',
              duration: 4000,
            });
            router.back();
          },
        },
      ]
    );
  }, [id]);

  const editable = canEditEvents(role);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeftIcon size={24} color={colors.textPrimary} strokeWidth={1.5} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {editable ? 'Veranstaltung bearbeiten' : 'Veranstaltung'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        extraScrollHeight={80}
      >
        {/* Stats bar */}
        <View style={[styles.statsBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={styles.statsImage}
              contentFit="cover"
            />
          )}
          <View style={styles.statsInfo}>
            <Text style={[styles.statsTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <EyeIcon size={16} color={colors.textTertiary} />
                <Text style={[styles.statValue, { color: colors.textSecondary }]}>{viewCount} Aufrufe</Text>
              </View>
              <View style={styles.statItem}>
                <HeartIcon size={16} color={colors.textTertiary} />
                <Text style={[styles.statValue, { color: colors.textSecondary }]}>{interestCount} interessiert</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Form fields */}
        <View style={styles.form}>
          <FormField label="Titel *" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              editable={editable}
              placeholder="Veranstaltungstitel"
              placeholderTextColor={colors.textTertiary}
            />
          </FormField>

          <FormField label="Beschreibung" colors={colors}>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={description}
              onChangeText={setDescription}
              editable={editable}
              multiline
              numberOfLines={4}
              placeholder="Beschreibung der Veranstaltung"
              placeholderTextColor={colors.textTertiary}
              textAlignVertical="top"
            />
          </FormField>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Datum *" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  value={date}
                  onChangeText={setDate}
                  editable={editable}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textTertiary}
                />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Uhrzeit" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  value={time}
                  onChangeText={setTime}
                  editable={editable}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textTertiary}
                />
              </FormField>
            </View>
          </View>

          <FormField label="Ort *" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={location}
              onChangeText={setLocation}
              editable={editable}
              placeholder="Veranstaltungsort"
              placeholderTextColor={colors.textTertiary}
            />
          </FormField>

          <FormField label="Kategorie" colors={colors}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => editable && setCategory(cat === category ? null : cat)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: category === cat ? colors.primary : colors.surface,
                      borderColor: category === cat ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: category === cat ? '#fff' : colors.textPrimary },
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </FormField>

          <FormField label="Veranstalter *" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={organizerName}
              onChangeText={setOrganizerName}
              editable={editable}
              placeholder="Name des Veranstalters"
              placeholderTextColor={colors.textTertiary}
            />
          </FormField>

          <FormField label="E-Mail *" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={organizerEmail}
              onChangeText={setOrganizerEmail}
              editable={editable}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="kontakt@beispiel.de"
              placeholderTextColor={colors.textTertiary}
            />
          </FormField>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Telefon" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  value={organizerPhone}
                  onChangeText={setOrganizerPhone}
                  editable={editable}
                  keyboardType="phone-pad"
                  placeholder="Optional"
                  placeholderTextColor={colors.textTertiary}
                />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Preis (€)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
                  value={ticketPrice}
                  onChangeText={setTicketPrice}
                  editable={editable}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                />
              </FormField>
            </View>
          </View>

          <FormField label="Website" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              value={websiteUrl}
              onChangeText={setWebsiteUrl}
              editable={editable}
              keyboardType="url"
              autoCapitalize="none"
              placeholder="https://..."
              placeholderTextColor={colors.textTertiary}
            />
          </FormField>

          {/* Action buttons */}
          {editable && (
            <View style={styles.actions}>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveBtn,
                  { backgroundColor: colors.primary },
                  pressed && styles.btnPressed,
                  saving && styles.btnDisabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Änderungen speichern</Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={styles.deleteBtnText}>Veranstaltung löschen</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function FormField({ label, colors, children }: { label: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.field}>
      <Text style={[fieldStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 60,
  },
  statsBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  statsImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  statsInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  statsTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  form: {
    gap: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  textArea: {
    minHeight: 100,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  actions: {
    gap: 12,
    marginTop: 16,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  deleteBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
  },
  deleteBtnText: {
    color: '#E53935',
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
