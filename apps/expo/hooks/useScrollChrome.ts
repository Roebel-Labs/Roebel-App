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
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
} {
  const visible = useSharedValue(true);
  const lastY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const dy = y - lastY.value;
      lastY.value = y;
      if (y <= 0) visible.value = true;
      else if (dy > JITTER) visible.value = false;
      else if (dy < -JITTER) visible.value = true;
    },
  });
  return { visible, onScroll };
}

/** Slide style for the bottom nav overlay, driven by a `visible` latch. */
export function useNavHideStyle(visible: SharedValue<boolean>) {
  const insets = useSafeAreaInsets();
  const distance = BOTTOM_NAV_HEIGHT + insets.bottom + 24;
  return useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(visible.value ? 0 : distance, SLIDE) }],
  }));
}
