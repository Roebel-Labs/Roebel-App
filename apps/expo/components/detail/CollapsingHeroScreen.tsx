/**
 * Shared layout for every detail page that opens on a full-bleed hero image
 * (event, restaurant, dish, business, news, movie, holiday flat, POI,
 * marketplace, org page).
 *
 * One scroll value on the UI thread drives everything (see collapseRanges.ts):
 *   1. a clean hero with round glass buttons floating 20px from the edges;
 *   2. while scrolling, a blurred copy of the same image crossfades in
 *      (expo-image blurRadius — no live blur sampler) plus a theme-colored wash;
 *   3. as the hero leaves, the buttons slide to a 16px inset, their glass
 *      circle fades out (icon stays) and the app header (theme background +
 *      hairline + optional centered title) fades in above the blurred image.
 * Optional: a content sheet with 24px rounded top corners overlapping the hero.
 * Loading: hero + body become Bone skeletons inside ONE SkeletonScope, so a
 * single shimmer band passes top to bottom.
 */
import React, { useCallback, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { GlassFill, glassChrome } from '@/components/GlassIconButton';
import GlassSurface, { GlassBackdrop, GlassProvider } from '@/components/GlassSurface';
import { BlurView } from 'expo-blur';
import { SkeletonScope, Bone } from '@/components/skeleton/Skeleton';
import { ArrowLeftIcon } from '@/components/Icons';
import { DETAIL_HEADER_BAR, getCollapseRanges } from './collapseRanges';
import DetailBodySkeleton from './DetailBodySkeleton';

export type DetailAction = {
  key: string;
  accessibilityLabel: string;
  onPress: () => void;
  /** Icon in the given color (the color changes between glass and header). */
  renderIcon: (color: string) => React.ReactNode;
};

const BUTTON = 48;
const INSET_OPEN = 20;
const INSET_COLLAPSED = 16;
const BUTTON_GAP = 8;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type Props = {
  heroHeight: number;
  /** Source for the clean hero AND its blurred copy. */
  imageUri?: string | null;
  /** Replaces the clean hero layer (e.g. an image pager); the blur still uses imageUri. */
  renderHero?: () => React.ReactNode;
  /** Rendered over the clean hero, under blur + wash (dots, badges, gradients). */
  heroOverlay?: React.ReactNode;
  /** Tap on the clean hero image (gallery / zoom). Ignored with renderHero. */
  onHeroPress?: () => void;
  heroBackgroundColor?: string;
  /** Centered header title, fades in at the end of the collapse. */
  title?: string;
  onBack: () => void;
  actions?: DetailAction[];
  /** 'dark' keeps glass dark over bright photos in light mode. */
  tone?: 'auto' | 'dark';
  /** Rounded content sheet overlapping the hero (default true). */
  sheet?: boolean;
  sheetOverlap?: number;
  sheetColor?: string;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Scroll content after the sheet, on the page background (e.g. a report link). */
  belowSheet?: React.ReactNode;
  /** Page color behind the scroll content. */
  backgroundColor?: string;
  loading?: boolean;
  /** Custom skeleton body (rendered inside the shared SkeletonScope). */
  skeleton?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Absolutely positioned layer above everything (sticky bottom bars). */
  footer?: React.ReactNode;
  /** Share the scroll offset with siblings. */
  scrollY?: SharedValue<number>;
  /** JS-thread scroll callback (only when a screen really needs it). */
  onScrollJS?: (y: number) => void;
  /** Plain useRef works: Animated.ScrollView forwards it to the native ScrollView. */
  scrollRef?: React.Ref<any>;
  /** Extra ScrollView props (keyboardShouldPersistTaps …). */
  scrollViewProps?: Partial<ScrollViewProps>;
  /** Page body — inside the sheet when `sheet`, else directly below the hero. */
  children?: React.ReactNode;
};

export default function CollapsingHeroScreen({
  heroHeight,
  imageUri,
  renderHero,
  heroOverlay,
  onHeroPress,
  heroBackgroundColor,
  title,
  onBack,
  actions = [],
  tone = 'auto',
  sheet = true,
  sheetOverlap = 24,
  sheetColor,
  sheetStyle,
  belowSheet,
  backgroundColor,
  loading = false,
  skeleton,
  refreshControl,
  contentContainerStyle,
  footer,
  scrollY: externalScrollY,
  onScrollJS,
  scrollRef,
  scrollViewProps,
  children,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const ownScrollY = useSharedValue(0);
  const scrollY = externalScrollY ?? ownScrollY;
  const overlap = sheet ? sheetOverlap : 0;
  const { headerHeight, collapseStart, collapseEnd } = getCollapseRanges(heroHeight, overlap, insets.top);

  // Stable JS bridge: the latest callback lives in a ref so the worklet
  // doesn't get rebuilt when a screen passes a fresh closure every render.
  const onScrollJSRef = useRef(onScrollJS);
  onScrollJSRef.current = onScrollJS;
  const hasScrollJS = !!onScrollJS;
  const callScrollJS = useCallback((y: number) => onScrollJSRef.current?.(y), []);
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        scrollY.value = e.contentOffset.y;
        if (hasScrollJS) runOnJS(callScrollJS)(e.contentOffset.y);
      },
    },
    [scrollY, hasScrollJS, callScrollJS],
  );

  // Hero: pinned-top stretch on pull-down, light parallax on scroll.
  const heroLayerStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y < 0) {
      return { transform: [{ translateY: y / 2 }, { scale: (heroHeight - y) / heroHeight }] };
    }
    return { transform: [{ translateY: y * 0.35 }, { scale: 1 }] };
  });
  const blurStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, collapseEnd], [0, 1], Extrapolation.CLAMP),
  }));
  const heroBlurProps = useAnimatedProps(() => ({
    intensity: interpolate(scrollY.value, [0, collapseEnd], [0, 100], Extrapolation.CLAMP),
  }));
  const washStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, collapseEnd], [0, 0.55], Extrapolation.CLAMP),
  }));
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [collapseStart, collapseEnd], [0, 1], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => {
    const t = interpolate(
      scrollY.value,
      [collapseStart + (collapseEnd - collapseStart) * 0.5, collapseEnd + 24],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity: t, transform: [{ translateY: (1 - t) * 6 }] };
  });
  const shift = INSET_OPEN - INSET_COLLAPSED;
  const leftGroupStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -shift * interpolate(scrollY.value, [collapseStart, collapseEnd], [0, 1], Extrapolation.CLAMP) }],
  }));
  const rightGroupStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shift * interpolate(scrollY.value, [collapseStart, collapseEnd], [0, 1], Extrapolation.CLAMP) }],
  }));

  const sideRoom = INSET_COLLAPSED + Math.max(1, actions.length) * (BUTTON + BUTTON_GAP);
  const pageBg = backgroundColor ?? colors.background;

  const cleanHero = renderHero ? (
    renderHero()
  ) : imageUri ? (
    onHeroPress ? (
      <Pressable style={StyleSheet.absoluteFill} onPress={onHeroPress} accessibilityRole="imagebutton" accessibilityLabel="Bild vergrößern">
        <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      </Pressable>
    ) : (
      <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
    )
  ) : null;

  const body = loading ? (skeleton ?? <DetailBodySkeleton />) : children;

  const content = (
    <>
      <View style={[styles.hero, { height: heroHeight, backgroundColor: heroBackgroundColor ?? colors.cardPlaceholder }]}>
        {loading ? (
          <Bone width="100%" height={heroHeight} radius={0} />
        ) : (
          <Animated.View style={[StyleSheet.absoluteFill, heroLayerStyle]}>
            <GlassBackdrop style={StyleSheet.absoluteFill}>
              {cleanHero}
              {heroOverlay}
            </GlassBackdrop>
            {/* Frost: exactly the standard bottom bar's glass material over the hero
                (Android samples the hero's GlassBackdrop; iOS dissolves by intensity,
                since a parent opacity would switch a UIVisualEffectView off). */}
            {Platform.OS === 'ios' ? (
              <AnimatedBlurView
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                animatedProps={heroBlurProps}
                tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterial'}
              />
            ) : (
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
                <GlassSurface androidExperimentalBlur />
              </Animated.View>
            )}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }, washStyle]} />
          </Animated.View>
        )}
      </View>
      {sheet ? (
        <View
          style={[
            styles.sheet,
            { marginTop: -sheetOverlap, backgroundColor: sheetColor ?? colors.background },
            sheetStyle,
          ]}
        >
          {body}
        </View>
      ) : (
        body
      )}
      {!loading ? belowSheet : null}
    </>
  );

  return (
    <GlassProvider>
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <Animated.ScrollView
        {...scrollViewProps}
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={loading ? undefined : refreshControl}
        contentContainerStyle={contentContainerStyle}
        scrollEnabled={!loading}
      >
        {loading ? <SkeletonScope>{content}</SkeletonScope> : content}
      </Animated.ScrollView>

      {/* App header — fades in above the blurred hero. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.header,
          { height: headerHeight, backgroundColor: colors.background, borderBottomColor: colors.border },
          headerStyle,
        ]}
      >
        {title ? (
          <Animated.View style={[styles.titleWrap, { top: insets.top, paddingHorizontal: sideRoom }, titleStyle]}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      {/* Floating buttons: 20 → 16 inset, glass → bare icon. */}
      <View pointerEvents="box-none" style={[styles.buttonRow, { top: insets.top + (DETAIL_HEADER_BAR - BUTTON) / 2 }]}>
        <Animated.View style={leftGroupStyle}>
          <CollapsingGlassButton
            onPress={onBack}
            accessibilityLabel="Zurück"
            scrollY={scrollY}
            range={[collapseStart, collapseEnd]}
            tone={tone}
            isDark={isDark}
            renderIcon={(c) => <ArrowLeftIcon size={24} color={c} />}
          />
        </Animated.View>
        {actions.length > 0 && !loading ? (
          <Animated.View style={[styles.rightGroup, rightGroupStyle]}>
            {actions.map((a) => (
              <CollapsingGlassButton
                key={a.key}
                onPress={a.onPress}
                accessibilityLabel={a.accessibilityLabel}
                scrollY={scrollY}
                range={[collapseStart, collapseEnd]}
                tone={tone}
                isDark={isDark}
                renderIcon={a.renderIcon}
              />
            ))}
          </Animated.View>
        ) : null}
      </View>

      {footer}
    </View>
    </GlassProvider>
  );
}

const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) } as const;
const PRESS_OUT = { duration: 160, easing: Easing.out(Easing.cubic) } as const;

/**
 * The GlassIconButton material (GlassFill + glassChrome) with the glass
 * circle on its own layer, so the circle can fade out while the icon stays.
 * If the glass tone needs a different icon color than the header, both icon
 * colors are crossfaded on the same scroll range.
 */
function CollapsingGlassButton({
  onPress,
  accessibilityLabel,
  scrollY,
  range,
  tone,
  isDark,
  renderIcon,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  scrollY: SharedValue<number>;
  range: [number, number];
  tone: 'auto' | 'dark';
  isDark: boolean;
  renderIcon: (color: string) => React.ReactNode;
}) {
  const { colors, variant } = useTheme();
  const glassDark = tone === 'dark' || isDark;
  const { rim, shadow } = glassChrome(glassDark);
  const glassIconColor = glassDark ? '#FFFFFF' : colors.textPrimary;
  const headerIconColor = colors.textPrimary;
  const crossfade = glassIconColor !== headerIconColor;
  const [start, end] = range;

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glassStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [start, end], [1, 0], Extrapolation.CLAMP),
  }));
  const headerIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [start, end], [0, 1], Extrapolation.CLAMP),
  }));

  const onPressIn = useCallback(() => {
    scale.set(withTiming(0.92, PRESS_IN));
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, [scale]);
  const onPressOut = useCallback(() => {
    scale.set(withTiming(1, PRESS_OUT));
  }, [scale]);

  return (
    <Animated.View style={[styles.button, pressStyle]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glassStyle]}>
        <View style={[styles.glassShadow, { boxShadow: shadow } as ViewStyle]} />
        <View style={[styles.glassClip, { borderColor: rim }]}>
          <GlassFill dark={glassDark} black={variant === 'dark'} />
        </View>
      </Animated.View>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.buttonHit}
      >
        {crossfade ? (
          <>
            <Animated.View style={[styles.iconLayer, glassStyle]}>{renderIcon(glassIconColor)}</Animated.View>
            <Animated.View style={[styles.iconLayer, headerIconStyle]}>{renderIcon(headerIconColor)}</Animated.View>
          </>
        ) : (
          renderIcon(headerIconColor)
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { width: '100%', overflow: 'hidden' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: DETAIL_HEADER_BAR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  buttonRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: INSET_OPEN,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rightGroup: { flexDirection: 'row', gap: BUTTON_GAP },
  button: { width: BUTTON, height: BUTTON },
  glassShadow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: BUTTON / 2 },
  glassClip: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: BUTTON / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  buttonHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
