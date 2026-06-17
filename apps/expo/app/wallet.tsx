// Röbel-Taler wallet — send & receive the on-chain community currency (Gnosis,
// gasless). Repurposed from the old thirdweb Base wallet. Copy is "Röbel-Taler" only.
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useTheme } from "@/context/ThemeContext";
import { useSnackbar } from "@/context/SnackbarContext";
import { useRoebelTaler } from "@/hooks/useRoebelTaler";
import { formatTaler, parseTalerAmount } from "@/lib/roebel-taler";
import ChevronLeftIcon from "@/assets/icons/chevron-left.svg";

type Tab = "send" | "receive";

export default function WalletScreen() {
	const { colors } = useTheme();
	const router = useRouter();
	const { showSnackbar } = useSnackbar();
	const { balanceRaw, loading, sending, send, account } = useRoebelTaler();

	const [tab, setTab] = useState<Tab>("send");
	const [to, setTo] = useState("");
	const [amount, setAmount] = useState("");

	const address = account?.address ?? "";

	const onSend = useCallback(async () => {
		const value = parseTalerAmount(amount);
		const recipient = to.trim();
		if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
			Alert.alert("Empfänger fehlt", "Bitte gib eine gültige Empfänger-Adresse ein.");
			return;
		}
		if (value <= 0n) { Alert.alert("Betrag fehlt", "Bitte gib einen Betrag ein."); return; }
		if (value > balanceRaw) { Alert.alert("Zu wenig Guthaben", "Du hast nicht genug Röbel-Taler."); return; }
		try {
			await send(recipient, value);
			setTo(""); setAmount("");
			showSnackbar({ message: "Röbel-Taler gesendet" });
		} catch {
			showSnackbar({ message: "Senden fehlgeschlagen" });
		}
	}, [amount, to, balanceRaw, send, showSnackbar]);

	const copyAddress = useCallback(async () => {
		await Clipboard.setStringAsync(address);
		showSnackbar({ message: "Adresse kopiert" });
	}, [address, showSnackbar]);

	const styles = makeStyles(colors);

	return (
		<SafeAreaView style={styles.safe} edges={["top"]}>
			<View style={styles.header}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
				</Pressable>
				<Text style={styles.headerTitle}>Wallet</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={styles.content}>
				<Text style={styles.balanceLabel}>Dein Guthaben</Text>
				{loading ? (
					<ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
				) : (
					<Text style={styles.balanceValue}>{formatTaler(balanceRaw)} <Text style={styles.unit}>Röbel-Taler</Text></Text>
				)}

				<View style={styles.tabs}>
					<Pressable style={[styles.tab, tab === "send" && styles.tabActive]} onPress={() => setTab("send")}>
						<Text style={[styles.tabText, tab === "send" && styles.tabTextActive]}>Senden</Text>
					</Pressable>
					<Pressable style={[styles.tab, tab === "receive" && styles.tabActive]} onPress={() => setTab("receive")}>
						<Text style={[styles.tabText, tab === "receive" && styles.tabTextActive]}>Empfangen</Text>
					</Pressable>
				</View>

				{tab === "send" ? (
					<View style={styles.card}>
						<Text style={styles.fieldLabel}>Empfänger</Text>
						<TextInput
							style={styles.input}
							placeholder="0x… oder QR scannen"
							placeholderTextColor={colors.textTertiary}
							value={to}
							onChangeText={setTo}
							autoCapitalize="none"
							autoCorrect={false}
						/>
						<Text style={styles.fieldLabel}>Betrag</Text>
						<TextInput
							style={styles.input}
							placeholder="0,00"
							placeholderTextColor={colors.textTertiary}
							value={amount}
							onChangeText={setAmount}
							keyboardType="decimal-pad"
						/>
						<Pressable style={[styles.cta, sending && styles.ctaDisabled]} onPress={onSend} disabled={sending}>
							{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Senden</Text>}
						</Pressable>
					</View>
				) : (
					<View style={[styles.card, { alignItems: "center" }]}>
						<Text style={styles.fieldLabel}>Dein Röbel-Taler-Code</Text>
						{!!address && (
							<View style={styles.qrWrap}>
								<QRCode value={address} size={200} backgroundColor="#FFFFFF" color="#000000" />
							</View>
						)}
						<Pressable onPress={copyAddress} style={styles.copyBtn}>
							<Text style={styles.copyText}>Adresse kopieren</Text>
						</Pressable>
						<Text style={styles.receiveHint}>Lass diesen Code scannen, um Röbel-Taler zu empfangen.</Text>
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
		backBtn: { width: 40, height: 40, justifyContent: "center" },
		headerTitle: { fontFamily: "Inter-SemiBold", fontSize: 18, color: colors.textPrimary },
		content: { padding: 20, alignItems: "center" },
		balanceLabel: { fontFamily: "Inter-Medium", fontSize: 14, color: colors.textSecondary, marginTop: 8 },
		balanceValue: { fontFamily: "Inter-Bold", fontSize: 32, color: colors.textPrimary, marginTop: 2 },
		unit: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.primary },
		tabs: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, padding: 4, marginTop: 24, width: "100%" },
		tab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
		tabActive: { backgroundColor: colors.primary },
		tabText: { fontFamily: "Inter-SemiBold", fontSize: 15, color: colors.textSecondary },
		tabTextActive: { color: "#fff" },
		card: { width: "100%", backgroundColor: colors.card, borderRadius: 20, padding: 20, marginTop: 16, borderWidth: 1, borderColor: colors.border },
		fieldLabel: { fontFamily: "Inter-Medium", fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 8 },
		input: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontFamily: "Inter-Regular", fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
		cta: { marginTop: 20, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
		ctaDisabled: { opacity: 0.6 },
		ctaText: { fontFamily: "Inter-SemiBold", fontSize: 16, color: "#fff" },
		qrWrap: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 16, marginVertical: 16 },
		copyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
		copyText: { fontFamily: "Inter-SemiBold", fontSize: 14, color: colors.textPrimary },
		receiveHint: { fontFamily: "Inter-Regular", fontSize: 13, color: colors.textSecondary, marginTop: 14, textAlign: "center" },
	});
}
