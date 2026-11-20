/**
 * Bottom chrome (nav + floating buttons) that slides away while the user
 * scrolls DOWN and returns on any scroll UP or at the top — the Austausch
 * behaviour, for the other main screens. Runs entirely on the UI thread:
 * no JS re-render per scroll frame.
 */
import {
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';

/** Dead zone (px per event) so frame jitter can't flap the latch. */
const JITTER = 6;
const SLIDE = { duration: 220, easing: Easing.out(Easing.cubic) } as const;

/** Direction latch + scroll handler. `visible` is true while the chrome shows. */
export function useScrollChrome(): {
  visible: SharedValue<boolean>;
  /** Current scroll offset (UI thread), for scroll-linked styles. */
  y: SharedValue<number>;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
} {
  const visible = useSharedValue(true);
  const lastY = useSharedValue(0);
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const offset = e.contentOffset.y;
      y.value = offset;
      const dy = offset - lastY.value;
      lastY.value = offset;
      if (offset <= 0) visible.value = true;
      else if (dy > JITTER) visible.value = false;
      else if (dy < -JITTER) visible.value = true;
    },
  });
  return { visible, y, onScroll };
}

/** Slide style for the bottom nav overlay, driven by a `visible` latch. */
export function useNavHideStyle(visible: SharedValue<boolean>) {
  const insets = useSafeAreaInsets();
  const distance = BOTTOM_NAV_HEIGHT + insets.bottom + 24;
  return useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(visible.value ? 0 : distance, SLIDE) }],
  }));
}

/**
 * Slide for things that float just above the nav (mini player, FABs): when the
 * nav slides away they glide down into its place instead of hanging in the air
 * (or disappearing), and rise again with it.
 */
export function useNavCompanionStyle(visible: SharedValue<boolean>) {
  return useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(visible.value ? 0 : BOTTOM_NAV_HEIGHT, SLIDE) }],
  }));
}
