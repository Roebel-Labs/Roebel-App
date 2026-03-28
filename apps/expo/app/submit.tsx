import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import type { ColorTokens } from '@/constants/theme';

export default function SubmitEventScreen() {
  const { colors } = useTheme();
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    end_time: '',
    location: '',
    organizer_name: '',
    organizer_email: '',
    organizer_phone: '',
    category: '',
    image_url: '',
    website_url: '',
    ticket_price: '',
    max_attendees: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit() {
    if (!form.title || !form.date || !form.location || !form.organizer_name || !form.organizer_email) {
      Alert.alert('Erforderliche Felder fehlen', 'Bitte fülle Titel, Datum, Ort, Veranstaltername und E-Mail aus.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('events').insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: form.date,
        time: form.time || null,
        end_time: form.end_time || null,
        location: form.location.trim(),
        organizer_name: form.organizer_name.trim(),
        organizer_email: form.organizer_email.trim(),
        organizer_phone: form.organizer_phone.trim() || null,
        category: form.category.trim() || null,
        image_url: form.image_url.trim() || null,
        website_url: form.website_url.trim() || null,
        ticket_price: form.ticket_price ? Number(form.ticket_price) : 0,
        max_attendees: form.max_attendees ? Number(form.max_attendees) : null,
        status: 'pending'
      });
      if (error) throw error;
      Alert.alert('Gesendet!', 'Dein Event wurde zur Prüfung eingereicht. Nach Freigabe wird es angezeigt.');
      setForm({
        title: '', description: '', date: '', time: '', end_time: '', location: '', organizer_name: '', organizer_email: '', organizer_phone: '', category: '', image_url: '', website_url: '', ticket_price: '', max_attendees: ''
      });
    } catch (e: any) {
      Alert.alert('Senden fehlgeschlagen', e.message ?? 'Bitte versuche es später erneut.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Veranstaltung einreichen</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Dein Event wird vor der Veröffentlichung geprüft.</Text>

      <Field label="Titel" required colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.title} onChangeText={(t) => set('title', t)} />
      </Field>

      <Field label="Beschreibung" colors={colors}>
        <TextInput
          style={[styles.input, { minHeight: 80, backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.description}
          onChangeText={(t) => set('description', t)} multiline
        />
      </Field>

      <Field label="Datum (JJJJ-MM-TT)" required colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.date} onChangeText={(t) => set('date', t)} autoCapitalize="none" />
      </Field>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label="Beginn (HH:MM)" colors={colors}>
            <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.time} onChangeText={(t) => set('time', t)} autoCapitalize="none" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Ende (HH:MM)" colors={colors}>
            <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.end_time} onChangeText={(t) => set('end_time', t)} autoCapitalize="none" />
          </Field>
        </View>
      </View>

      <Field label="Ort" required colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.location} onChangeText={(t) => set('location', t)} />
      </Field>

      <Field label="Veranstalter" required colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.organizer_name} onChangeText={(t) => set('organizer_name', t)} />
      </Field>

      <Field label="E-Mail des Veranstalters" required colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.organizer_email} onChangeText={(t) => set('organizer_email', t)} autoCapitalize="none" />
      </Field>

      <Field label="Telefon des Veranstalters" colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.organizer_phone} onChangeText={(t) => set('organizer_phone', t)} />
      </Field>

      <Field label="Kategorie" colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.category} onChangeText={(t) => set('category', t)} />
      </Field>

      <Field label="Bild-URL" colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.image_url} onChangeText={(t) => set('image_url', t)} autoCapitalize="none" />
      </Field>

      <Field label="Website-URL" colors={colors}>
        <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.website_url} onChangeText={(t) => set('website_url', t)} autoCapitalize="none" />
      </Field>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label="Ticketpreis (EUR)" colors={colors}>
            <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.ticket_price} onChangeText={(t) => set('ticket_price', t)} keyboardType="decimal-pad" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Max. Teilnehmerzahl" colors={colors}>
            <TextInput style={[styles.input, { backgroundColor: colors.background, borderColor: colors.borderSecondary }]} value={form.max_attendees} onChangeText={(t) => set('max_attendees', t)} keyboardType="number-pad" />
          </Field>
        </View>
      </View>

      <Pressable style={[styles.submitBtn, { backgroundColor: colors.primary }, submitting && { opacity: 0.7 }]} onPress={onSubmit} disabled={submitting}>
        <Text style={[styles.submitText, { color: colors.onPrimary }]}>{submitting ? 'Wird gesendet…' : 'Veranstaltung einreichen'}</Text>
      </Pressable>

      <Text style={[styles.hint, { color: colors.textSecondary }]}>Mit dem Absenden bestätigst du die Richtigkeit der Angaben. Wir können dich zur Verifizierung kontaktieren.</Text>
    </ScrollView>
  );
}

function Field({ label, children, required = false, colors }: { label: string; children: React.ReactNode; required?: boolean; colors: ColorTokens }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>
        {label} {required ? <Text style={{ color: colors.error }}>*</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontFamily: 'Inter-SemiBold' },
  subtitle: { marginBottom: 8 },
  label: { fontFamily: 'Inter-SemiBold' },
  input: { borderRadius: 10, borderWidth: 1, padding: 10 },
  submitBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitText: { fontFamily: 'Inter-SemiBold' },
  hint: { marginTop: 12 }
});
