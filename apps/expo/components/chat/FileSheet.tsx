import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { GlassCircleButton } from './GlassCircleButton';
import { chatFont, useChatTokens, type ChatTokens } from './tokens';

export type FileSheetProps = {
  /** Mount/unmount controlled by the parent; render at the screen root. */
  visible: boolean;
  onClose: () => void;
  /** e.g. "wochen-essensplan.md" */
  name: string;
  /** Markdown content; null while loading. */
  content: string | null;
  loading?: boolean;
  error?: string | null;
};

function mdStyles(t: ChatTokens) {
  return StyleSheet.create({
    body: { color: t.textPrimary, fontFamily: chatFont.regular, fontSize: 17, lineHeight: 21 },
    heading1: { fontFamily: chatFont.semiBold, fontSize: 22, lineHeight: 28, color: t.textPrimary, marginTop: 4, marginBottom: 8 },
    heading2: { fontFamily: chatFont.semiBold, fontSize: 20, lineHeight: 26, color: t.textPrimary, marginTop: 12, marginBottom: 6 },
    heading3: { fontFamily: chatFont.semiBold, fontSize: 18, lineHeight: 24, color: t.textPrimary, marginTop: 10, marginBottom: 4 },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { fontFamily: chatFont.semiBold },
    link: { color: t.link, textDecorationLine: 'underline' },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    code_inline: { backgroundColor: t.groupedBackground, borderRadius: 4, paddingHorizontal: 4 },
    fence: { backgroundColor: t.groupedBackground, borderRadius: 12, padding: 12, borderWidth: 0 },
    table: { borderWidth: 0, marginTop: 6, marginBottom: 12 },
    thead: {},
    tbody: {},
    th: { padding: 8, paddingVertical: 10 },
    tr: { borderBottomWidth: 1, borderColor: t.separator, flexDirection: 'row' },
    td: { padding: 8, paddingVertical: 10 },
    text: {},
    hr: { backgroundColor: t.separator, height: 1, marginVertical: 12 },
  });
}

/** Markdown file viewer sheet with ✕, filename and share (ref 17). */
export function FileSheet({ visible, onClose, name, content, loading, error }: FileSheetProps) {
  const t = useChatTokens();
  const insets = useSafeAreaInsets();
  const styles_ = useMemo(() => mdStyles(t), [t]);
  const snapPoints = useMemo(() => ['88%'], []);

  const backdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.25} pressBehavior="close" />
    ),
    [],
  );

  // Table cells: header black/semibold, body grey (ref 17). The library applies
  // `th`/`td` to the cell View, so text colour goes through `rules` instead.
  const rules = useMemo(
    () => ({
      th: (node: { key: string }, children: React.ReactNode) => (
        <View key={node.key} style={[styles_.th, styles.cell]}>
          <Text style={[styles.th, { color: t.textPrimary }]}>{children}</Text>
        </View>
      ),
      td: (node: { key: string }, children: React.ReactNode) => (
        <View key={node.key} style={[styles_.td, styles.cell]}>
          <Text style={[styles.td, { color: t.textSecondary }]}>{children}</Text>
        </View>
      ),
    }),
    [styles_, t],
  );

  if (!visible) return null;

  const share = () => {
    if (!content) return;
    Share.share({ title: name, message: content }).catch(() => {});
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
      backdropComponent={backdrop}
      backgroundStyle={{ backgroundColor: t.sheetBackground, borderRadius: 40 }}
      handleIndicatorStyle={[styles.handle, { backgroundColor: t.textTertiary }]}
    >
      <View style={styles.header}>
        <GlassCircleButton tone="grey" size={42} accessibilityLabel="Schließen" onPress={onClose}>
          <Feather name="x" size={24} color={t.icon} />
        </GlassCircleButton>
        <Text numberOfLines={1} style={[styles.title, { color: t.textPrimary }]}>
          {name}
        </Text>
        <GlassCircleButton tone="grey" size={42} accessibilityLabel="Teilen" onPress={content ? share : undefined}>
          <Ionicons name="share-outline" size={22} color={t.icon} />
        </GlassCircleButton>
      </View>
      <BottomSheetScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading || content === null ? (
          error ? (
            <Text style={[styles.error, { color: t.textSecondary }]}>{error}</Text>
          ) : (
            <ActivityIndicator style={styles.loader} color={t.textSecondary} />
          )
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Markdown style={styles_} rules={rules as any}>
            {content}
          </Markdown>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: 9 },
  handle: { width: 36, height: 5, opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 18, gap: 16 },
  title: { flex: 1, fontFamily: chatFont.medium, fontSize: 17, letterSpacing: -0.2 },
  body: { paddingHorizontal: 15, paddingBottom: 40 },
  cell: { flex: 1 },
  th: { fontFamily: chatFont.semiBold, fontSize: 16, lineHeight: 20 },
  td: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 20 },
  loader: { marginTop: 40 },
  error: { fontFamily: chatFont.regular, fontSize: 16, textAlign: 'center', marginTop: 40 },
});

export default FileSheet;
