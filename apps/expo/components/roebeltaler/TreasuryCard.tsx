import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { watchTreasuryEuro } from "@/lib/roebel-taler";
import { attesterSafeGnosisAddress } from "@/constants/gnosis";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Stadtkasse card — shows the civic Safe's fiat holdings (native xDAI live-
 * converted to € + EURe) as one exact euro figure, matching the treasury
 * details page. Röbel Münzen are excluded (not euro-redeemable). Taps through
 * to the full assets + transactions page.
 */
export default function TreasuryCard() {
	const { colors } = useTheme();
	const router = useRouter();
	const [euro, setEuro] = useState<number | null>(null);

	useEffect(() => {
		// Snapshot-first (cache → Supabase → route → chain); the skeleton stays
		// until the first real figure, never a 0 € placeholder.
		return watchTreasuryEuro(attesterSafeGnosisAddress, setEuro);
	}, []);

	const styles = makeStyles(colors);

	return (
		<Pressable style={styles.card} onPress={() => router.push("/treasury" as any)}>
			<View style={styles.row}>
				<View>
					<Text style={styles.label}>Gemeinschaftskasse</Text>
					{euro === null ? (
						<Skeleton width={130} height={28} radius={8} style={{ marginTop: 6 }} />
					) : (
						<Text style={styles.eur}>
							{euro.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
						</Text>
					)}
				</View>
				<Text style={styles.chevron}>›</Text>
			</View>
			<Text style={styles.hint}>Alle Vermögenswerte & Transaktionen ansehen</Text>
		</Pressable>
	);
}

function makeStyles(colors: any) {
	return StyleSheet.create({
		card: { marginTop: 16, backgroundColor: colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border },
		row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
		label: { fontFamily: "Inter-Medium", fontSize: 14, color: colors.textSecondary },
		eur: { fontFamily: "Inter-Bold", fontSize: 26, color: colors.textPrimary, marginTop: 2 },
		chevron: { fontFamily: "Inter-Regular", fontSize: 28, color: colors.textTertiary },
		hint: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textTertiary, marginTop: 10 },
	});
}
