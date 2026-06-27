// Gemeinschaftskasse (civic treasury) — centered € hero on a soft blue backdrop,
// with the balance + history in a white rounded sheet. EUR figures exclude Röbel
// Münzen (not redeemable). Counterparty addresses are never shown.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
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
import InfoIcon from "@/assets/icons/info.svg";
import Skeleton from "@/components/ui/Skeleton";
import TxHistoryList, { type TxHistoryItem } from "@/components/rewards/TxHistoryList";

const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEurUnit = (n: number) => `${fmtEur(n)}€`;

export default function TreasuryScreen() {
	const { colors, isDark } = useTheme();
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

	const styles = makeStyles(colors, isDark);

	// € fiat value of the treasury (xDAI→€ + EURe) — excludes Röbel Münzen.
	const euroFiat = assets ? assets.euroTotal - assets.roebel : 0;

	// Treasury history mapped to the shared list (€ badge); drop 0-value admin txs.
	const historyItems: TxHistoryItem[] = (txs ?? [])
		.filter((t) => t.direction !== "admin" && t.amount > 0)
		.map((t, i): TxHistoryItem => {
			const isIn = t.direction === "in";
			return {
				id: `${t.txHash || "tx"}-${i}`,
				direction: isIn ? "in" : "out",
				title: t.label,
				timestamp: t.timestamp,
				amountText: `${isIn ? "+ " : "− "}${fmtEur(t.amount)} €`,
				iconKind: "eur",
				txHash: t.txHash,
			};
		});

	return (
		<View style={styles.root}>
			<SafeAreaView style={styles.safe} edges={["top"]}>
				<View style={styles.header}>
					<Pressable
						onPress={() => router.back()}
						style={({ pressed }) => [styles.circleBtn, { opacity: pressed ? 0.6 : 1 }]}
						accessibilityRole="button"
						accessibilityLabel="Zurück"
					>
						<ChevronLeftIcon width={22} height={22} color={colors.textPrimary} />
					</Pressable>
					<Text style={styles.headerTitle}>Gemeinschaftskasse</Text>
					<Pressable
						onPress={() => router.push("/gemeinschaftskasse-info" as any)}
						style={({ pressed }) => [styles.circleBtn, { opacity: pressed ? 0.6 : 1 }]}
						accessibilityRole="button"
						accessibilityLabel="Wie funktioniert die Gemeinschaftskasse?"
					>
						<InfoIcon width={22} height={22} color={colors.textPrimary} />
					</Pressable>
				</View>

				<ScrollView
					style={styles.scroll}
					contentContainerStyle={styles.content}
					showsVerticalScrollIndicator={false}
				>
					{/* Centered € hero */}
					<View style={styles.hero}>
						<Text style={styles.heroLabel}>Gesamt Guthaben</Text>
						{assets === null ? (
							<Skeleton width={220} height={56} radius={12} style={{ marginTop: 10 }} />
						) : (
							<Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
								{fmtEurUnit(euroFiat)}
							</Text>
						)}
					</View>

					{/* White sheet — balance + history */}
					<View style={styles.sheet}>
						{assets === null ? (
							<View style={styles.assetRow}>
								<View style={styles.assetLeft}>
									<Skeleton width={44} height={44} radius={22} />
									<View style={{ gap: 6 }}>
										<Skeleton width={120} height={14} />
										<Skeleton width={80} height={11} />
									</View>
								</View>
								<Skeleton width={72} height={16} />
							</View>
						) : (
							<View style={styles.assetRow}>
								<View style={styles.assetLeft}>
									<View style={styles.tokenBadge}>
										<Text style={styles.tokenBadgeText}>€</Text>
									</View>
									<View>
										<Text style={styles.assetName}>EURO</Text>
										<Text style={styles.assetSub}>Euro-Guthaben</Text>
									</View>
								</View>
								<Text style={styles.assetVal}>{fmtEurUnit(euroFiat)}</Text>
							</View>
						)}

						<Text style={[styles.section, { marginTop: 28 }]}>Verlauf</Text>
						<TxHistoryList
							items={historyItems}
							loading={txs === null}
							emptyText="Noch keine Transaktionen."
							onPressTx={(item) =>
								router.push({
									pathname: "/transaction",
									params: {
										direction: item.direction,
										title: item.title,
										amountText: item.amountText,
										currency: "eur",
										timestamp: String(item.timestamp),
										...(item.txHash ? { txHash: item.txHash } : {}),
									},
								} as any)
							}
						/>
					</View>
				</ScrollView>
			</SafeAreaView>
		</View>
	);
}

function makeStyles(colors: any, isDark: boolean) {
	const backdrop = isDark ? colors.background : "#E4F2FF";
	const sheetBg = isDark ? colors.surface : "#FFFFFF";
	return StyleSheet.create({
		root: { flex: 1, backgroundColor: backdrop },
		safe: { flex: 1 },
		header: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			paddingHorizontal: 16,
			paddingVertical: 8,
		},
		circleBtn: {
			width: 40,
			height: 40,
			borderRadius: 999,
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)",
		},
		headerTitle: { fontFamily: 'MonaSansSemiCondensed-SemiBold', fontSize: 18, color: colors.textPrimary },
		scroll: { flex: 1 },
		content: { flexGrow: 1 },
		hero: { alignItems: "center", paddingTop: 28, paddingBottom: 36, paddingHorizontal: 24 },
		heroLabel: { fontFamily: "Inter-Medium", fontSize: 16, color: colors.textSecondary },
		heroValue: {
			fontFamily: "Inter-SemiBold",
			fontSize: 56,
			letterSpacing: -1.5,
			color: colors.textPrimary,
			marginTop: 6,
		},
		sheet: {
			flexGrow: 1,
			backgroundColor: sheetBg,
			borderTopLeftRadius: 28,
			borderTopRightRadius: 28,
			paddingHorizontal: 20,
			paddingTop: 22,
			paddingBottom: 40,
		},
		section: { fontFamily: "Inter-SemiBold", fontSize: 17, color: colors.textPrimary, marginBottom: 12 },
		assetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
		assetLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
		tokenBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
		tokenBadgeText: { fontFamily: "Inter-SemiBold", fontSize: 18, color: colors.primary },
		assetName: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.textPrimary },
		assetSub: { fontFamily: "Inter-Regular", fontSize: 13, color: colors.textSecondary },
		assetVal: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.textPrimary },
	});
}
