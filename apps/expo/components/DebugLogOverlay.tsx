/**
 * On-device debug log viewer. Renders a draggable floating 🐞 bubble that opens
 * a full-screen modal listing captured console output (see lib/debug-logs.ts),
 * with copy / share / clear / filter. Gated to dev + non-production EAS channels
 * so it never appears for real users.
 */
import React, { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  View,
  Text,
  Modal,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  Animated,
  PanResponder,
  Share,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { useTheme } from "@/context/ThemeContext";
import {
  subscribe,
  getSnapshot,
  clearLogs,
  formatAll,
  type LogEntry,
  type LogLevel,
} from "@/lib/debug-logs";

const LEVEL_COLOR: Record<LogLevel, string> = {
  log: "#9ca3af",
  info: "#60a5fa",
  warn: "#f59e0b",
  error: "#ef4444",
};

/** Show on dev and any non-production channel (preview / internal). */
function debugEnabled(): boolean {
  if (__DEV__) return true;
  if (Constants.expoConfig?.extra?.DEBUG_LOGS === true) return true;
  const channel = (Updates as { channel?: string | null }).channel;
  return !!channel && channel !== "production";
}

type Filter = "all" | "warn" | "error";

export default function DebugLogOverlay() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const entries = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Draggable bubble — starts near the bottom-right, can be moved out of the way.
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        pan.extractOffset();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    }),
  ).current;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = entries.filter((e) => {
      if (filter === "warn" && e.level !== "warn" && e.level !== "error") return false;
      if (filter === "error" && e.level !== "error") return false;
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.reverse(); // newest first
  }, [entries, filter, query]);

  if (!debugEnabled()) return null;

  const counts = {
    total: entries.length,
    warn: entries.filter((e) => e.level === "warn").length,
    error: entries.filter((e) => e.level === "error").length,
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(formatAll(filtered.slice().reverse()));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: formatAll(filtered.slice().reverse()) });
    } catch {
      // user dismissed share sheet — ignore
    }
  };

  const renderItem = ({ item }: { item: LogEntry }) => {
    const ts = new Date(item.t).toISOString().slice(11, 23);
    return (
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Text style={[styles.rowMeta, { color: LEVEL_COLOR[item.level] }]}>
          {ts} {item.level.toUpperCase()}
        </Text>
        <Text style={[styles.rowText, { color: colors.textPrimary }]}>{item.text}</Text>
      </View>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Floating draggable bubble */}
      <Animated.View
        style={[styles.bubbleWrap, { transform: pan.getTranslateTransform() }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.bubble, { backgroundColor: colors.primary }]}
          hitSlop={8}
        >
          <Text style={styles.bubbleIcon}>🐞</Text>
          {counts.error > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{counts.error > 99 ? "99+" : counts.error}</Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Debug-Logs ({counts.total}) · {counts.error} Fehler
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={[styles.headerAction, { color: colors.primary }]}>Schließen</Text>
            </Pressable>
          </View>

          <View style={styles.toolbar}>
            {(["all", "warn", "error"] as Filter[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.chip,
                  { borderColor: colors.border },
                  filter === f && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: filter === f ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {f === "all" ? "Alle" : f === "warn" ? "Warn+" : "Fehler"}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Pressable onPress={handleCopy} hitSlop={8} style={styles.toolBtn}>
              <Text style={[styles.headerAction, { color: colors.primary }]}>
                {copied ? "Kopiert ✓" : "Kopieren"}
              </Text>
            </Pressable>
            <Pressable onPress={handleShare} hitSlop={8} style={styles.toolBtn}>
              <Text style={[styles.headerAction, { color: colors.primary }]}>Teilen</Text>
            </Pressable>
            <Pressable onPress={clearLogs} hitSlop={8} style={styles.toolBtn}>
              <Text style={[styles.headerAction, { color: colors.textSecondary }]}>Leeren</Text>
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filtern (z. B. MaciContext, refreshSignUp)…"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.search,
              { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          />

          <FlatList
            data={filtered}
            keyExtractor={(e) => String(e.id)}
            renderItem={renderItem}
            initialNumToRender={40}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                Noch keine Logs.
              </Text>
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleWrap: { position: "absolute", right: 12, bottom: 120 },
  bubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.92,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  bubbleIcon: { fontSize: 22 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter-Bold" },
  modal: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 15, fontFamily: "Inter-SemiBold", flex: 1, marginRight: 12 },
  headerAction: { fontSize: 14, fontFamily: "Inter-Medium" },
  toolbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter-Medium" },
  toolBtn: { paddingHorizontal: 4 },
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: "Inter-Regular",
  },
  row: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowMeta: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginBottom: 2 },
  rowText: { fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 16 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter-Regular" },
});
