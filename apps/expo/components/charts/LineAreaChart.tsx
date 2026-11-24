/**
 * Line + soft area chart with dotted gridlines, three right-side ticks and start/end date labels
 * (the reference dashboard look). Touch and drag shows a crosshair with the day's value.
 * Optional second series = previous period, drawn dashed in muted ink with a legend.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { areaPath, formatCompact, linePath, niceTicks } from '@/lib/charts/geometry';
import { trendColor } from './palette';

type Props = {
  values: number[];
  /** Previous period, same length (dashed). */
  previous?: number[] | null;
  labels: string[];
  height?: number;
  emptyText?: string;
};

const TICK_W = 40;

export default function LineAreaChart({ values, previous, labels, height = 180, emptyText = 'Noch keine Daten in diesem Zeitraum' }: Props) {
  const { colors, isDark } = useTheme();
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(0, width - TICK_W);
  const color = trendColor(isDark);

  const max = Math.max(0, ...values, ...(previous ?? []));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const empty = values.every((v) => v === 0) && (previous ?? []).every((v) => v === 0);

  const paths = useMemo(
    () => ({
      line: linePath(values, plotW, height, top),
      area: areaPath(values, plotW, height, top),
      prev: previous && previous.length ? linePath(previous, plotW, height, top) : '',
    }),
    [values, previous, plotW, height, top]
  );

  const onTouch = (e: GestureResponderEvent) => {
    if (values.length < 2 || plotW <= 0) return;
    const x = Math.min(plotW, Math.max(0, e.nativeEvent.locationX));
    setHover(Math.round((x / plotW) * (values.length - 1)));
  };

  const hx = hover !== null && values.length > 1 ? (hover / (values.length - 1)) * plotW : 0;
  const hy = hover !== null ? height - (values[hover] / top) * height : 0;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {previous ? (
        <View style={styles.legend}>
          <View style={[styles.legendLine, { backgroundColor: color }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Aktuell</Text>
          <View style={[styles.legendLine, styles.legendDashed, { borderColor: colors.textTertiary }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Vorperiode</Text>
        </View>
      ) : null}
      <View
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={() => setHover(null)}
        onResponderTerminate={() => setHover(null)}
        accessibilityRole="image"
        accessibilityLabel={`Verlauf, Summe ${values.reduce((a, b) => a + b, 0)}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            {ticks.map((t) => {
              const y = height - (t / top) * height;
              return (
                <Line key={t} x1={0} x2={plotW} y1={y} y2={y} stroke={colors.border} strokeWidth={1} strokeDasharray="2,4" />
              );
            })}
            <Line x1={0} x2={plotW} y1={height - 0.5} y2={height - 0.5} stroke={colors.border} strokeWidth={1} />
            {!empty ? (
              <>
                {paths.prev ? (
                  <Path d={paths.prev} stroke={colors.textTertiary} strokeWidth={2} strokeDasharray="5,5" fill="none" />
                ) : null}
                <Path d={paths.area} fill="url(#area)" />
                <Path d={paths.line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                {hover !== null ? (
                  <>
                    <Line x1={hx} x2={hx} y1={0} y2={height} stroke={colors.textTertiary} strokeWidth={1} />
                    <Circle cx={hx} cy={hy} r={5} fill={color} stroke={colors.background} strokeWidth={2} />
                  </>
                ) : null}
              </>
            ) : null}
          </Svg>
        ) : null}
        {ticks.map((t) => (
          <Text
            key={`l${t}`}
            style={[styles.tick, { color: colors.textTertiary, top: height - (t / top) * height - 8 }]}
          >
            {formatCompact(t)}
          </Text>
        ))}
        {empty ? (
          <View style={[StyleSheet.absoluteFill, styles.emptyWrap, { right: TICK_W }]} pointerEvents="none">
            <Text style={[styles.empty, { color: colors.textSecondary }]}>{emptyText}</Text>
          </View>
        ) : null}
        {hover !== null && !empty ? (
          <View
            pointerEvents="none"
            style={[
              styles.tooltip,
              { backgroundColor: colors.textPrimary, left: Math.min(Math.max(0, hx - 50), Math.max(0, plotW - 100)) },
            ]}
          >
            <Text style={[styles.tooltipValue, { color: colors.background }]}>{formatCompact(values[hover])}</Text>
            <Text style={[styles.tooltipLabel, { color: colors.background }]}>
              {labels[hover]}
              {previous && previous[hover] !== undefined ? ` · vorher ${formatCompact(previous[hover])}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.axis, { marginRight: TICK_W }]}>
        <Text style={[styles.axisText, { color: colors.textTertiary }]}>{labels[0] ?? ''}</Text>
        <Text style={[styles.axisText, { color: colors.textTertiary }]}>{labels[labels.length - 1] ?? ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendDashed: { height: 0, borderTopWidth: 2, borderStyle: 'dashed', backgroundColor: 'transparent', marginLeft: 8 },
  legendText: { fontFamily: fontFamily.medium, fontSize: 12 },
  tick: { position: 'absolute', right: 0, width: TICK_W - 6, textAlign: 'right', fontFamily: fontFamily.regular, fontSize: 12 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  axisText: { fontFamily: fontFamily.regular, fontSize: 12 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fontFamily.medium, fontSize: 14 },
  tooltip: { position: 'absolute', top: -6, width: 100, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  tooltipValue: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  tooltipLabel: { fontFamily: fontFamily.regular, fontSize: 11 },
});
