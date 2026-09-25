import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import type { BotAvatarSpec, ChatMessage } from '@/lib/chat/types';
import {
  BOT_COLORS,
  BOT_EYES,
  BOT_SHAPES,
  BlackPillButton,
  BotAvatar,
  BotAvatarStack,
  ChatListRow,
  Composer,
  DayStamp,
  FileSheet,
  FloatingMascots,
  GlassCircleButton,
  GlassPillHeader,
  MessageActionSheet,
  MessageParts,
  NewDivider,
  PagerDots,
  ScrollToBottomButton,
  TypingIndicator,
  UltraPaywall,
  chatFont,
  useChatTokens,
  type ComposerImage,
  type MentionCandidate,
} from '@/components/chat';

// Dev-only visual story of the chat component kit — compare against the
// 19 reference screenshots. Not linked from anywhere.

const MECKY: BotAvatarSpec = { shape: 'circle', color: BOT_COLORS.black, eyes: 'dots' };
const PLANER: BotAvatarSpec = { shape: 'triangle', color: BOT_COLORS.green, eyes: 'dashes' };
const RECHERCHE: BotAvatarSpec = { shape: 'pill', color: BOT_COLORS.amber, eyes: 'dots' };
const STABSCHEF: BotAvatarSpec = { shape: 'drop', color: BOT_COLORS.orange, eyes: 'dashes' };
const POSTFACH: BotAvatarSpec = { shape: 'squircle', color: BOT_COLORS.grey, eyes: 'dots' };

const MENTIONS: MentionCandidate[] = [
  { id: 'r', name: 'Recherche', avatar: RECHERCHE },
  { id: 'd', name: 'Design', avatar: MECKY },
  { id: 'p', name: 'Postfach', avatar: POSTFACH },
  { id: 's', name: 'Stabschef', avatar: STABSCHEF },
];

const now = new Date().toISOString();
const msg = (id: string, role: ChatMessage['role'], parts: ChatMessage['parts'], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  threadId: 't1',
  role,
  botId: role === 'bot' ? 'mecky' : null,
  parts,
  replyTo: null,
  reactions: {},
  createdAt: now,
  ...extra,
});

const MESSAGES: ChatMessage[] = [
  msg('1', 'bot', [{ type: 'text', text: 'Hey Max. Neuer Start, ich bin da.' }]),
  msg('2', 'bot', [
    { type: 'text', text: 'Wobei soll ich dich im Alltag vor allem unterstützen? Arbeit, Organisatorisches, Recherche, etwas anderes?' },
  ]),
  msg('3', 'bot', [
    {
      type: 'text',
      text: 'Sonntags-Reihenfolge: Reiskocher zuerst an (4 Tassen), Hähnchen bei 200 °C in den Ofen, Brokkoli und Möhren aufs zweite Blech. Mengen, Zeiten und die Einkaufsliste stehen in der Datei.',
    },
    { type: 'file', fileId: 'f1', name: 'wochen-essensplan.md', ext: 'md', size: 3174 },
    {
      type: 'options',
      question: 'Soll ich noch etwas anpassen, oder passt die Woche so?',
      options: [
        { key: 'a', label: 'Passt so' },
        { key: 'b', label: 'Vegetarisch' },
        { key: 'c', label: 'Ohne Fisch' },
        { key: 'd', label: 'Für zwei kochen' },
        { key: 'e', label: 'Kürzer am Sonntag' },
      ],
    },
  ]),
  msg('4', 'bot', [
    {
      type: 'options',
      question: 'Soll ich noch etwas anpassen, oder passt die Woche so?',
      options: [
        { key: 'a', label: 'Passt so' },
        { key: 'b', label: 'Vegetarisch' },
      ],
      selected: 'a',
    },
  ]),
  msg('5', 'bot', [
    {
      type: 'options',
      question: 'Soll ich dich sonntags ans Kochen erinnern?',
      options: [
        { key: 'a', label: 'Sonntags erinnern' },
        { key: 'b', label: 'Nur dieses Mal' },
        { key: 'c', label: 'Erst mal was anderes' },
      ],
      dismissed: true,
    },
  ]),
  msg('6', 'user', [{ type: 'text', text: 'Kannst du den Brokkoli ersetzen?' }], {
    replyTo: { id: '3', preview: 'Sonntags-Reihenfolge: Reiskocher zuerst an (4 Tassen), Hähnchen …' },
  }),
  msg('7', 'bot', [{ type: 'text', text: 'Brokkoli ist raus. Stattdessen grüne Bohnen, gleiches Blech.' }], {
    replyTo: { id: '3', preview: 'Sonntags-Reihenfolge: Reiskocher zuerst an (4 Tassen), Hähnchen …' },
    reactions: { '👍': 1 },
  }),
  msg('8', 'user', [{ type: 'text', text: 'Plan ein Treffen morgen um 10 Uhr.' }]),
  msg('9', 'bot', [
    { type: 'text', text: 'Google Kalender ist verknüpft, braucht aber eine Anmeldung. Danach blocke ich Freitag 10:00–10:30.' },
    {
      type: 'integration',
      provider: 'google_calendar',
      title: 'Google Kalender',
      description: 'Verbinde Google Kalender über den MCP-Server von Google — Kalender auflisten, suchen, Termine anlegen.',
      status: 'pending',
    },
  ]),
  msg('10', 'bot', [
    {
      type: 'sources',
      items: [
        { title: 'Stadt Röbel/Müritz', url: 'https://www.roebel.de' },
        { title: 'NDR-Bericht', url: 'https://www.ndr.de' },
        { title: 'Amt Röbel-Müritz', url: 'https://www.amt-roebel-mueritz.de' },
      ],
    },
  ]),
  msg('11', 'user', [
    { type: 'image', url: 'https://images.unsplash.com/photo-1587668178277-295251f900ce?w=600', width: 600, height: 800 },
    { type: 'text', text: 'Rezept dafür?' },
  ]),
];

const FILE_MD = `# Wochen-Essensplan (1 Person)
Sonntag ~75 Min. kochen. Mo–Fr aus Boxen essen. Sa/So Resteverwertung, je 10 Min.

## Menü

| | Frühstück | Mittag | Abend |
|---|---|---|---|
| Mo | Overnight Oats | Hähnchen-Reis-Bowl + Erdnusssoße | Japanisches Curry + Reis |
| Di | Overnight Oats | Hähnchen-Reis-Bowl + Chili-Limette | Knoblauch-Lachs, Bohnen, Reis |
| Mi | Overnight Oats | Curry mit Reis | Hähnchen-Nudelpfanne |
`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useChatTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.textTertiary }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function ChatKitScreen() {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [images, setImages] = useState<ComposerImage[]>([
    { uri: 'https://images.unsplash.com/photo-1587668178277-295251f900ce?w=300' },
  ]);
  const [recording, setRecording] = useState(true);
  const [sheet, setSheet] = useState<null | 'actions' | 'file'>(null);
  const [log, setLog] = useState('');

  if (!__DEV__) {
    return (
      <View style={[styles.flex, { backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: t.textSecondary }}>Nur in der Entwicklungsumgebung verfügbar.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.headerRow}>
          <GlassCircleButton accessibilityLabel="Zurück" onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={t.icon} />
          </GlassCircleButton>
          <GlassPillHeader avatars={[MECKY]} title="Mecky" online onPress={() => setLog('Header-Pille')} />
          <View style={styles.flex} />
          <GlassCircleButton accessibilityLabel="Computer" onPress={() => setLog('Computer')}>
            <Feather name="monitor" size={22} color={t.icon} />
          </GlassCircleButton>
        </View>
        {log ? <Text style={[styles.log, { color: t.textTertiary }]}>Letzte Aktion: {log}</Text> : null}

        <Section title="1 · Willkommen">
          <View style={styles.welcome}>
            <FloatingMascots height={560} />
            <Text style={[styles.welcomeTitle, { color: t.textPrimary }]}>Mecky</Text>
            <Text style={[styles.welcomeSub, { color: t.textSecondary }]}>
              Dein Team aus Agenten, die immer für dich da sind.
            </Text>
          </View>
          <View style={styles.pad30}>
            <BlackPillButton label="Los geht's" onPress={() => setLog("Los geht's")} />
          </View>
        </Section>

        <Section title="2/3 · Onboarding">
          <View style={styles.center}>
            <BotAvatar spec={STABSCHEF} size={124} />
            <Text style={[styles.botName, { color: t.textPrimary }]}>Stabschef</Text>
            <PagerDots count={5} index={page} style={{ marginTop: 24 }} />
          </View>
          <View style={[styles.pad30, { gap: 12, marginTop: 16 }]}>
            <BlackPillButton label="Chat starten" onPress={() => setPage((p) => (p + 1) % 5)} />
            <BlackPillButton label="Erstellen" variant="disabled" onPress={() => {}} />
          </View>
        </Section>

        <Section title="Formen × Augen">
          <View style={styles.grid}>
            {BOT_SHAPES.map((shape, i) => (
              <View key={shape} style={styles.gridRow}>
                {BOT_EYES.map((eyes, j) => (
                  <BotAvatar
                    key={eyes}
                    spec={{ shape, eyes, color: Object.values(BOT_COLORS)[(i + j) % 12] }}
                    size={48}
                    online={j === 0 && i % 3 === 0}
                  />
                ))}
              </View>
            ))}
          </View>
        </Section>

        <Section title="5/6 · Chatliste">
          <View style={styles.listHeader}>
            <View style={[styles.initials, { backgroundColor: t.initialsBg }]}>
              <Text style={[styles.initialsText, { color: t.initialsText }]}>MB</Text>
            </View>
            <View style={styles.flex} />
            <GlassCircleButton accessibilityLabel="Suchen">
              <Feather name="search" size={22} color={t.icon} />
            </GlassCircleButton>
            <GlassCircleButton accessibilityLabel="Neuer Chat">
              <Feather name="plus" size={26} color={t.icon} />
            </GlassCircleButton>
          </View>
          <ChatListRow title="Planer" topic="Essensplanung" time="22:51" preview="Hab's eingetragen: jeden Sonntag 8:41, Menü plus …" avatars={[PLANER]} online onPress={() => {}} />
          <ChatListRow title="Recherche, Design, Stabschef" time="22:46" avatars={[RECHERCHE, MECKY, STABSCHEF]} onPress={() => {}} />
          <ChatListRow title="Recherche" topic="Herausforderungen" time="22:45" preview="Wobei soll ich dich zuerst unterstützen? A…" avatars={[RECHERCHE]} onPress={() => {}} />
          <ChatListRow title="Design" topic="Schlägt UI vor" time="19:13" preview="Ja. Schick mir den Screenshot (oder ein paar, wenn …" avatars={[MECKY]} unread onPress={() => {}} />
          <ChatListRow title="Postfach" time="18:47" preview="An die Stadtverwaltung gesendet. S…" avatars={[POSTFACH]} onPress={() => {}} />
          <ChatListRow title="Stabschef" time="18:39" preview="Nichts zu Bereitschaft, Reisen, Familie oder …" avatars={[STABSCHEF]} online onPress={() => {}} />
          <View style={[styles.row, { paddingHorizontal: 23, marginTop: 8 }]}>
            <BotAvatarStack specs={[RECHERCHE, MECKY]} />
          </View>
        </Section>

        <Section title="4/7/8/13/14/16 · Chat">
          <View style={styles.chat}>
            <DayStamp label="Heute 16:29" />
            {MESSAGES.slice(0, 3).map((m) => (
              <MessageParts
                key={m.id}
                message={m}
                style={styles.msg}
                onLongPress={() => setSheet('actions')}
                onFilePress={() => setSheet('file')}
                onOptionSelect={(_, k) => setLog(`Option ${k}`)}
              />
            ))}
            <NewDivider />
            {MESSAGES.slice(3).map((m) => (
              <MessageParts
                key={m.id}
                message={m}
                style={styles.msg}
                onLongPress={() => setSheet('actions')}
                onFilePress={() => setSheet('file')}
                onIntegrationAuthorize={() => setLog('Autorisieren')}
              />
            ))}
            <TypingIndicator spec={MECKY} style={styles.msg} />
            <View style={styles.scrollBtnRow}>
              <ScrollToBottomButton onPress={() => setLog('Nach unten')} />
            </View>
          </View>
        </Section>

        <Section title="4/9/10 · Composer (Text, @-Erwähnung)">
          <Composer
            botName="Mecky"
            onSend={({ text }) => setLog(`Gesendet: ${text}`)}
            mentionCandidates={MENTIONS}
            onMention={(c) => setLog(`@${c.name}`)}
            onPickImage={() => setLog('Bild anhängen')}
            onTakePhoto={() => setLog('Foto aufnehmen')}
            onPickFile={() => setLog('Datei wählen')}
            onStartRecording={() => setRecording(true)}
          />
        </Section>
        <Section title="14 · Composer (Aufnahme)">
          <Composer
            botName="Mecky"
            onSend={() => {}}
            recording={recording}
            recordingSeconds={10}
            onStopRecording={() => setRecording(false)}
            onStartRecording={() => setRecording(true)}
          />
        </Section>
        <Section title="12 · Composer (Bild)">
          <Composer
            botName="Mecky"
            onSend={() => setImages([])}
            images={images}
            onRemoveImage={(i) => setImages((arr) => arr.filter((_, j) => j !== i))}
            onStartRecording={() => {}}
          />
        </Section>

        <Section title="15/17 · Sheets">
          <View style={[styles.pad30, { gap: 12 }]}>
            <BlackPillButton label="Aktionen öffnen" onPress={() => setSheet('actions')} />
            <BlackPillButton label="Datei öffnen" onPress={() => setSheet('file')} />
          </View>
        </Section>

        <Section title="19 · Ultra">
          <View style={{ backgroundColor: '#C9C9CB', paddingVertical: 20, paddingHorizontal: 9 }}>
            <UltraPaywall
              price="29,99 €/Monat"
              onSubscribe={() => setLog('Bald verfügbar')}
              onRestore={() => setLog('Wiederherstellen')}
              onClose={() => setLog('Schließen')}
            />
          </View>
        </Section>
      </ScrollView>

      <MessageActionSheet
        visible={sheet === 'actions'}
        onClose={() => setSheet(null)}
        onReact={(e) => setLog(`Reaktion ${e}`)}
        onReply={() => setLog('Antworten')}
        onStartThread={() => setLog('Thread starten')}
        onMarkUnread={() => setLog('Ungelesen')}
        onCopy={() => setLog('Kopiert')}
      />
      <FileSheet visible={sheet === 'file'} onClose={() => setSheet(null)} name="wochen-essensplan.md" content={FILE_MD} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8 },
  log: { fontFamily: chatFont.regular, fontSize: 13, textAlign: 'center', marginTop: 8 },
  section: { marginTop: 36 },
  sectionTitle: { fontFamily: chatFont.medium, fontSize: 12, letterSpacing: 1, marginHorizontal: 16, marginBottom: 12, textTransform: 'uppercase' },
  welcome: { height: 560, alignItems: 'center', justifyContent: 'center' },
  welcomeTitle: { fontFamily: chatFont.medium, fontSize: 36, letterSpacing: -0.6 },
  welcomeSub: { fontFamily: chatFont.regular, fontSize: 18, lineHeight: 22, textAlign: 'center', marginTop: 12, paddingHorizontal: 70 },
  pad30: { paddingHorizontal: 30 },
  botName: { fontFamily: chatFont.semiBold, fontSize: 20, marginTop: 40 },
  grid: { gap: 12, paddingHorizontal: 16 },
  gridRow: { flexDirection: 'row', gap: 16 },
  listHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8, marginBottom: 12 },
  initials: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontFamily: chatFont.semiBold, fontSize: 15 },
  chat: { paddingHorizontal: 16 },
  msg: { marginBottom: 8 },
  scrollBtnRow: { alignItems: 'flex-end', marginTop: 8 },
});
