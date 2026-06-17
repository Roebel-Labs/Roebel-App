import React, { useCallback } from "react";
import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/context/ThemeContext";
import { useRoebelTaler } from "@/hooks/useRoebelTaler";
import { formatTaler } from "@/lib/roebel-taler";

export default function RoebelTalerScreen() {
	const { colors, isDark } = useTheme();
	const { balanceRaw, onboarded, loading, minting, dailyMint, account } = useRoebelTaler();

	const onDailyMint = useCallback(async () => {
		try {
			await dailyMint();
		} catch {
			Alert.alert("Heute schon abgeholt", "Dein tägliches Röbel-Taler steht erst morgen wieder bereit.");
		}
	}, [dailyMint]);

	const onJoin = useCallback(() => {
		// SEAM: onboarding registers the citizen via a Röbel operator invite (backend).
		Alert.alert("Bald verfügbar", "Die Anmeldung für Röbel-Taler wird in Kürze freigeschaltet.");
	}, []);

	const styles = makeStyles(colors);

	return (
		<View style={styles.root}>
			<LinearGradient
				colors={isDark ? ["#2A261A", colors.background] : ["#FBEFBA", "#FFFFFF"]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.gradient}
				pointerEvents="none"
			/>
			<SafeAreaView style={styles.safe} edges={["top"]}>
				<ScrollView contentContainerStyle={styles.content}>
					<Text style={styles.title}>Röbel-Taler</Text>
					<Text style={styles.subtitle}>Die Gemeinschaftswährung von Röbel/Müritz.</Text>

					<View style={styles.card}>
						<Image source={require("../../assets/illustration/taler/single.png")} style={styles.coin} resizeMode="contain" />
						{loading ? (
							<ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
						) : (
							<>
								<Text style={styles.balanceLabel}>Dein Guthaben</Text>
								<Text style={styles.balanceValue}>{formatTaler(balanceRaw)} <Text style={styles.balanceUnit}>Röbel-Taler</Text></Text>
							</>
						)}
					</View>

					{!loading && account && (onboarded ? (
						<Pressable style={[styles.cta, minting && styles.ctaDisabled]} onPress={onDailyMint} disabled={minting}>
							{minting ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Heute abholen</Text>}
						</Pressable>
					) : (
						<Pressable style={styles.cta} onPress={onJoin}>
							<Text style={styles.ctaText}>Bei Röbel-Taler mitmachen</Text>
						</Pressable>
					))}

					<Text style={styles.hint}>
						Jeden Tag wartet dein Röbel-Taler auf dich. Gib ihn bei Röbeler Geschäften aus oder
						unterstütze deine Nachbarn — er bleibt in der Stadt.
					</Text>
				</ScrollView>
			</SafeAreaView>
		</View>
	);
}

function makeStyles(colors: any) {
	return StyleSheet.create({
		root: { flex: 1, backgroundColor: colors.background },
		gradient: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
		safe: { flex: 1 },
		content: { padding: 20, alignItems: "center" },
		title: { fontFamily: "Inter-Bold", fontSize: 28, color: colors.textPrimary, marginTop: 8 },
		subtitle: { fontFamily: "Inter-Regular", fontSize: 15, color: colors.textSecondary, marginTop: 4, marginBottom: 24, textAlign: "center" },
		card: { width: "100%", backgroundColor: colors.card, borderRadius: 24, padding: 24, alignItems: "center", borderWidth: 1, borderColor: colors.border },
		coin: { width: 120, height: 120, marginBottom: 12 },
		balanceLabel: { fontFamily: "Inter-Medium", fontSize: 14, color: colors.textSecondary },
		balanceValue: { fontFamily: "Inter-Bold", fontSize: 34, color: colors.textPrimary, marginTop: 2 },
		balanceUnit: { fontFamily: "Inter-SemiBold", fontSize: 18, color: colors.primary },
		cta: { marginTop: 24, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, width: "100%", alignItems: "center" },
		ctaDisabled: { opacity: 0.6 },
		ctaText: { fontFamily: "Inter-SemiBold", fontSize: 16, color: "#fff" },
		hint: { fontFamily: "Inter-Regular", fontSize: 13, color: colors.textSecondary, marginTop: 20, textAlign: "center", lineHeight: 19 },
	});
}
