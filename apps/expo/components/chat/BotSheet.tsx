import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BotAvatarSpec, ChatBot } from '@/lib/chat/types';
import { BotAvatar, BOT_COLOR_LIST, BOT_SHAPES } from './BotAvatar';
import { BlackPillButton } from './BlackPillButton';
import { GlassCircleButton } from './GlassCircleButton';
import { RoutinesSection } from './RoutinesSection';
import { PermissionsSection } from './PermissionsSection';
import { chatFont, useChatTokens } from './tokens';

export type BotSheetPatch = {
  name: string;
  instructions: string;
  avatar: BotAvatarSpec;
};

export type BotSheetProps = {
  /** Render at the screen root; mount it conditionally so the form starts fresh each time. */
  visible: boolean;
  onClose: () => void;
  /** Bots of the thread; a group shows an avatar switcher on top. */
  bots: ChatBot[];
  /** Saves an own (non-preset) bot. Rejects with a German message on failure. */
  onSave?: (botId: string, patch: BotSheetPatch) => Promise<void>;
  /** When set, the sheet lists this thread's routines (toggle + delete). */
  threadId?: string;
};

/** Bot sheet (tap on the chat header pill): big avatar, name, description; own bots are editable. */
export function BotSheet({ visible, onClose, bots, onSave, threadId }: BotSheetProps) {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => ['80%'], []);
  const [selectedId, setSelectedId] = useState<string | null>(bots[0]?.id ?? null);
  const bot = bots.find((b) => b.id === selectedId) ?? bots[0] ?? null;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [avatar, setAvatar] = useState<BotAvatarSpec | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fills the form from `b` and toggles edit mode. */
  const resetForm = (b: ChatBot, edit: boolean) => {
    setEditing(edit);
    setName(b.name);
    setInstructions(b.instructions ?? '');
    setAvatar(b.avatar);
    setError(null);
  };

  const backdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.25} pressBehavior="close" />
    ),
    [],
  );

  if (!visible || !bot) return null;

  const canEdit = !bot.isPreset && !!onSave;
  const shownAvatar = editing && avatar ? avatar : bot.avatar;

  const save = async () => {
    if (!onSave || !avatar) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Bitte gib deinem Bot einen Namen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(bot.id, { name: trimmed, instructions: instructions.trim(), avatar });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={onClose}
      detached
      bottomInset={Math.max(8, insets.bottom - 18)}
      style={styles.sheet}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: t.sheetBackground, borderRadius: 40 }}
      handleIndicatorStyle={[styles.handle, { backgroundColor: t.textTertiary }]}
    >
      <View style={styles.header}>
        <GlassCircleButton accessibilityLabel="Schließen" tone="grey" size={40} onPress={onClose}>
          <Feather name="x" size={21} color={t.icon} />
        </GlassCircleButton>
        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              resetForm(bot, !editing);
            }}
          >
            <Text style={[styles.headerAction, { color: t.textPrimary }]}>{editing ? 'Abbrechen' : 'Bearbeiten'}</Text>
          </Pressable>
        ) : null}
      </View>

      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {bots.length > 1 ? (
          <View style={styles.switcher}>
            {bots.map((b) => (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                accessibilityLabel={b.name}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedId(b.id);
                  resetForm(b, false);
                }}
                style={[styles.switchItem, b.id === bot.id ? { borderColor: t.textPrimary } : { borderColor: 'transparent' }]}
              >
                <BotAvatar spec={b.avatar} size={34} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.hero}>
          <BotAvatar spec={shownAvatar} size={96} />
        </View>

        {editing ? (
          <>
            <BottomSheetTextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={t.placeholder}
              maxLength={40}
              style={[styles.nameInput, { color: t.textPrimary }]}
              accessibilityLabel="Name des Bots"
            />

            <Text style={[styles.label, { color: t.textSecondary }]}>Form</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
              {BOT_SHAPES.map((shape) => {
                const active = avatar?.shape === shape;
                return (
                  <Pressable
                    key={shape}
                    accessibilityRole="button"
                    accessibilityLabel={`Form ${shape}`}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setAvatar((a) => (a ? { ...a, shape } : a));
                    }}
                    style={[
                      styles.shapeItem,
                      { backgroundColor: active ? t.chipBackground : 'transparent', borderColor: active ? t.textPrimary : 'transparent' },
                    ]}
                  >
                    <BotAvatar spec={{ shape, color: avatar?.color ?? bot.avatar.color, eyes: avatar?.eyes ?? bot.avatar.eyes }} size={38} />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.label, { color: t.textSecondary }]}>Farbe</Text>
            <View style={styles.swatches}>
              {BOT_COLOR_LIST.map((color) => {
                const active = avatar?.color === color;
                return (
                  <Pressable
                    key={color}
                    accessibilityRole="button"
                    accessibilityLabel={`Farbe ${color}`}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setAvatar((a) => (a ? { ...a, color } : a));
                    }}
                    style={[styles.swatchRing, { borderColor: active ? t.textPrimary : 'transparent' }]}
                  >
                    <View style={[styles.swatch, { backgroundColor: color }]} />
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: t.textSecondary }]}>Anweisungen</Text>
            <BottomSheetTextInput
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Was soll dein Bot tun? Wie soll er antworten?"
              placeholderTextColor={t.placeholder}
              multiline
              maxLength={4000}
              style={[styles.instructions, { color: t.textPrimary, backgroundColor: t.groupedBackground }]}
              accessibilityLabel="Anweisungen für den Bot"
            />

            {error ? <Text style={[styles.error, { color: t.recordingRed }]}>{error}</Text> : null}

            <BlackPillButton
              label="Speichern"
              onPress={save}
              loading={saving}
              variant={name.trim() ? 'primary' : 'disabled'}
              style={styles.saveBtn}
            />
          </>
        ) : (
          <>
            <Text style={[styles.name, { color: t.textPrimary }]}>{bot.name}</Text>
            {bot.description ? (
              <Text style={[styles.description, { color: t.textSecondary }]}>{bot.description}</Text>
            ) : null}
            {bot.instructions && !bot.isPreset ? (
              <View style={[styles.instructionsBox, { backgroundColor: t.groupedBackground }]}>
                <Text style={[styles.label, styles.labelInBox, { color: t.textSecondary }]}>Anweisungen</Text>
                <Text style={[styles.instructionsText, { color: t.textPrimary }]}>{bot.instructions}</Text>
              </View>
            ) : null}
            {bot.isPreset ? (
              <Text style={[styles.footnote, { color: t.textTertiary }]}>Vorlage von Mecky · nicht bearbeitbar</Text>
            ) : null}
            {threadId ? <RoutinesSection threadId={threadId} botId={bots.length > 1 ? bot.id : null} /> : null}
            <PermissionsSection key={bot.id} botId={bot.id} />
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 8 },
  handle: { width: 36, height: 5 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  headerAction: { fontFamily: chatFont.medium, fontSize: 17 },
  content: { paddingHorizontal: 22 },
  switcher: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  switchItem: { padding: 3, borderRadius: 24, borderWidth: 2 },
  hero: { alignItems: 'center', marginTop: 18, marginBottom: 16 },
  name: { fontFamily: chatFont.semiBold, fontSize: 24, textAlign: 'center', letterSpacing: -0.3 },
  description: { fontFamily: chatFont.regular, fontSize: 17, lineHeight: 23, textAlign: 'center', marginTop: 8 },
  instructionsBox: { borderRadius: 20, padding: 16, marginTop: 22 },
  instructionsText: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 22 },
  footnote: { fontFamily: chatFont.regular, fontSize: 13, textAlign: 'center', marginTop: 22 },
  nameInput: {
    fontFamily: chatFont.semiBold,
    fontSize: 24,
    textAlign: 'center',
    paddingVertical: 6,
  },
  label: { fontFamily: chatFont.medium, fontSize: 14, marginTop: 20, marginBottom: 10 },
  labelInBox: { marginTop: 0, marginBottom: 6 },
  pickerRow: { gap: 6, paddingRight: 8 },
  shapeItem: { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatchRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  instructions: {
    fontFamily: chatFont.regular,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 120,
    borderRadius: 20,
    padding: 16,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  error: { fontFamily: chatFont.regular, fontSize: 14, marginTop: 12, textAlign: 'center' },
  saveBtn: { marginTop: 22 },
});

export default BotSheet;
