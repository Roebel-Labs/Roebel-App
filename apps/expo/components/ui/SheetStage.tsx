/**
 * SheetStage — iOS page-sheet depth effect for the whole app.
 *
 * While a bottom sheet is open, the screen behind it shrinks (~0.92), gets
 * rounded top corners, moves down a little and dims; the area around it is
 * black. Everything is interpolated from ONE progress value (0 = no sheet,
 * 1 = sheet fully open) that the sheets write on the UI thread — including
 * while the user drags a sheet down, so the background grows back with the
 * finger. No React re-renders per frame.
 *
 * Wiring:
 *  - `<SheetStageProvider>` high in the tree (above every sheet, including
 *    sheets rendered by providers such as the login drawer).
 *  - `<SheetStageView>` around the navigator; it paints the scaled screen.
 *  - A sheet with its own Reanimated progress calls
 *    `useSheetStageLink(progress, mounted)`; a plain RN `<Modal>` sheet calls
 *    `useSheetStageVisibility(visible)`. Both return `true` when a stage is
 *    present — the sheet should then drop its own scrim (the stage dims).
 *
 * Stacked sheets: each open sheet owns one slot; the stage follows the
 * maximum of all slots, so closing the top sheet keeps the stage pushed back
 * for the sheet underneath.
 *
 * Reduced motion: no scale / translate / radius — only the dim fades.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  makeMutable,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "@/context/ThemeContext";

/** Max sheets that can push the stage back at once (more = ignored, no crash). */
const SLOT_COUNT = 6;
const STAGE_SCALE = 0.92;
const STAGE_RADIUS = 14;
const STAGE_SHIFT_Y = 10;

/** Shared open/close curve for sheets and the stage (no overshoot). */
export const SHEET_OPEN_TIMING = {
  duration: 320,
  easing: Easing.out(Easing.cubic),
} as const;
export const SHEET_CLOSE_TIMING = {
  duration: 260,
  easing: Easing.out(Easing.cubic),
} as const;

type ActiveStore = {
  get: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

type StageContext = {
  slots: SharedValue<number>[];
  acquire: () => number;
  release: (slot: number) => void;
  active: ActiveStore;
};

const SheetStageContext = createContext<StageContext | null>(null);
const NO_SLOTS: SharedValue<number>[] = [];

export function SheetStageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const slots = useMemo(
    () => Array.from({ length: SLOT_COUNT }, () => makeMutable(0)),
    []
  );
  const used = useRef<boolean[]>(
    Array.from({ length: SLOT_COUNT }, () => false)
  );
  const listeners = useRef(new Set<() => void>());
  const activeRef = useRef(false);

  const value = useMemo<StageContext>(() => {
    const notify = () => {
      const next = used.current.some(Boolean);
      if (next === activeRef.current) return;
      activeRef.current = next;
      listeners.current.forEach((l) => l());
    };
    return {
      slots,
      acquire: () => {
        const i = used.current.indexOf(false);
        if (i < 0) return -1;
        used.current[i] = true;
        notify();
        return i;
      },
      release: (i: number) => {
        if (i < 0 || !used.current[i]) return;
        used.current[i] = false;
        slots[i].set(0);
        notify();
      },
      active: {
        get: () => activeRef.current,
        subscribe: (l) => {
          listeners.current.add(l);
          return () => listeners.current.delete(l);
        },
      },
    };
  }, [slots]);

  return (
    <SheetStageContext.Provider value={value}>
      {children}
    </SheetStageContext.Provider>
  );
}

/**
 * The scaled "page" behind sheets. Wrap the navigator with it; `style`
 * applies to the page itself (pass the screen background there).
 */
export function SheetStageView({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ctx = useContext(SheetStageContext);
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const slots = ctx?.slots ?? NO_SLOTS;

  const progress = useDerivedValue(() => {
    let max = 0;
    for (let i = 0; i < slots.length; i++) {
      const v = slots[i].get();
      if (v > max) max = v;
    }
    return max > 1 ? 1 : max;
  });

  const pageStyle = useAnimatedStyle(() => {
    if (reducedMotion)
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
      };
    const p = progress.get();
    const radius = p * STAGE_RADIUS;
    return {
      transform: [
        { translateY: p * STAGE_SHIFT_Y },
        { scale: 1 - p * (1 - STAGE_SCALE) },
      ],
      borderTopLeftRadius: radius,
      borderTopRightRadius: radius,
    };
  });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.page, style, pageStyle]}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.scrim },
            scrimStyle,
          ]}
        />
      </Animated.View>
      {ctx && !reducedMotion ? <StageStatusBar store={ctx.active} /> : null}
    </View>
  );
}

/**
 * While any sheet is open the page sits on black, so the status bar flips to
 * light content. Mounted only while active: RN's StatusBar stack lets the
 * latest mounted entry win and restores the app's own entry on unmount.
 * Subscribes to a tiny store, so only this leaf re-renders (twice per sheet).
 */
function StageStatusBar({ store }: { store: ActiveStore }) {
  const active = useSyncExternalStore(store.subscribe, store.get, store.get);
  if (!active) return null;
  return (
    <StatusBar barStyle="light-content" backgroundColor="#000000" animated />
  );
}

/**
 * Link a sheet's own progress (0 closed → 1 open; follow the finger while
 * dragging) to the stage. `mounted` = the sheet is on screen (including its
 * close animation). Returns true when a stage exists → skip the sheet scrim.
 */
export function useSheetStageLink(
  progress: SharedValue<number>,
  mounted: boolean
): boolean {
  const ctx = useContext(SheetStageContext);
  const slot = useSharedValue(-1);
  const slots = ctx?.slots ?? NO_SLOTS;

  useEffect(() => {
    if (!ctx || !mounted) return undefined;
    const i = ctx.acquire();
    if (i < 0) return undefined;
    slot.set(i);
    ctx.slots[i].set(progress.get());
    return () => {
      slot.set(-1);
      ctx.release(i);
    };
  }, [ctx, mounted, progress, slot]);

  useAnimatedReaction(
    () => progress.get(),
    (v) => {
      const i = slot.get();
      if (i >= 0 && i < slots.length) slots[i].set(v);
    },
    [slots]
  );

  return ctx !== null;
}

/**
 * For sheets that keep RN's own `<Modal animationType="slide">`: animates the
 * stage alongside the native slide (no drag tracking). Returns true when a
 * stage exists → the sheet should skip its own dim layer.
 */
export function useSheetStageVisibility(visible: boolean): boolean {
  const progress = useSharedValue(0);
  // Keep the slot while the close animation runs.
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, SHEET_OPEN_TIMING));
      return undefined;
    }
    progress.set(withTiming(0, SHEET_CLOSE_TIMING));
    const t = setTimeout(
      () => setMounted(false),
      SHEET_CLOSE_TIMING.duration + 40
    );
    return () => clearTimeout(t);
  }, [visible, progress]);

  return useSheetStageLink(progress, mounted || visible);
}

/**
 * For @gorhom/bottom-sheet sheets that live in their own Modal window: pass
 * `animatedIndex` to `<BottomSheet animatedIndex={...}>`. Index -1 (closed)
 * → 0 (first snap point) maps to stage progress 0 → 1, so the page follows
 * the library's own open animation and pan-down gesture. Do NOT use it for
 * in-screen gorhom sheets: those are part of the page and would shrink too.
 */
export function useSheetStageIndexLink(): {
  animatedIndex: SharedValue<number>;
  hasStage: boolean;
} {
  const animatedIndex = useSharedValue(-1);
  const progress = useDerivedValue(() => {
    const p = animatedIndex.get() + 1;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  });
  const hasStage = useSheetStageLink(progress, true);
  return { animatedIndex, hasStage };
}

/** True when a SheetStageProvider is mounted above (the stage owns the dim). */
export function useHasSheetStage(): boolean {
  return useContext(SheetStageContext) !== null;
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: "#000000" },
  page: { flex: 1, overflow: "hidden" },
});
