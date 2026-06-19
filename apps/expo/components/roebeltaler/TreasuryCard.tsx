import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { getRoebelTalerBalance, formatTaler } from "@/lib/roebel-taler";
import { attesterSafeGnosisAddress } from "@/constants/gnosis";

/**
 * Stadtkasse (civic treasury) card — shows the treasury's Röbel Münzen holdings with
 * an INDICATIVE euro preview (Röbel Münzen is NOT euro-redeemable; the "ca. €" is an
 * orientation value only). Taps through to the full assets + transactions page.
 */
export default function TreasuryCard() {
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
		<Pressable style={styles.card} onPress={() => router.push("/treasury" as any)}>
			<View style={styles.row}>
				<View>
					<Text style={styles.label}>Stadtkasse</Text>
					{taler === null ? (
						<ActivityIndicator color={colors.primary} style={{ marginTop: 6, alignSelf: "flex-start" }} />
					) : (
						<>
							<Text style={styles.eur}>ca. {taler.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</Text>
							<Text style={styles.sub}>{taler.toLocaleString("de-DE")} Röbel Münzen</Text>
						</>
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
		sub: { fontFamily: "Inter-Regular", fontSize: 13, color: colors.textSecondary, marginTop: 1 },
		chevron: { fontFamily: "Inter-Regular", fontSize: 28, color: colors.textTertiary },
		hint: { fontFamily: "Inter-Regular", fontSize: 12, color: colors.textTertiary, marginTop: 10 },
	});
}
