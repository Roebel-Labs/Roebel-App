import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sendTransaction, waitForReceipt } from 'thirdweb';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { gnosis } from '@/constants/gnosis';
import { client } from '@/constants/thirdweb';
import { OPEN_REGISTRY_ZERO } from '@/constants/deliberate';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import DebateComposerSheet from '@/components/forum/DebateComposerSheet';
import DebateStakeSheet from '@/components/forum/DebateStakeSheet';
import { useUser } from '@/context/UserContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { supabase } from '@/lib/supabase';
import {
  prepareJoin,
  readDebate,
  readDebateTree,
  readMyDebateState,
  type DebateSummary,
} from '@/lib/deliberate/chain';
import { fetchDebateContents } from '@/lib/deliberate/content';
import {
  approvalPercent,
  formatPunkte,
  type DebateArgumentNode,
} from '@/lib/deliberate/protocol';

function formatEnd(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function phaseLine(summary: DebateSummary): string {
  switch (summary.phase) {
    case 'editing':
      return `Bearbeitungsphase · Argumente bis ${formatEnd(summary.editingEndTime)}`;
    case 'rating':
      return `Bewertungsphase · Einschätzen bis ${formatEnd(summary.ratingEndTime)}`;
    case 'tallying':
      return 'Bewertung beendet · Auszählung ausstehend';
    case 'finished':
      return summary.approved
        ? 'Meinungsbild: These angenommen'
        : 'Meinungsbild: These abgelehnt';
  }
}

type TreeData = {
  root: DebateArgumentNode;
  byId: Map<number, DebateArgumentNode>;
  contents: Map<string, string>;
  authorNames: Map<string, string>;
};

function flatten(node: DebateArgumentNode, into: Map<number, DebateArgumentNode>): void {
  into.set(node.id, node);
  node.children.forEach((c) => flatten(c, into));
}

export default function DebateScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const debateId = Number(idParam);
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { gnosisAccount, gnosisAddress } = useGnosisWallet();

  const [focusId, setFocusId] = useState(0);
  const [composerFor, setComposerFor] = useState<{ parentId: number; isSupporting: boolean } | null>(null);
  const [stakeFor, setStakeFor] = useState<DebateArgumentNode | null>(null);
  const [joining, setJoining] = useState(false);

  const { data: summary, isPending: summaryPending } = useQuery({
    queryKey: ['debate', debateId],
    queryFn: () => readDebate(debateId),
    enabled: Number.isFinite(debateId),
    staleTime: 30 * 1000,
  });

  const argumentsCount = summary?.argumentsCount ?? 0;
  const finished = summary?.phase === 'finished';

  const { data: tree, isFetching: treeFetching, refetch: refetchTree } = useQuery<TreeData | null>({
    queryKey: ['debate', debateId, 'tree', argumentsCount, finished],
    enabled: !!summary,
    queryFn: async () => {
      const root = await readDebateTree(debateId, argumentsCount, finished);
      const byId = new Map<number, DebateArgumentNode>();
      flatten(root, byId);
      const nodes = [...byId.values()];
      const contents = await fetchDebateContents(nodes.map((n) => n.contentDigest));
      const wallets = [...new Set(nodes.map((n) => n.creator.toLowerCase()))];
      const authorNames = new Map<string, string>();
      const { data: users } = await supabase
        .from('users')
        .select('wallet_address, username')
        .in('wallet_address', wallets);
      const userRows = (users ?? []) as { wallet_address: string; username: string | null }[];
      for (const u of userRows) {
        if (u.username) authorNames.set(u.wallet_address.toLowerCase(), u.username);
      }
      return { root, byId, contents, authorNames };
    },
  });

  const { data: me } = useQuery({
    queryKey: ['debate', debateId, 'me', gnosisAddress],
    queryFn: () => readMyDebateState(debateId, gnosisAddress!),
    enabled: !!summary && !!gnosisAddress,
    staleTime: 30 * 1000,
  });

  const focused = tree?.byId.get(focusId) ?? tree?.root ?? null;
  const breadcrumb = useMemo(() => {
    if (!tree || !focused) return [];
    const path: DebateArgumentNode[] = [];
    let cur: DebateArgumentNode | undefined = focused;
    while (cur && cur.id !== 0) {
      path.unshift(cur);
      cur = cur.parentId != null ? tree.byId.get(cur.parentId) : undefined;
    }
    return path;
  }, [tree, focused]);

  const textOf = (node: DebateArgumentNode): string =>
    tree?.contents.get(node.contentDigest) ?? 'Inhalt wird geladen …';
  const authorOf = (node: DebateArgumentNode): string =>
    tree?.authorNames.get(node.creator.toLowerCase()) ?? 'Bürger:in';

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['debate', debateId] });
  };

  const handleJoin = async () => {
    if (!gnosisAccount || joining) return;
    setJoining(true);
    try {
      const { transactionHash } = await sendTransaction({
        transaction: prepareJoin(debateId),
        account: gnosisAccount,
      });
      await waitForReceipt({ client, chain: gnosis, transactionHash });
      invalidate();
    } catch (e) {
      const gated = summary?.identityRegistry && summary.identityRegistry !== OPEN_REGISTRY_ZERO;
      Alert.alert(
        'Beitritt fehlgeschlagen',
        gated
          ? 'Diese Debatte ist Mitgliedern der Röbel Münzen Gemeinschaft vorbehalten.'
          : 'Bitte versuche es später erneut.',
      );
    } finally {
      setJoining(false);
    }
  };

  const renderArgumentCard = (node: DebateArgumentNode, interactive: boolean) => {
    const approval = approvalPercent(node.pro, node.con);
    return (
      <Pressable
        key={node.id}
        onPress={interactive ? () => setFocusId(node.id) : undefined}
        style={({ pressed }) => [
          styles.card,
          { borderColor: colors.border, backgroundColor: colors.surface },
          pressed && interactive && { backgroundColor: colors.pressedOverlay },
        ]}
      >
        <Text style={[styles.cardText, { color: colors.textPrimary }]}>{textOf(node)}</Text>
        <View style={styles.approvalTrack}>
          <View
            style={[
              styles.approvalFill,
              { width: `${approval}%`, backgroundColor: colors.primary },
            ]}
          />
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
            {approval} % · Einsatz {formatPunkte(node.votes)} P. · {authorOf(node)}
          </Text>
          {node.children.length > 0 ? (
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
              {node.children.length} Gegen-/Unterargumente
            </Text>
          ) : null}
        </View>
        {finished && node.rating != null && node.id !== 0 ? (
          <Text style={[styles.cardMetaText, { color: node.rating >= 0 ? colors.primary : colors.error }]}>
            {node.rating >= 0 ? 'Bestätigt' : 'Widerlegt'}
          </Text>
        ) : null}
        {summary?.phase === 'rating' && me?.joined && node.id !== 0 ? (
          <Pressable
            onPress={() => setStakeFor(node)}
            style={[styles.smallButton, { borderColor: colors.primary }]}
          >
            <Text style={[styles.smallButtonText, { color: colors.primary }]}>Einschätzen</Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  const renderColumn = (isSupporting: boolean) => {
    if (!focused) return null;
    const children = focused.children.filter((c) => c.isSupporting === isSupporting);
    return (
      <View style={styles.column}>
        <Text style={[styles.columnTitle, { color: isSupporting ? colors.primary : colors.error }]}>
          {isSupporting ? 'Dafür' : 'Dagegen'}
        </Text>
        {children.map((c) => renderArgumentCard(c, true))}
        {summary?.phase === 'editing' && me?.joined ? (
          <Pressable
            onPress={() => setComposerFor({ parentId: focused.id, isSupporting })}
            style={[styles.addButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.addButtonText, { color: colors.textSecondary }]}>+ Argument</Text>
          </Pressable>
        ) : null}
        {children.length === 0 && !(summary?.phase === 'editing' && me?.joined) ? (
          <Text style={[styles.emptyColumn, { color: colors.textTertiary }]}>Noch keine Argumente</Text>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Debatte</Text>
        <View style={{ width: 24 }} />
      </View>

      {summaryPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !summary ? (
        <View style={styles.loading}>
          <Text style={[styles.notFound, { color: colors.textSecondary }]}>Debatte nicht gefunden.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={treeFetching} onRefresh={() => void refetchTree()} tintColor={colors.primary} />
          }
        >
          <View
            style={[
              styles.phaseBanner,
              {
                backgroundColor:
                  summary.phase === 'finished'
                    ? summary.approved
                      ? colors.primaryLight
                      : colors.surfaceSecondary
                    : colors.primaryLight,
              },
            ]}
          >
            <Text style={[styles.phaseText, { color: colors.primary }]}>{phaseLine(summary)}</Text>
            <Text style={[styles.phaseMeta, { color: colors.textSecondary }]}>
              {summary.participantsCount} Teilnehmende · {summary.argumentsCount} Argumente
            </Text>
          </View>

          {tree && focused ? (
            <>
              {breadcrumb.length > 0 ? (
                <View style={styles.breadcrumb}>
                  <Pressable onPress={() => setFocusId(0)} hitSlop={6}>
                    <Text style={[styles.crumb, { color: colors.primary }]}>These</Text>
                  </Pressable>
                  {breadcrumb.map((node) => (
                    <React.Fragment key={node.id}>
                      <Text style={[styles.crumbSep, { color: colors.textTertiary }]}>›</Text>
                      <Pressable onPress={() => setFocusId(node.id)} hitSlop={6}>
                        <Text
                          style={[
                            styles.crumb,
                            { color: node.id === focused.id ? colors.textPrimary : colors.primary },
                          ]}
                          numberOfLines={1}
                        >
                          {textOf(node).slice(0, 24)}…
                        </Text>
                      </Pressable>
                    </React.Fragment>
                  ))}
                </View>
              ) : null}

              <View style={[styles.thesisCard, { borderColor: colors.border }]}>
                <Text style={[styles.thesisLabel, { color: colors.primary }]}>
                  {focused.id === 0 ? 'THESE' : focused.isSupporting ? 'ARGUMENT DAFÜR' : 'ARGUMENT DAGEGEN'}
                </Text>
                <Text style={[styles.thesisText, { color: colors.textPrimary }]}>{textOf(focused)}</Text>
                {focused.id !== 0 ? (
                  <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
                    {approvalPercent(focused.pro, focused.con)} % Zustimmung · Einsatz {formatPunkte(focused.votes)} P. · {authorOf(focused)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.columns}>
                {renderColumn(true)}
                {renderColumn(false)}
              </View>
            </>
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          )}

          {me?.joined ? (
            <Text style={[styles.balance, { color: colors.textSecondary }]}>
              Deine Punkte: {formatPunkte(me.tokens)}
            </Text>
          ) : summary.phase === 'editing' || summary.phase === 'rating' ? (
            <Pressable
              onPress={() => void handleJoin()}
              disabled={joining || !gnosisAccount}
              style={[styles.joinButton, { backgroundColor: colors.primary, opacity: joining ? 0.6 : 1 }]}
            >
              <Text style={[styles.joinText, { color: colors.primaryForeground }]}>
                {joining ? 'Beitritt läuft …' : 'Debatte beitreten (100 Punkte)'}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {user?.wallet_address && composerFor ? (
        <DebateComposerSheet
          visible
          onClose={() => setComposerFor(null)}
          debateId={debateId}
          parentArgumentId={composerFor.parentId}
          isSupporting={composerFor.isSupporting}
          maxDeposit={me?.tokens ?? 0}
          onCreated={() => {
            setComposerFor(null);
            invalidate();
          }}
        />
      ) : null}
      {stakeFor ? (
        <DebateStakeSheet
          visible
          onClose={() => setStakeFor(null)}
          debateId={debateId}
          argument={stakeFor}
          argumentText={textOf(stakeFor)}
          maxAmount={me?.tokens ?? 0}
          onStaked={() => {
            setStakeFor(null);
            invalidate();
          }}
        />
      ) : null}
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
  },
  headerTitle: { fontSize: 16, fontFamily: fontFamily.semiBold },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 14, fontFamily: fontFamily.regular },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
  phaseBanner: { borderRadius: 12, padding: 12, gap: 4 },
  phaseText: { fontSize: 13, fontFamily: fontFamily.semiBold },
  phaseMeta: { fontSize: 12, fontFamily: fontFamily.regular },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  crumb: { fontSize: 12, fontFamily: fontFamily.medium, maxWidth: 140 },
  crumbSep: { fontSize: 12 },
  thesisCard: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  thesisLabel: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.6 },
  thesisText: { fontSize: 16, fontFamily: fontFamily.heading, lineHeight: 22 },
  columns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, gap: 10 },
  columnTitle: { fontSize: 12, fontFamily: fontFamily.semiBold, letterSpacing: 0.4 },
  card: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  cardText: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
  approvalTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(107,114,128,0.25)', overflow: 'hidden' },
  approvalFill: { height: 4, borderRadius: 2 },
  cardMeta: { gap: 2 },
  cardMetaText: { fontSize: 11, fontFamily: fontFamily.regular },
  smallButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallButtonText: { fontSize: 12, fontFamily: fontFamily.medium },
  addButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: { fontSize: 13, fontFamily: fontFamily.medium },
  emptyColumn: { fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'center', paddingVertical: 8 },
  balance: { fontSize: 13, fontFamily: fontFamily.medium, textAlign: 'center', marginTop: 6 },
  joinButton: { borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  joinText: { fontSize: 15, fontFamily: fontFamily.semiBold },
});
