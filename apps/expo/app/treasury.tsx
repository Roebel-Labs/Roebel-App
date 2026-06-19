// Stadtkasse (civic treasury) — assets + transactions. The treasury is the Attester
// Safe's Röbel Münzen holdings. EUR figures are INDICATIVE only (not redeemable).
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { getRoebelTalerBalance, formatTaler } from "@/lib/roebel-taler";
import { attesterSafeGnosisAddress } from "@/constants/gnosis";
import ChevronLeftIcon from "@/assets/icons/chevron-left.svg";

const COIN = require("../assets/illustration/taler/multiple.png");

export default function TreasuryScreen() {
	const { colors } = useTheme();
	const router = useRouter();
	const [raw, setRaw] = useState<bigint | null>(null);

	useEffect(() => {
		let cancelled = false;
		getRoebelTalerBalance(attesterSafeGnosisAddress)
			.then((b) => { if (!cancelled) setRaw(b); })
			.catch(() => { if (!cancelled) setRaw(0n); });
		return () => { cancelled = true; };
	}, []);

	const styles = makeStyles(colors);
	const taler = raw === null ? null : Number(formatTaler(raw));

	return (
		<SafeAreaView style={styles.safe} edges={["top"]}>
			<View style={styles.header}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
				</Pressable>
				<Text style={styles.headerTitle}>Stadtkasse</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={styles.content}>
				<Image source={COIN} style={styles.heroCoin} resizeMode="contain" />
				<Text style={styles.totalLabel}>Gesamtwert (ca.)</Text>
				{taler === null ? (
					<ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
				) : (
					<Text style={styles.total}>{taler.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</Text>
				)}
				<Text style={styles.disclaimer}>Orientierungswert — Röbel Münzen sind nicht in Euro auszahlbar.</Text>

				<Text style={styles.section}>Vermögenswerte</Text>
				<View style={styles.assetRow}>
					<View style={styles.assetLeft}>
						<View style={styles.coinWrap}>
							{/* coin illustration */}
							<Image source={COIN} style={styles.coinImg} resizeMode="contain" />
						</View>
						<View>
							<Text style={styles.assetName}>Röbel Münzen</Text>
							<Text style={styles.assetSub}>Gemeinschaftswährung</Text>
						</View>
					</View>
					<Text style={styles.assetVal}>{taler === null ? "…" : taler.toLocaleString("de-DE")}</Text>
				</View>

				<Text style={styles.section}>Transaktionen</Text>
				<View style={styles.empty}>
					<Text style={styles.emptyText}>Noch keine Transaktionen.</Text>
					<Text style={styles.emptySub}>Ein- und Ausgaben der Stadtkasse erscheinen hier.</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

function makeStyles(colors: any) {
	return StyleSheet.create({
		safe: { flex: 1, backgroundColor: colors.background },
		header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
		backBtn: { width: 40, height: 40, justifyContent: "center" },
		headerTitle: { fontFamily: "Inter-SemiBold", fontSize: 18, color: colors.textPrimary },
		content: { padding: 20 },
			heroCoin: { width: 120, height: 120, alignSelf: "center", marginBottom: 4 },
			coinImg: { width: 40, height: 40 },
		totalLabel: { fontFamily: "Inter-Medium", fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: 8 },
		total: { fontFamily: "Inter-Bold", fontSize: 40, color: colors.textPrimary, textAlign: "center", marginTop: 2 },
		disclaimer: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textTertiary, textAlign: "center", marginTop: 6 },
		section: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.textPrimary, marginTop: 28, marginBottom: 12 },
		assetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
		assetLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
		coinWrap: {},
		coinBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
		assetName: { fontFamily: "Inter-SemiBold", fontSize: 15, color: colors.textPrimary },
		assetSub: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textSecondary },
		assetVal: { fontFamily: "Inter-Bold", fontSize: 16, color: colors.textPrimary },
		empty: { backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: colors.border },
		emptyText: { fontFamily: "Inter-SemiBold", fontSize: 14, color: colors.textPrimary },
		emptySub: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: "center" },
	});
}
