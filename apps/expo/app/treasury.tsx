// Stadtkasse (civic treasury) — mirrors the rewards screen: gradient background, a
// € hero (no streak), and the assets + history wrapped in soft cards. EUR figures
// exclude Röbel Münzen (not redeemable). Counterparty addresses are never shown.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { softShadow } from "@/lib/shadow";
import {
	getTreasuryAssets,
	getTreasuryTransactions,
	type TreasuryAssets,
	type TreasuryTx,
} from "@/lib/roebel-taler";
import { attesterSafeGnosisAddress } from "@/constants/gnosis";
import ChevronLeftIcon from "@/assets/icons/chevron-left.svg";
import Skeleton from "@/components/ui/Skeleton";
import CoinBalanceHero from "@/components/rewards/CoinBalanceHero";
import TxHistoryList, { type TxHistoryItem } from "@/components/rewards/TxHistoryList";

const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
	const gradientColors: readonly [string, string] = isDark ? ["#1a2335", "#202124"] : ["#E4F2FF", "#FFFFFF"];

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
		<LinearGradient colors={gradientColors} style={styles.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
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

				<ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
					<View style={styles.heroBleed}>
						<CoinBalanceHero
							verified={null}
							label="Stadtkasse"
							valueText={`${fmtEur(euroFiat)} €`}
							loading={assets === null}
							balance={0}
						/>
					</View>

					<Text style={styles.section}>Guthaben</Text>
					<View style={[styles.card, softShadow(2, isDark)]}>
						{assets === null ? (
							<View style={styles.assetRow}>
								<View style={styles.assetLeft}>
									<Skeleton width={40} height={40} radius={20} />
									<View style={{ gap: 6 }}>
										<Skeleton width={120} height={14} />
										<Skeleton width={80} height={11} />
									</View>
								</View>
								<Skeleton width={64} height={16} />
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
								<Text style={styles.assetVal}>{fmtEur(euroFiat)} €</Text>
							</View>
						)}
					</View>

					<Text style={styles.section}>Verlauf</Text>
					<View style={[styles.card, softShadow(2, isDark)]}>
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
		</LinearGradient>
	);
}

function makeStyles(colors: any, isDark: boolean) {
	return StyleSheet.create({
		gradient: { flex: 1 },
		safe: { flex: 1 },
		header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
		backBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
		headerTitle: { fontFamily: "Inter-SemiBold", fontSize: 18, color: colors.textPrimary },
		content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
		heroBleed: { marginHorizontal: -16 },
		section: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.textPrimary, marginTop: 28, marginBottom: 12 },
		card: { backgroundColor: isDark ? colors.surface : "#FFFFFF", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
		assetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
		assetLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
		tokenBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
		tokenBadgeText: { fontFamily: "Inter-Bold", fontSize: 18, color: colors.primary },
		assetName: { fontFamily: "Inter-SemiBold", fontSize: 15, color: colors.textPrimary },
		assetSub: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textSecondary },
		assetVal: { fontFamily: "Inter-Bold", fontSize: 16, color: colors.textPrimary },
	});
}
