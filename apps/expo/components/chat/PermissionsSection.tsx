import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useChatActions } from '@/context/ChatContext';
import type { GrantableTool } from '@/lib/chat/api';
import { chatFont, useChatTokens } from './tokens';

/**
 * Gated tools that can be always-allowed (risk public/external; money is never grantable).
 * Used when the grants endpoint does not send its own `available` list.
 */
export const DEFAULT_GRANTABLE_TOOLS: GrantableTool[] = [
  { tool: 'create_feed_post', label: 'Beiträge im Röbel-Feed veröffentlichen', risk: 'public' },
  { tool: 'comment_on_post', label: 'Beiträge kommentieren', risk: 'public' },
  { tool: 'submit_event', label: 'Veranstaltungen einreichen', risk: 'public' },
  { tool: 'create_listing', label: 'Anzeigen im Marktplatz erstellen', risk: 'public' },
  { tool: 'send_direct_message', label: 'Direktnachrichten senden', risk: 'public' },
  { tool: 'create_org_event', label: 'Veranstaltungen deiner Organisation anlegen', risk: 'public' },
  { tool: 'send_email', label: 'E-Mails senden', risk: 'external' },
];

export type PermissionsSectionProps = { botId: string };

/** "Berechtigungen" in the bot sheet: which gated tools this bot may run without asking. */
export function PermissionsSection({ botId }: PermissionsSectionProps) {
  const t = useChatTokens();
  const { fetchBotGrants, setBotGrants } = useChatActions();
  const [granted, setGranted] = useState<string[] | null>(null);
  const [available, setAvailable] = useState<GrantableTool[]>(DEFAULT_GRANTABLE_TOOLS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchBotGrants(botId);
      setGranted(res.tools);
      if (res.available?.length) setAvailable(res.available);
      setError(null);
    } catch (err) {
      setGranted([]);
      setError(err instanceof Error && err.message ? err.message : 'Berechtigungen konnten nicht geladen werden.');
    }
  }, [fetchBotGrants, botId]);

  useEffect(() => {
    setGranted(null);
    load();
  }, [load]);

  const toggle = async (tool: string, on: boolean) => {
    if (!granted) return;
    Haptics.selectionAsync().catch(() => {});
    const prev = granted;
    const next = on ? [...prev.filter((x) => x !== tool), tool] : prev.filter((x) => x !== tool);
    setGranted(next);
    setBusy(true);
    try {
      setGranted(await setBotGrants(botId, next));
      setError(null);
    } catch (err) {
      setGranted(prev);
      setError(err instanceof Error && err.message ? err.message : 'Ändern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: t.textSecondary }]}>Berechtigungen</Text>
      <Text style={[styles.hint, { color: t.textTertiary }]}>
        Öffentliche Aktionen und externe Dienste fragen vorher nach. Hier erlaubst du sie dauerhaft. Röbel Münzen
        bestätigst du immer selbst.
      </Text>
      {granted === null ? (
        <ActivityIndicator color={t.textTertiary} style={styles.loading} />
      ) : (
        <View style={[styles.box, { backgroundColor: t.groupedBackground }]}>
          {available.map((g, i) => {
            const on = granted.includes(g.tool);
            return (
              <View
                key={g.tool}
                style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator } : null]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.title, { color: t.textPrimary }]}>{g.label}</Text>
                  <Text style={[styles.sub, { color: t.textSecondary }]}>
                    {on ? 'Immer erlaubt' : 'Fragt nach'}
                    {g.risk === 'external' ? ' · externer Dienst' : ''}
                  </Text>
                </View>
                <Switch
                  value={on}
                  disabled={busy}
                  onValueChange={(v) => toggle(g.tool, v)}
                  trackColor={{ true: t.online, false: t.separator }}
                  accessibilityLabel={`${g.label} immer erlauben`}
                />
              </View>
            );
          })}
        </View>
      )}
      {error ? <Text style={[styles.error, { color: t.recordingRed }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 22 },
  label: { fontFamily: chatFont.medium, fontSize: 14, marginBottom: 4 },
  hint: { fontFamily: chatFont.regular, fontSize: 13, lineHeight: 18, marginBottom: 10 },
  loading: { marginVertical: 12 },
  box: { borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  rowText: { flex: 1, minWidth: 0 },
  title: { fontFamily: chatFont.medium, fontSize: 16 },
  sub: { fontFamily: chatFont.regular, fontSize: 14, marginTop: 2 },
  error: { fontFamily: chatFont.regular, fontSize: 14, marginTop: 10 },
});

export default PermissionsSection;
