// Org Mini-Apps: the mini apps whose manifest names this org. An owner or admin confirms,
// rejects or later removes the binding; only a confirmed app appears on the org's page and
// under "Meine Vereine". The node enforces the role too (POST /api/mini-apps/org-binding).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import {
  bindingActions,
  decideOrgBinding,
  listOrgBindings,
  type OrgBinding,
  type OrgBindingDecision,
  type OrgBindingItem,
} from '@/lib/miniapp-org-binding';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const STATUS_LABEL: Record<OrgBinding, string> = {
  none: '',
  requested: 'Wartet auf Bestätigung',
  confirmed: 'Bestätigt',
  rejected: 'Abgelehnt',
};

const ACTION_LABEL: Record<OrgBindingDecision, string> = {
  confirm: 'Bestätigen',
  reject: 'Ablehnen',
  remove: 'Trennen',
};

export default function OrgMiniAppsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount, roleInActiveAccount } = useAccount();
  const signer = useActiveAccount();

  const isOrg = activeAccount?.account_type === 'organisation';
  const canManage = roleInActiveAccount === 'owner' || roleInActiveAccount === 'admin';
  const orgId = activeAccount?.id ?? null;

  const [items, setItems] = useState<OrgBindingItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeAccount || !isOrg) router.replace('/profile');
  }, [activeAccount, isOrg, router]);

  const wallet = signer?.address?.toLowerCase() ?? null;
  useEffect(() => {
    if (!isOrg || !canManage || !signer || !orgId) return;
    let cancelled = false;
    void listOrgBindings(signer, orgId).then((list) => {
      if (cancelled) return;
      if (list) setItems(list);
      setFailed(!list);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per wallet, not per signer object
  }, [isOrg, canManage, wallet, orgId]);

  const decide = useCallback(
    async (item: OrgBindingItem, decision: OrgBindingDecision) => {
      if (!signer || busyId) return;
      setBusyId(item.id);
      try {
        const binding = await decideOrgBinding(signer, item.id, decision);
        if (binding) {
          setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? { ...i, binding } : i)) : prev));
        } else {
          setFailed(true);
        }
      } finally {
        setBusyId(null);
      }
    },
    [signer, busyId],
  );

  if (!activeAccount || !isOrg) return null;

  let body: React.ReactNode;
  if (!canManage) {
    body = (
      <Text style={[styles.note, { color: colors.textSecondary }]}>
        {'Mini-Apps verwalten nur Inhaber und Admins der Organisation.'}
      </Text>
    );
  } else if (items === null && !failed) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else {
    body = (
      <>
        {failed ? (
          <Text style={[styles.note, { color: colors.error }]}>
            {'Das hat nicht geklappt. Bitte versuche es noch einmal.'}
          </Text>
        ) : null}
        {items && items.length === 0 ? (
          <Text style={[styles.note, { color: colors.textSecondary }]}>
            {'Noch keine Mini-App hat euch als Verein angegeben.'}
          </Text>
        ) : null}
        {(items ?? []).map((item) => (
          <View key={item.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              {item.iconUrl ? (
                <Image source={{ uri: item.iconUrl }} style={styles.icon} contentFit="cover" />
              ) : (
                <View style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]} />
              )}
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.status, { color: colors.textSecondary }]}>{STATUS_LABEL[item.binding]}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              {bindingActions(item.binding).map((a) => {
                const primary = a === 'confirm';
                return (
                  <Pressable
                    key={a}
                    onPress={() => void decide(item, a)}
                    disabled={busyId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}: ${ACTION_LABEL[a]}`}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      primary
                        ? { backgroundColor: colors.primary }
                        : { borderWidth: 1, borderColor: colors.border },
                      (pressed || busyId === item.id) && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: primary ? colors.onPrimary : colors.textPrimary }]}>
                      {ACTION_LABEL[a]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mini-Apps</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          {'Mini-Apps, die sagen, dass sie zu euch gehören. Erst nach eurer Bestätigung erscheinen sie auf eurer Seite.'}
        </Text>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: 'MonaSansSemiCondensed-SemiBold' },
  headerSpacer: { width: 32 },
  content: { padding: 16, gap: 12 },
  intro: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  note: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  center: { paddingVertical: 32, alignItems: 'center' },
  row: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 10 },
  rowText: { flex: 1 },
  name: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  status: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { height: 38, paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionText: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
});
