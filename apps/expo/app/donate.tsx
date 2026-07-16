// Unterstützen-Screen: Beiträge in die Gemeinschaftskasse — per Karte
// (Stripe, in-app browser sheet), per Banküberweisung (Monerium-IBAN mit
// persönlichem Verwendungszweck-Code) oder onchain direkt an den Safe.
//
// Wording bewusst "Unterstützen"/"Beitrag", nicht "Spende": ohne
// gemeinnützigen Träger gibt es keine Spendenbescheinigung, und Stripe
// beschränkt Charity-Framing (docs/MONERIUM_FIAT_TREASURY_RESEARCH.md §5/§6).
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useActiveAccount } from "thirdweb/react";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "@/context/ThemeContext";
import ChevronLeftIcon from "@/assets/icons/chevron-left.svg";
import {
  fetchDonationConfig,
  fetchDonationReference,
  createDonationCheckout,
  openDonationCheckout,
  type DonationConfig,
} from "@/lib/donations";

const fmtEur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

const fmtIban = (iban: string) =>
  iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

export default function DonateScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const styles = makeStyles(colors);

  const [config, setConfig] = useState<DonationConfig | null | undefined>(undefined);
  const [selectedCents, setSelectedCents] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCrypto, setShowCrypto] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDonationConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config?.enabled) return;
    let cancelled = false;
    fetchDonationReference({ walletAddress: account?.address ?? null }).then((code) => {
      if (!cancelled) setReferenceCode(code);
    });
    return () => {
      cancelled = true;
    };
  }, [config?.enabled, account?.address]);

  const customCents = customAmount
    ? Math.round(parseFloat(customAmount.replace(",", ".")) * 100)
    : null;
  const effectiveCents =
    customCents && Number.isFinite(customCents) ? customCents : selectedCents;
  const amountValid =
    !!config?.enabled &&
    Number.isInteger(effectiveCents) &&
    effectiveCents >= config.min_cents &&
    effectiveCents <= config.max_cents;

  async function onPayWithCard() {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    try {
      const { url } = await createDonationCheckout({
        amountCents: effectiveCents,
        walletAddress: account?.address ?? null,
      });
      await openDonationCheckout(url);
      // Der Webhook verbucht den Beitrag; der Verlauf auf /treasury zeigt
      // die Ankunft in der Kasse, sobald die Stripe-Auszahlung mintet.
      router.replace("/treasury");
    } catch (err) {
      Alert.alert("Ups", err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(value: string, key: string) {
    await Clipboard.setStringAsync(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  const loading = config === undefined;
  const disabled = !loading && (!config || !config.enabled);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Unterstützen</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Dein Beitrag fließt direkt in die Gemeinschaftskasse — den offenen Topf,
          über den alle Bürgerinnen und Bürger gemeinsam entscheiden. Jeder Euro
          ist öffentlich sichtbar.
        </Text>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {disabled && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🌱  Bald verfügbar</Text>
            <Text style={styles.cardBody}>
              Die Möglichkeit, die Gemeinschaftskasse direkt zu unterstützen, wird
              gerade eingerichtet. Schau bald wieder vorbei!
            </Text>
          </View>
        )}

        {!loading && config?.enabled && (
          <>
            {/* Karte / Apple Pay / Google Pay */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💳  Mit Karte</Text>
              <Text style={styles.cardBody}>
                Kreditkarte, Apple Pay oder Google Pay — auch aus dem Ausland.
              </Text>

              <View style={styles.presetRow}>
                {config.presets_cents.map((cents) => {
                  const active = !customAmount && selectedCents === cents;
                  return (
                    <Pressable
                      key={cents}
                      onPress={() => {
                        setSelectedCents(cents);
                        setCustomAmount("");
                      }}
                      style={[styles.presetBtn, active && styles.presetBtnActive]}
                    >
                      <Text style={[styles.presetText, active && styles.presetTextActive]}>
                        {fmtEur(cents)} €
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Eigener Betrag in €"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                value={customAmount}
                onChangeText={setCustomAmount}
              />

              <Pressable
                onPress={onPayWithCard}
                disabled={!amountValid || submitting}
                style={[styles.primaryBtn, (!amountValid || submitting) && { opacity: 0.5 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {fmtEur(effectiveCents)} € beitragen
                  </Text>
                )}
              </Pressable>
              <Text style={styles.finePrint}>Sichere Zahlung über Stripe</Text>
            </View>

            {/* Banküberweisung */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🏦  Per Überweisung</Text>
              <Text style={styles.cardBody}>
                Ohne Gebühren von deinem Bankkonto. Mit Echtzeitüberweisung ist dein
                Beitrag in Sekunden in der Kasse.
              </Text>

              {config.recipient && (
                <DetailRow
                  colors={colors}
                  label="Empfänger"
                  value={config.recipient}
                  copied={copiedKey === "recipient"}
                  onCopy={() => copy(config.recipient!, "recipient")}
                />
              )}
              {config.iban && (
                <DetailRow
                  colors={colors}
                  label="IBAN"
                  value={fmtIban(config.iban)}
                  copied={copiedKey === "iban"}
                  onCopy={() => copy(config.iban!.replace(/\s+/g, ""), "iban")}
                />
              )}
              {config.bic && (
                <DetailRow
                  colors={colors}
                  label="BIC"
                  value={config.bic}
                  copied={copiedKey === "bic"}
                  onCopy={() => copy(config.bic!, "bic")}
                />
              )}
              {referenceCode && (
                <DetailRow
                  colors={colors}
                  label="Verwendungszweck"
                  value={referenceCode}
                  copied={copiedKey === "ref"}
                  onCopy={() => copy(referenceCode, "ref")}
                />
              )}

              <Text style={styles.finePrint}>
                Der Code im Verwendungszweck ordnet deinen Beitrag deinem Namen zu.
                Ohne Code erscheint er als „Anonym“.
              </Text>
            </View>

            {/* Onchain */}
            <View style={styles.card}>
              <Pressable onPress={() => setShowCrypto((v) => !v)} style={styles.cryptoToggle}>
                <Text style={styles.cardTitle}>🔗  Onchain</Text>
                <Text style={styles.cryptoChevron}>{showCrypto ? "−" : "+"}</Text>
              </Pressable>
              {showCrypto && (
                <>
                  <Text style={styles.cardBody}>
                    Für Krypto-Kenner: Sende EURe oder xDAI auf Gnosis Chain
                    (Chain-ID 100) direkt an die Gemeinschaftskasse.
                  </Text>
                  <DetailRow
                    colors={colors}
                    label="Adresse"
                    value={config.treasury_safe}
                    copied={copiedKey === "safe"}
                    onCopy={() => copy(config.treasury_safe, "safe")}
                    mono
                  />
                </>
              )}
            </View>
          </>
        )}

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Beiträge sind freiwillige Zuwendungen an das Gemeinschaftsprojekt.
            Eine steuerlich absetzbare Spendenbescheinigung können wir derzeit
            noch nicht ausstellen.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  colors,
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  mono?: boolean;
}) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.detailRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text
          style={[styles.detailValue, mono && { fontFamily: "GeistMono-Regular", fontSize: 12 }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Pressable onPress={onCopy} style={styles.copyBtn}>
        <Text style={styles.copyBtnText}>{copied ? "✓" : "Kopieren"}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    backBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontFamily: "MonaSansSemiCondensed-SemiBold", fontSize: 17, color: colors.textPrimary },
    content: { paddingHorizontal: 16, paddingBottom: 24 },
    lead: { fontFamily: "Inter-Regular", fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginBottom: 16 },
    loadingBox: { paddingVertical: 40, alignItems: "center" },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    cardTitle: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.textPrimary, marginBottom: 6 },
    cardBody: { fontFamily: "Inter-Regular", fontSize: 14, lineHeight: 21, color: colors.textSecondary, marginBottom: 12 },
    presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    presetBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.background,
    },
    presetBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    presetText: { fontFamily: "Inter-SemiBold", fontSize: 14, color: colors.textPrimary },
    presetTextActive: { color: colors.primaryForeground ?? "#FFFFFF" },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: "Inter-Regular",
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      marginBottom: 12,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: { fontFamily: "Inter-SemiBold", fontSize: 15, color: colors.primaryForeground ?? "#FFFFFF" },
    finePrint: { fontFamily: "Inter-Regular", fontSize: 11, lineHeight: 16, color: colors.textTertiary, marginTop: 10, textAlign: "center" },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      backgroundColor: colors.background,
    },
    detailLabel: { fontFamily: "Inter-Regular", fontSize: 11, color: colors.textTertiary, marginBottom: 2 },
    detailValue: { fontFamily: "Inter-SemiBold", fontSize: 14, color: colors.textPrimary },
    copyBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    copyBtnText: { fontFamily: "Inter-Medium", fontSize: 12, color: colors.textPrimary },
    cryptoToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cryptoChevron: { fontFamily: "Inter-SemiBold", fontSize: 18, color: colors.textSecondary },
    note: { marginTop: 4, padding: 14, borderRadius: 12, backgroundColor: colors.surface },
    noteText: { fontFamily: "Inter-Regular", fontSize: 12, lineHeight: 18, color: colors.textTertiary },
  });
}
