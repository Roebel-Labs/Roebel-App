// Gemeinschaftskasse (civic treasury) — the shared collapsing detail layout:
// a soft-blue hero with the € total, an "Unterstützen" pill and the community
// garden illustration, round glass buttons (back + info) that lose their glass
// as the hero collapses, and a white sheet with two short lists (Spenden =
// inflows, Bezahlte Aufgaben = outflows). Each list's chevron opens the full,
// day-grouped history in a BottomDrawer (the page shrinks back behind it).
// EUR figures exclude Röbel Münzen (not redeemable). Counterparty addresses
// are never shown.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { fontFamily } from "@/constants/theme";
import {
	getTreasuryAssets,
	getTreasuryHistory,
	treasuryAssetsFallback,
	treasuryAssetsFromApi,
	treasuryHistoryFromApi,
	type TreasuryAssets,
	type TreasuryTx,
} from "@/lib/roebel-taler";
import { loadTreasuryProgressive } from "@/lib/treasury-api";
import { TREASURY_SNAPSHOT } from "@/constants/treasury-snapshot";
import {
	fetchTreasuryHistoryBalancingTx,
	fetchTreasuryHistoryHiddenTxs,
} from "@/lib/supabase-app-settings";
import { curateTreasuryHistory, toCents } from "@/lib/treasury-history";
import { attesterSafeGnosisAddress } from "@/constants/gnosis";
import InfoIcon from "@/assets/icons/info.svg";
import CircleArrowDownIcon from "@/assets/icons/circle-arrow-down-02.svg";
import CircleArrowUpIcon from "@/assets/icons/circle-arrow-up-02.svg";
import Skeleton from "@/components/ui/Skeleton";
import BottomDrawer from "@/components/BottomDrawer";
import CollapsingHeroScreen from "@/components/detail/CollapsingHeroScreen";
import { DETAIL_HEADER_BAR } from "@/components/detail/collapseRanges";
import TxHistoryList, { type TxHistoryItem } from "@/components/rewards/TxHistoryList";

const HERO_ILLUSTRATION = require("@/assets/illustration/weather/donations_hero.png");
/** donations_hero.png is 1488 × 818 (transparent sky, people + plants at the bottom). */
const ILLU_ASPECT = 1488 / 818;
/** The illustration is drawn a little wider than the screen so the edge figures crop like the design. */
const ILLU_OVERSCAN = 1.08;
/** Hero text block below the header bar: label + number + pill. */
const HERO_TEXT_BLOCK = 196;
/** Free illustration band under the pill (plants + feet). */
const HERO_GARDEN_BAND = 150;
const SHEET_OVERLAP = 24;
/** Rows per section on the page; the chevron opens the rest. */
const PREVIEW_ROWS = 3;

/** Give up on the chain after this and show the snapshot rather than a spinner. */
const LOAD_TIMEOUT_MS = 20000;

const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEurUnit = (n: number) => `${fmtEur(n)}€`;

type Section = "in" | "out";

export default function TreasuryScreen() {
	const { colors, isDark } = useTheme();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const [assets, setAssets] = useState<TreasuryAssets | null>(null);
	const [txs, setTxs] = useState<TreasuryTx[] | null>(null);
	// true = rows came from /api/treasury, already curated + balanced server-side.
	const [serverCurated, setServerCurated] = useState(false);
	const [curation, setCuration] = useState<{ hidden: string[]; balancingTx: string | null }>({
		hidden: [],
		balancingTx: null,
	});
	const [openSection, setOpenSection] = useState<Section | null>(null);

	// Fast first paint, like the proposal page: the on-device cache and the
	// Supabase snapshot (`treasury_snapshot`, written by /api/treasury) render
	// right away; the route's answer replaces them when it differs. Only when
	// none of them has a payload do the on-device chain fallbacks run — raced
	// against a deadline (RN fetch has no timeout of its own), falling back to
	// the dated snapshot instead of 0 €.
	useEffect(() => {
		let cancelled = false;
		const deadline = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
			Promise.race([
				p,
				new Promise<T>((resolve) => setTimeout(() => resolve(fallback), LOAD_TIMEOUT_MS)),
			]).catch(() => fallback);

		const runChainFallback = (needAssets: boolean) => {
			if (needAssets) {
				deadline(getTreasuryAssets(attesterSafeGnosisAddress, { skipApi: true }), treasuryAssetsFallback())
					.then((a) => { if (!cancelled) setAssets(a); });
			}
			// Only the on-device history needs the curation settings, read under
			// the same deadline; a failed/slow read just means no curation.
			deadline(
				getTreasuryHistory(attesterSafeGnosisAddress, { skipApi: true }),
				{ rows: [] as TreasuryTx[], curated: false },
			).then(async (h) => {
				if (cancelled) return;
				const [hidden, balancingTx] = await Promise.all([
					deadline(fetchTreasuryHistoryHiddenTxs(), [] as string[]),
					deadline(fetchTreasuryHistoryBalancingTx(), null as string | null),
				]);
				if (cancelled) return;
				setCuration({ hidden, balancingTx });
				setServerCurated(false);
				setTxs(h.rows);
			});
		};

		loadTreasuryProgressive((api) => {
			if (cancelled) return;
			setAssets(treasuryAssetsFromApi(api));
			if (api.historyAvailable) {
				setServerCurated(true);
				setTxs(treasuryHistoryFromApi(api));
			}
		})
			.catch(() => null)
			.then((final) => {
				if (cancelled) return;
				if (!final) runChainFallback(true);
				else if (!final.historyAvailable) runChainFallback(false);
			});
		return () => { cancelled = true; };
	}, []);

	const styles = makeStyles(colors, isDark);

	// € fiat value of the treasury (live xDAI × today's rate + EURe) — euroTotal
	// already excludes Röbel Münzen (not euro-redeemable). Whole cents, so the
	// balanced history below sums to exactly this figure.
	const euroFiat = assets ? toCents(assets.euroTotal) / 100 : 0;

	// Drop 0-value admin txs and hidden txs, and let the balancing row absorb
	// the gap to the live total (only when the total IS live — never against
	// the snapshot).
	const baseRows = (txs ?? []).filter(
		(t): t is TreasuryTx & { direction: "in" | "out" } => t.direction !== "admin" && t.amount > 0,
	);
	const liveTotal = assets && !assets.fromSnapshot ? assets.euroTotal : null;
	const shownRows = serverCurated
		? baseRows
		: curateTreasuryHistory(baseRows, {
				hidden: curation.hidden,
				balancingTx: curation.balancingTx,
				liveTotal,
			});
	const historyItems: TxHistoryItem[] = shownRows.map((t, i): TxHistoryItem => {
		const isIn = t.direction === "in";
		const link = t.link ?? null;
		return {
			id: `${t.txHash || "tx"}-${i}`,
			direction: isIn ? "in" : "out",
			title: t.label,
			timestamp: t.timestamp,
			amountText: `${isIn ? "+ " : "− "}${fmtEur(t.amount)} €`,
			iconKind: "eur",
			txHash: t.txHash,
			// Outflows → the Bürgerumfrage that decided them; inflows → the post
			// that announced them (treasury_tx_links, server-side).
			link: link
				? {
						label: link.type === "proposal" ? "Zur Bürgerumfrage ›" : "Zum Beitrag ›",
						accessibilityLabel: `${link.type === "proposal" ? "Zur Bürgerumfrage" : "Zum Beitrag"}: ${link.title}`,
						onPress: () => {
							setOpenSection(null);
							router.push(
								(link.type === "proposal"
									? `/proposal/${encodeURIComponent(link.id)}`
									: `/post/${encodeURIComponent(link.id)}`) as any,
							);
						},
					}
				: undefined,
			proofUrl: t.txHash ? `https://gnosisscan.io/tx/${t.txHash}` : undefined,
		};
	});
	const donations = historyItems.filter((i) => i.direction === "in");
	const payouts = historyItems.filter((i) => i.direction === "out");
	const loading = txs === null || assets === null;

	const openTx = (item: TxHistoryItem) => {
		setOpenSection(null);
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
		} as any);
	};

	const heroHeight = insets.top + DETAIL_HEADER_BAR + HERO_TEXT_BLOCK + HERO_GARDEN_BAND;
	const illuWidth = width * ILLU_OVERSCAN;
	const illuHeight = illuWidth / ILLU_ASPECT;

	const renderHero = () => (
		<View style={[StyleSheet.absoluteFill, styles.heroBg]}>
			<Image
				source={HERO_ILLUSTRATION}
				style={[
					styles.illustration,
					{
						width: illuWidth,
						height: illuHeight,
						left: (width - illuWidth) / 2,
						bottom: SHEET_OVERLAP - 6,
					},
				]}
				contentFit="contain"
				accessibilityIgnoresInvertColors
				accessible={false}
			/>
			<View style={[styles.heroTitleBar, { marginTop: insets.top }]}>
				<Text style={styles.heroTitle} numberOfLines={1}>Gemeinschaftskasse</Text>
			</View>
			<View style={styles.heroText}>
				<Text style={styles.heroLabel}>Gesamt Guthaben</Text>
				{assets === null ? (
					<Skeleton width={230} height={64} radius={14} style={{ marginTop: 8 }} />
				) : (
					<Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
						{fmtEurUnit(euroFiat)}
					</Text>
				)}
				{assets?.fromSnapshot ? (
					<Text style={styles.heroNote}>Stand: {TREASURY_SNAPSHOT.asOfLabel}</Text>
				) : null}
				<Pressable
					onPress={() => {
						Haptics.selectionAsync().catch(() => {});
						router.push("/donate" as any);
					}}
					style={({ pressed }) => [styles.supportBtn, pressed && { transform: [{ scale: 0.96 }], opacity: 0.9 }]}
					accessibilityRole="button"
					accessibilityLabel="Die Gemeinschaftskasse unterstützen"
				>
					<Text style={styles.supportBtnText}>Unterstützen</Text>
				</Pressable>
			</View>
		</View>
	);

	return (
		<>
			<CollapsingHeroScreen
				heroHeight={heroHeight}
				renderHero={renderHero}
				heroBackgroundColor={colors.primaryLight}
				title="Gemeinschaftskasse"
				onBack={() => router.back()}
				actions={[
					{
						key: "info",
						accessibilityLabel: "Wie funktioniert die Gemeinschaftskasse?",
						onPress: () => router.push("/gemeinschaftskasse-info" as any),
						renderIcon: (c) => <InfoIcon width={22} height={22} color={c} />,
					},
				]}
				sheetOverlap={SHEET_OVERLAP}
				sheetColor={colors.sheet}
				backgroundColor={colors.sheet}
				sheetStyle={styles.sheet}
			>
				<SectionBlock
					title="Spenden"
					items={donations}
					loading={loading}
					emptyText="Noch keine Spenden."
					onOpenAll={() => setOpenSection("in")}
					onPressTx={openTx}
				/>
				<SectionBlock
					title="Bezahlte Aufgaben"
					items={payouts}
					loading={loading}
					emptyText="Noch keine Auszahlungen."
					onOpenAll={() => setOpenSection("out")}
					onPressTx={openTx}
				/>

				{/* Onchain-Nachweis: the Safe on the explorer (balance + every tx).
				    Never print the address itself — only the link. */}
				<View style={styles.proof}>
					<Text style={styles.proofLabel}>Onchain-Nachweis</Text>
					<Pressable
						onPress={() => Linking.openURL(`https://gnosisscan.io/address/${attesterSafeGnosisAddress}`)}
						hitSlop={8}
						accessibilityRole="link"
						accessibilityLabel="Konto und Guthaben öffentlich prüfen"
					>
						<Text style={styles.proofLink}>Konto & Guthaben öffentlich prüfen ↗</Text>
					</Pressable>
				</View>
			</CollapsingHeroScreen>

			<BottomDrawer
				visible={openSection !== null}
				onClose={() => setOpenSection(null)}
				snapPoint={0.86}
				contentPaddingHorizontal={20}
			>
				<Text style={styles.drawerTitle}>{openSection === "out" ? "Bezahlte Aufgaben" : "Spenden"}</Text>
				<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
					<TxHistoryList
						items={openSection === "out" ? payouts : donations}
						loading={loading}
						emptyText={openSection === "out" ? "Noch keine Auszahlungen." : "Noch keine Spenden."}
						onPressTx={openTx}
					/>
				</ScrollView>
			</BottomDrawer>
		</>
	);
}

/** Section title + chevron, then the latest rows in the large design. */
function SectionBlock({
	title,
	items,
	loading,
	emptyText,
	onOpenAll,
	onPressTx,
}: {
	title: string;
	items: TxHistoryItem[];
	loading: boolean;
	emptyText: string;
	onOpenAll: () => void;
	onPressTx: (item: TxHistoryItem) => void;
}) {
	const { colors, isDark } = useTheme();
	const styles = makeStyles(colors, isDark);
	const canOpen = !loading && items.length > 0;
	return (
		<View style={styles.section}>
			<Pressable
				onPress={canOpen ? onOpenAll : undefined}
				disabled={!canOpen}
				style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.6 }]}
				accessibilityRole="button"
				accessibilityLabel={`Alle ${title} ansehen`}
			>
				<Text style={styles.sectionTitle}>{title}</Text>
				{canOpen ? <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} /> : null}
			</Pressable>
			{loading ? (
				<View style={{ gap: 18 }}>
					{[0, 1, 2].map((i) => (
						<View key={i} style={styles.row}>
							<Skeleton width={56} height={56} radius={28} />
							<View style={{ flex: 1, gap: 8 }}>
								<Skeleton width={110} height={16} />
								<Skeleton width={150} height={12} />
							</View>
							<Skeleton width={70} height={18} />
						</View>
					))}
				</View>
			) : items.length === 0 ? (
				<Text style={styles.empty}>{emptyText}</Text>
			) : (
				<View style={{ gap: 6 }}>
					{items.slice(0, PREVIEW_ROWS).map((tx) => (
						<TreasuryRow key={tx.id} tx={tx} onPress={() => onPressTx(tx)} />
					))}
				</View>
			)}
		</View>
	);
}

/** One large history row: € badge with direction dot, title, links, amount. */
function TreasuryRow({ tx, onPress }: { tx: TxHistoryItem; onPress: () => void }) {
	const { colors, isDark } = useTheme();
	const styles = makeStyles(colors, isDark);
	const isIn = tx.direction === "in";
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
			accessibilityRole="button"
			accessibilityLabel={`${tx.title}, ${tx.amountText} — Transaktionsdetails ansehen`}
		>
			<View style={styles.badgeWrap}>
				<View style={styles.eurBadge}>
					<Text style={styles.eurBadgeText}>€</Text>
				</View>
				<View style={[styles.dirDot, { backgroundColor: isIn ? "#22C55E" : "#2563EB" }]}>
					{isIn ? <CircleArrowDownIcon width={14} height={14} /> : <CircleArrowUpIcon width={14} height={14} />}
				</View>
			</View>
			<View style={{ flex: 1, minWidth: 0 }}>
				<Text style={styles.rowTitle} numberOfLines={1}>{tx.title}</Text>
				<View style={styles.rowLinks}>
					{tx.link ? (
						<Pressable
							onPress={tx.link.onPress}
							hitSlop={6}
							accessibilityRole="link"
							accessibilityLabel={tx.link.accessibilityLabel ?? tx.link.label}
							style={{ flexShrink: 1 }}
						>
							<Text style={styles.rowLink} numberOfLines={1}>{tx.link.label}</Text>
						</Pressable>
					) : null}
					{tx.proofUrl ? (
						<Pressable
							onPress={() => {
								const url = tx.proofUrl;
								if (url) Linking.openURL(url);
							}}
							hitSlop={6}
							accessibilityRole="link"
							accessibilityLabel="Beleg der Transaktion öffnen"
						>
							<Text style={styles.rowProof}>Beleg ↗</Text>
						</Pressable>
					) : null}
					{!tx.link && !tx.proofUrl && tx.timestamp ? (
						<Text style={styles.rowProof}>
							{new Date(tx.timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
						</Text>
					) : null}
				</View>
			</View>
			<Text style={styles.rowAmount}>{tx.amountText}</Text>
		</Pressable>
	);
}

function makeStyles(colors: any, isDark: boolean) {
	return StyleSheet.create({
		heroBg: { backgroundColor: colors.primaryLight },
		illustration: { position: "absolute" },
		heroTitleBar: { height: DETAIL_HEADER_BAR, alignItems: "center", justifyContent: "center", paddingHorizontal: 80 },
		heroTitle: { fontFamily: fontFamily.semiBold, fontSize: 19, color: colors.textPrimary },
		heroText: { alignItems: "center", paddingHorizontal: 24, paddingTop: 14 },
		heroLabel: { fontFamily: fontFamily.medium, fontSize: 18, color: colors.textSecondary },
		heroValue: {
			fontFamily: fontFamily.bold,
			fontSize: 66,
			lineHeight: 76,
			letterSpacing: -2.5,
			color: colors.textPrimary,
			marginTop: 2,
		},
		heroNote: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
		supportBtn: {
			marginTop: 14,
			backgroundColor: colors.textPrimary,
			borderRadius: 999,
			paddingHorizontal: 34,
			height: 52,
			alignItems: "center",
			justifyContent: "center",
		},
		supportBtnText: { fontFamily: fontFamily.semiBold, fontSize: 17, color: isDark ? "#000000" : "#FFFFFF" },
		sheet: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 48 },
		section: { marginBottom: 30 },
		sectionHeader: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			marginBottom: 12,
			minHeight: 36,
		},
		sectionTitle: { fontFamily: fontFamily.heading, fontSize: 26, letterSpacing: -0.4, color: colors.textPrimary },
		empty: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary, paddingVertical: 8 },
		row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 },
		badgeWrap: { width: 56, height: 56 },
		eurBadge: {
			width: 56,
			height: 56,
			borderRadius: 28,
			backgroundColor: colors.primaryLight,
			alignItems: "center",
			justifyContent: "center",
		},
		eurBadgeText: { fontFamily: fontFamily.bold, fontSize: 24, color: colors.primary },
		dirDot: {
			position: "absolute",
			right: -3,
			bottom: -3,
			width: 22,
			height: 22,
			borderRadius: 11,
			borderWidth: 2,
			borderColor: colors.sheet,
			alignItems: "center",
			justifyContent: "center",
		},
		rowTitle: { fontFamily: fontFamily.semiBold, fontSize: 18, color: colors.textPrimary },
		rowLinks: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 3 },
		rowLink: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.primary },
		rowProof: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
		rowAmount: { fontFamily: fontFamily.semiBold, fontSize: 18, color: colors.textPrimary },
		proof: { marginTop: 4, alignItems: "center", gap: 2 },
		proofLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textTertiary, letterSpacing: 0.3 },
		proofLink: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, textDecorationLine: "underline" },
		drawerTitle: { fontFamily: fontFamily.heading, fontSize: 22, color: colors.textPrimary, marginBottom: 12 },
	});
}
