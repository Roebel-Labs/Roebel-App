// Info-/Erklärscreen: Was ist die Gemeinschaftskasse, wie entscheiden Bürger
// gemeinsam über das Geld, und die Vision. Bürgerfreundliches Deutsch, keine
// Krypto-/Blockchain-Fachbegriffe — nur die Idee, einfach erklärt.
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import ChevronLeftIcon from "@/assets/icons/chevron-left.svg";

export default function GemeinschaftskasseInfoScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Die Gemeinschaftskasse</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Die Gemeinschaftskasse ist das gemeinsame Vermögen von Röbel/Müritz — ein digitaler Topf,
          der allen Bürgerinnen und Bürgern gehört. Hier siehst du jederzeit, wie viel Geld da ist,
          wohin es fließt, und du entscheidest mit, wofür es genutzt wird.
        </Text>

        <Section colors={colors} title="Ein Topf für die ganze Stadt" emoji="🐷">
          Stell dir eine Kasse vor, in die jeder hineinschauen kann und über die alle gemeinsam
          bestimmen. Kein Geld verschwindet in Hinterzimmern — das Vermögen der Stadt liegt offen
          auf dem Tisch, für alle sichtbar.
        </Section>

        <Section colors={colors} title="Wer entscheidet über das Geld?" emoji="🗳️">
          Nicht eine Verwaltung allein — ihr alle. Jeder verifizierte Bürger kann Vorschläge machen,
          wofür Geld verwendet wird: ein Stadtfest, eine neue Parkbank, Unterstützung für einen
          Verein. Über jeden Vorschlag stimmt die Gemeinschaft gemeinsam ab.
        </Section>

        <Section colors={colors} title="So einfach läuft eine Entscheidung" emoji="📝">
          1. Jemand macht einen Vorschlag.{"\n"}
          2. Alle können ihn lesen und besprechen.{"\n"}
          3. Es wird abgestimmt — eine Stimme pro Bürger, fair und gleich.{"\n"}
          4. Gibt es genug Zustimmung, wird das Geld aus der Gemeinschaftskasse freigegeben.
        </Section>

        <Section colors={colors} title="Deine Stimme bleibt geheim" emoji="🔒">
          Niemand kann sehen, wofür du gestimmt hast. Und trotzdem ist jede Abstimmung nachprüfbar
          und lässt sich nicht manipulieren. So kannst du frei und ohne Druck entscheiden.
        </Section>

        <Section colors={colors} title="Alles ist transparent" emoji="🔍">
          Jeder Euro in der Gemeinschaftskasse ist öffentlich einsehbar — der aktuelle Stand und
          jede einzelne Bewegung. So weiß jeder immer, woran er ist. Vertrauen entsteht durch
          Offenheit, nicht durch Versprechen.
        </Section>

        <Section colors={colors} title="Warum machen wir das?" emoji="💡">
          Wir wollen, dass Menschen vor Ort echte Mitsprache über echtes Geld haben — direkt,
          unkompliziert und ohne Umwege. Geld der Stadt soll dort wirken, wo wir leben, und das
          Miteinander stärken.
        </Section>

        <Section colors={colors} title="Die Vision" emoji="🌍">
          Die Gemeinschaftskasse ist eines der ersten Experimente überhaupt, in dem eine echte
          Kleinstadt digital und gemeinschaftlich über ihr eigenes Geld entscheidet. Röbel macht
          den Anfang — als Vorlage für viele weitere Orte. Wir erfinden gerade gemeinsam, wie
          lokale Demokratie im digitalen Zeitalter aussehen kann: Entscheidungen von vielen, statt
          von wenigen.
        </Section>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Hinweis: Die Gemeinschaftskasse ist ein offenes Experiment. Der angezeigte Euro-Betrag
            ist ein Orientierungswert. Wir lernen gemeinsam dazu und entwickeln die Spielregeln
            Schritt für Schritt weiter.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  colors,
  title,
  emoji,
  children,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {emoji}  {title}
      </Text>
      <Text style={styles.cardBody}>{children}</Text>
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
    headerTitle: { fontFamily: 'MonaSansSemiCondensed-SemiBold', fontSize: 17, color: colors.textPrimary },
    content: { paddingHorizontal: 16, paddingBottom: 24 },
    lead: { fontFamily: "Inter-Regular", fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginBottom: 16 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    cardTitle: { fontFamily: "Inter-SemiBold", fontSize: 16, color: colors.textPrimary, marginBottom: 6 },
    cardBody: { fontFamily: "Inter-Regular", fontSize: 14, lineHeight: 21, color: colors.textSecondary },
    note: { marginTop: 4, padding: 14, borderRadius: 12, backgroundColor: colors.surface },
    noteText: { fontFamily: "Inter-Regular", fontSize: 12, lineHeight: 18, color: colors.textTertiary },
  });
}
