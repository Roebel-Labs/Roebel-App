import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line as SvgLine, Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { useTheme } from "@/context/ThemeContext";

interface WeeklyEarnedChartProps {
	/** One value per week, oldest → newest (last point = "Heute"). */
	points: number[];
	/** Short labels under the x-axis, same length as points. */
	labels: string[];
	/** % change vs. previous period (e.g. +12 or -4). */
	changePct?: number;
}

const W = 320;
const H = 120;
const PAD_X = 6;
const PAD_Y = 14;

/** Smooth-ish polyline path through the points, scaled into the chart box. */
function buildPath(points: number[]): string {
	if (points.length === 0) return "";
	const max = Math.max(...points, 1);
	const min = Math.min(...points, 0);
	const range = max - min || 1;
	const stepX = (W - PAD_X * 2) / Math.max(points.length - 1, 1);
	const xy = points.map((p, i) => {
		const x = PAD_X + i * stepX;
		const y = PAD_Y + (H - PAD_Y * 2) * (1 - (p - min) / range);
		return [x, y] as const;
	});
	return xy.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(" ");
}

/**
 * Weekly "earned Röbel-Taler" chart — mirrors the Metri weekly-earnings card,
 * Röbel-branded. Flat baseline when there's nothing earned yet (accurate, not faked).
 */
export default function WeeklyEarnedChart({ points, labels, changePct }: WeeklyEarnedChartProps) {
	const { colors } = useTheme();
	const total = points.length ? points[points.length - 1] : 0;
	const path = useMemo(() => buildPath(points), [points]);
	const last = useMemo(() => {
		if (!points.length) return null;
		const max = Math.max(...points, 1);
		const min = Math.min(...points, 0);
		const range = max - min || 1;
		const stepX = (W - PAD_X * 2) / Math.max(points.length - 1, 1);
		const x = PAD_X + (points.length - 1) * stepX;
		const y = PAD_Y + (H - PAD_Y * 2) * (1 - (points[points.length - 1] - min) / range);
		return { x, y };
	}, [points]);

	const styles = makeStyles(colors);
	const accent = colors.primary;

	return (
		<View style={styles.card}>
			<Text style={styles.label}>Diese Woche verdient</Text>
			<View style={styles.valueRow}>
				<Text style={styles.value}>{total.toFixed(2)} <Text style={styles.unit}>Röbel-Taler</Text></Text>
				{typeof changePct === "number" && (
					<Text style={[styles.pct, { color: changePct >= 0 ? colors.success : colors.textSecondary }]}>
						{changePct >= 0 ? "+" : ""}{changePct}%
					</Text>
				)}
			</View>

			<Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 8 }}>
				<Defs>
					<SvgGradient id="rtFill" x1="0" y1="0" x2="0" y2="1">
						<Stop offset="0" stopColor={accent} stopOpacity={0.18} />
						<Stop offset="1" stopColor={accent} stopOpacity={0} />
					</SvgGradient>
				</Defs>
				{/* faint vertical week gridlines */}
				{labels.map((_, i) => {
					const x = PAD_X + i * ((W - PAD_X * 2) / Math.max(labels.length - 1, 1));
					return <SvgLine key={i} x1={x} y1={PAD_Y} x2={x} y2={H - PAD_Y} stroke={colors.border} strokeWidth={1} strokeDasharray="3 5" />;
				})}
				{/* area + line */}
				{path !== "" && (
					<>
						<Path d={`${path} L ${W - PAD_X} ${H - PAD_Y} L ${PAD_X} ${H - PAD_Y} Z`} fill="url(#rtFill)" />
						<Path d={path} stroke={accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
						{last && <Circle cx={last.x} cy={last.y} r={4.5} fill={accent} />}
					</>
				)}
			</Svg>

			<View style={styles.axis}>
				{labels.map((l, i) => (
					<Text key={i} style={styles.axisLabel}>{l}</Text>
				))}
			</View>
		</View>
	);
}

function makeStyles(colors: any) {
	return StyleSheet.create({
		card: { backgroundColor: colors.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border },
		label: { fontFamily: "Inter-Medium", fontSize: 14, color: colors.textSecondary },
		valueRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 2 },
		value: { fontFamily: "Inter-Bold", fontSize: 30, color: colors.textPrimary },
		unit: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.primary },
		pct: { fontFamily: "Inter-SemiBold", fontSize: 14 },
		axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
		axisLabel: { fontFamily: "Inter-Regular", fontSize: 11, color: colors.textTertiary },
	});
}
