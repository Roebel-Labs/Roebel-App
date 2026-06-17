import React, { useCallback } from "react";
import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { useRoebelTaler } from "@/hooks/useRoebelTaler";
import { useRoebelTalerWeekly } from "@/hooks/useRoebelTalerWeekly";
import WeeklyEarnedChart from "@/components/roebeltaler/WeeklyEarnedChart";
import { formatTaler } from "@/lib/roebel-taler";

const HERO_COIN = require("../../assets/illustration/gamification/hero-coin.png");

export default function RoebelTalerScreen() {
	const { colors, isDark } = useTheme();
	const router = useRouter();
	const { balanceRaw, onboarded, loading, minting, onboarding, dailyMint, onboard, account } = useRoebelTaler();
	const weekly = useRoebelTalerWeekly();

	const onDailyMint = useCallback(async () => {
		try { await dailyMint(); } catch { Alert.alert("Heute schon abgeholt", "Dein tägliches Röbel-Taler steht erst morgen wieder bereit."); }
	}, [dailyMint]);

	const onJoin = useCallback(async () => {
		try { await onboard(); } catch { Alert.alert("Nicht möglich", "Die Anmeldung ist gerade nicht möglich. Bitte versuche es später erneut."); }
	}, [onboard]);

	const styles = makeStyles(colors);

	return (
		<View style={styles.root}>
			<LinearGradient
				colors={isDark ? ["#2A261A", colors.background] : ["#FBEFBA", "#FFFFFF"]}
				start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
				style={styles.gradient} pointerEvents="none"
			/>
			<SafeAreaView style={styles.safe} edges={["top"]}>
				<ScrollView contentContainerStyle={styles.content}>
					{/* Hero balance */}
					<Image source={HERO_COIN} style={styles.heroCoin} resizeMode="contain" />
					{loading ? (
						<ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
					) : (
						<>
							<Text style={styles.balanceValue}>{formatTaler(balanceRaw)}</Text>
							<Text style={styles.balanceUnit}>Röbel-Taler</Text>
						</>
					)}

					{/* Primary action: daily mint or join */}
					{!loading && account && (onboarded ? (
						<Pressable style={[styles.cta, minting && styles.ctaDisabled]} onPress={onDailyMint} disabled={minting}>
							{minting ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Heute abholen</Text>}
						</Pressable>
					) : (
						<Pressable style={[styles.cta, onboarding && styles.ctaDisabled]} onPress={onJoin} disabled={onboarding}>
							{onboarding ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Bei Röbel-Taler mitmachen</Text>}
						</Pressable>
					))}

					{/* Send / receive → wallet */}
					{onboarded && (
						<View style={styles.actionsRow}>
							<Pressable style={styles.actionBtn} onPress={() => router.push("/wallet" as any)}>
								<Text style={styles.actionText}>Senden</Text>
							</Pressable>
							<Pressable style={styles.actionBtn} onPress={() => router.push("/wallet" as any)}>
								<Text style={styles.actionText}>Empfangen</Text>
							</Pressable>
						</View>
					)}

					{/* Weekly earned chart */}
					{onboarded && (
						<View style={{ width: "100%", marginTop: 20 }}>
							<WeeklyEarnedChart points={weekly.points} labels={weekly.labels} changePct={weekly.changePct} />
						</View>
					)}

					<Text style={styles.hint}>
						Jeden Tag wartet dein Röbel-Taler auf dich. Gib ihn bei Röbeler Geschäften aus
						oder unterstütze deine Nachbarn — er bleibt in der Stadt.
					</Text>
				</ScrollView>
			</SafeAreaView>
		</View>
	);
}

function makeStyles(colors: any) {
	return StyleSheet.create({
		root: { flex: 1, backgroundColor: colors.background },
		gradient: { position: "absolute", top: 0, left: 0, right: 0, height: 460 },
		safe: { flex: 1 },
		content: { padding: 20, alignItems: "center" },
		heroCoin: { width: 140, height: 140, marginTop: 12 },
		balanceValue: { fontFamily: "Inter-Bold", fontSize: 44, color: colors.textPrimary, marginTop: 8 },
		balanceUnit: { fontFamily: "Inter-SemiBold", fontSize: 18, color: colors.primary, marginTop: -2 },
		cta: { marginTop: 24, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, alignItems: "center", minWidth: 220 },
		ctaDisabled: { opacity: 0.6 },
		ctaText: { fontFamily: "Inter-SemiBold", fontSize: 16, color: "#fff" },
		actionsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
		actionBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, minWidth: 120 },
		actionText: { fontFamily: "Inter-SemiBold", fontSize: 15, color: colors.textPrimary },
		hint: { fontFamily: "Inter-Regular", fontSize: 13, color: colors.textSecondary, marginTop: 24, textAlign: "center", lineHeight: 19 },
	});
}
