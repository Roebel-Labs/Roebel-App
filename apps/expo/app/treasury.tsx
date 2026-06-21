// Stadtkasse (civic treasury) — REAL assets + transactions of the Attester Safe
// (xDAI + EURe + Röbel Münzen). EUR figures are INDICATIVE only (Röbel Münzen are
// not euro-redeemable). Counterparty addresses are never shown (no-wallet rule).
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import {
	getTreasuryAssets,
	getTreasuryTransactions,
	type TreasuryAssets,
	type TreasuryTx,
} from "@/lib/roebel-taler";
import { attesterSafeGnosisAddress } from "@/constants/gnosis";
import ChevronLeftIcon from "@/assets/icons/chevron-left.svg";
import Skeleton from "@/components/ui/Skeleton";

const COIN = require("../assets/illustration/taler/multiple.png");

const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) : "");

export default function TreasuryScreen() {
	const { colors } = useTheme();
	const router = useRouter();
	const [assets, setAssets] = useState<TreasuryAssets | null>(null);
	const [txs, setTxs] = useState<TreasuryTx[] | null>(null);

	useEffect(() => {
		let cancelled = false;
		getTreasuryAssets(attesterSafeGnosisAddress)
			.then((a) => { if (!cancelled) setAssets(a); })
			.catch(() => { if (!cancelled) setAssets({ roebel: 0, xdai: 0, eure: 0, euroTotal: 0 }); });
		getTreasuryTransactions(attesterSafeGnosisAddress)
			.then((t) => { if (!cancelled) setTxs(t); })
			.catch(() => { if (!cancelled) setTxs([]); });
		return () => { cancelled = true; };
	}, []);

	const styles = makeStyles(colors);

	const assetRows = assets
		? [
				{ key: "rt", name: "Röbel Münzen", sub: "Gemeinschaftswährung", value: Math.round(assets.roebel).toLocaleString("de-DE"), badge: "coin" as const },
				{ key: "xdai", name: "xDAI", sub: "Gnosis-Guthaben", value: fmtNum(assets.xdai), badge: "x" as const },
				{ key: "eure", name: "EURe", sub: "Euro-Guthaben", value: fmtNum(assets.eure), badge: "e" as const },
			]
		: [];

	return (
		<SafeAreaView style={styles.safe} edges={["top"]}>
			<View style={styles.header}>
				<Pressable
					onPress={() => router.back()}
					style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
					accessibilityRole="button"
					accessibilityLabel="Zurück"
				>
					<ChevronLeftIcon width={22} height={22} color={colors.textPrimary} />
				</Pressable>
				<Text style={styles.headerTitle}>Stadtkasse</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={styles.content}>
				<Image source={COIN} style={styles.heroCoin} resizeMode="contain" />
				<Text style={styles.totalLabel}>Gesamtwert (ca.)</Text>
				{assets === null ? (
					<Skeleton width={180} height={42} radius={12} style={{ alignSelf: "center", marginTop: 6 }} />
				) : (
					<Text style={styles.total}>{fmtEur(assets.euroTotal)} €</Text>
				)}
				<Text style={styles.disclaimer}>Orientierungswert — Röbel Münzen sind nicht in Euro auszahlbar.</Text>

				<Text style={styles.section}>Vermögenswerte</Text>
				{assets === null ? (
					<View style={{ gap: 10 }}>
						{[0, 1, 2].map((i) => (
							<View key={i} style={styles.assetRow}>
								<View style={styles.assetLeft}>
									<Skeleton width={40} height={40} radius={20} />
									<View style={{ gap: 6 }}>
										<Skeleton width={120} height={14} />
										<Skeleton width={80} height={11} />
									</View>
								</View>
								<Skeleton width={48} height={16} />
							</View>
						))}
					</View>
				) : (
					<View style={{ gap: 10 }}>
						{assetRows.map((a) => (
							<View key={a.key} style={styles.assetRow}>
								<View style={styles.assetLeft}>
									{a.badge === "coin" ? (
										<Image source={COIN} style={styles.coinImg} resizeMode="contain" />
									) : (
										<View style={styles.tokenBadge}>
											<Text style={styles.tokenBadgeText}>{a.badge === "x" ? "x" : "€"}</Text>
										</View>
									)}
									<View>
										<Text style={styles.assetName}>{a.name}</Text>
										<Text style={styles.assetSub}>{a.sub}</Text>
									</View>
								</View>
								<Text style={styles.assetVal}>{a.value}</Text>
							</View>
						))}
					</View>
				)}

				<Text style={styles.section}>Transaktionen</Text>
				{txs === null ? (
					<View style={{ gap: 10 }}>
						{[0, 1, 2].map((i) => (
							<View key={i} style={styles.txRow}>
								<View style={styles.txLeft}>
									<Skeleton width={36} height={36} radius={18} />
									<View style={{ gap: 6 }}>
										<Skeleton width={90} height={14} />
										<Skeleton width={56} height={11} />
									</View>
								</View>
								<Skeleton width={72} height={15} />
							</View>
						))}
					</View>
				) : txs.length === 0 ? (
					<View style={styles.empty}>
						<Text style={styles.emptyText}>Noch keine Transaktionen.</Text>
						<Text style={styles.emptySub}>Ein- und Ausgaben der Stadtkasse erscheinen hier.</Text>
					</View>
				) : (
					<View style={{ gap: 10 }}>
						{txs.map((t, i) => (
							<View key={i} style={styles.txRow}>
								<View style={styles.txLeft}>
									<View
										style={[
											styles.txIcon,
											{
												backgroundColor:
													t.direction === "in"
														? "rgba(34,197,94,0.14)"
														: t.direction === "out"
															? "rgba(239,68,68,0.14)"
															: colors.surface,
											},
										]}
									>
										<Text
											style={[
												styles.txArrow,
												{
													color:
														t.direction === "in"
															? "#16A34A"
															: t.direction === "out"
																? "#DC2626"
																: colors.textSecondary,
												},
											]}
										>
											{t.direction === "in" ? "↓" : t.direction === "out" ? "↑" : "•"}
										</Text>
									</View>
									<View>
										<Text style={styles.txLabel}>{t.label}</Text>
										<Text style={styles.txDate}>{fmtDate(t.timestamp)}</Text>
									</View>
								</View>
								{t.xdai > 0 && (
									<Text style={[styles.txVal, { color: t.direction === "in" ? "#16A34A" : colors.textPrimary }]}>
										{t.direction === "in" ? "+" : "−"}
										{fmtNum(t.xdai)} xDAI
									</Text>
								)}
							</View>
						))}
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

function makeStyles(colors: any) {
	return StyleSheet.create({
		safe: { flex: 1, backgroundColor: colors.background },
		header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
		backBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
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
		tokenBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
		tokenBadgeText: { fontFamily: "Inter-Bold", fontSize: 18, color: colors.primary },
		assetName: { fontFamily: "Inter-SemiBold", fontSize: 15, color: colors.textPrimary },
		assetSub: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textSecondary },
		assetVal: { fontFamily: "Inter-Bold", fontSize: 16, color: colors.textPrimary },
		txRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border },
		txLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
		txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
		txArrow: { fontFamily: "Inter-Bold", fontSize: 18 },
		txLabel: { fontFamily: "Inter-SemiBold", fontSize: 14, color: colors.textPrimary },
		txDate: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textSecondary },
		txVal: { fontFamily: "Inter-SemiBold", fontSize: 15 },
		empty: { backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: colors.border },
		emptyText: { fontFamily: "Inter-SemiBold", fontSize: 14, color: colors.textPrimary },
		emptySub: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: "center" },
	});
}
