// Info screen: what Röbel Münzen are, how they work, and the vision.
// Citizen-friendly German, no crypto jargon. Wording rule: always "Röbel Münzen", described as the
// town's thank-you for belonging and taking part; never "Währung", "Geld" or "Bürgergeld".
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import ChevronLeftIcon from "@/assets/icons/chevron-left.svg";
import WeeklyEarnedChart from "@/components/roebeltaler/WeeklyEarnedChart";
import { useRoebelTalerWeekly } from "@/hooks/useRoebelTalerWeekly";

export default function RoebelTalerInfoScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const weekly = useRoebelTalerWeekly();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Was ist Röbel Münzen?</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Röbel Münzen sind Röbels Dankeschön fürs Dabeisein und Mitmachen, von Bürgern für
          Bürger. Sie sollen das Miteinander stärken: mehr Leben in Geschäften und Vereinen, mehr
          Menschen bei Veranstaltungen, mehr Stimmen, wenn es um unsere Stadt geht.
        </Text>

        <View style={{ marginBottom: 16 }}>
          <WeeklyEarnedChart points={weekly.points} labels={weekly.labels} changePct={weekly.changePct} />
        </View>

        <Section colors={colors} title="Wer kann mitmachen?" emoji="🪪">
          Nur verifizierte Bürger. Deine Bürger-Verifizierung ist dein Schlüssel — nur wer als
          echter Röbeler bestätigt ist, kann Röbel Münzen erzeugen. Das macht sie
          fälschungssicher: keine Bots, keine Fake-Konten.
        </Section>

        <Section colors={colors} title="Wie entstehen Röbel Münzen?" emoji="⏳">
          Als verifizierter Bürger erzeugst du laufend neue Röbel Münzen — ca. 1 pro Stunde, also
          rund 24 am Tag. Mit „Heute abholen“ sammelst du sie ein. Niemand teilt sie zu: jeder
          Mensch erzeugt seinen eigenen, gleichen Anteil.
        </Section>

        <Section colors={colors} title="Gemeinsame Münzen für alle (die Gruppe)" emoji="👥">
          Damit alle dieselben Münzen nutzen, bringen die Bürger ihre persönlichen Münzen in eine
          gemeinsame Gruppe ein. Daraus entstehen die einheitlichen Röbel Münzen, die alle annehmen
          können. Deine eingebrachten Münzen stehen hinter den gemeinsamen Röbel Münzen;
          zurücktauschen lassen sie sich nicht. Mitglied der Gruppe sind ausschließlich verifizierte
          Bürger. Deshalb gehören Röbel Münzen wirklich den Röbelern und können nicht von
          Außenstehenden erzeugt werden.
        </Section>

        <Section colors={colors} title="Wie kommen neue Bürger dazu?" emoji="🤲">
          Von Mensch zu Mensch. Wer schon Röbel Münzen sammelt, lädt unter „Belohnungen“ →
          „Nachbarn einladen“ die Nächsten ein und steht mit seinem Wort dafür ein, dass es ein
          echter Mensch aus Röbel ist. Eine Einladung kostet 96 eigene Münzen (etwa vier Tage
          Abholen), die dafür vorher angespart werden. Wer eingeladen wird, startet mit 48 Münzen.
          So wächst der Kreis durch Vertrauen statt durch Formulare, und Fake-Konten lohnen sich nicht.
        </Section>

        <Section colors={colors} title="Warum schrumpft mein Guthaben?" emoji="🌊">
          Röbel Münzen werden ganz langsam weniger, wenn sie nur liegen bleiben (etwa 7 % im
          Jahr). Das ist Absicht: Sie sollen genutzt werden, nicht gehortet. So bleiben sie in
          Bewegung und in der Stadt. Wer aktiv ist, merkt davon praktisch nichts.
        </Section>

        <Section colors={colors} title="Weitergeben & einlösen" emoji="🤝">
          Du kannst Röbel Münzen schon heute an andere Bürger weitergeben: als Dankeschön, fürs
          Helfen, für gute Arbeit. Schritt für Schritt sollen lokale Geschäfte und Vereine sie
          annehmen. So bleibt in Röbel, was in Röbel entsteht.
        </Section>

        <Section colors={colors} title="Öffentlich & nachprüfbar" emoji="🔍">
          Röbel Münzen läuft auf einer offenen, öffentlichen Infrastruktur (Gnosis). Jede Münze und
          jede Weitergabe ist für alle überprüfbar. Niemand kann heimlich Münzen erzeugen. Das
          schafft Vertrauen ohne zentrale Kontrolle.
        </Section>

        <Section colors={colors} title="Die Vision: ein Netzwerk von Städten" emoji="🌍">
          Röbel ist der Anfang. Weitere Städte können ihre eigenen Münzen mit ihrer eigenen
          Bürger-Verifizierung bekommen. Vertrauen diese Städte einander, entsteht ein Netzwerk
          lokaler Gemeinschaften. Jede Stadt behält ihre eigenen Münzen und ihre eigenen Regeln;
          angenommen werden sie trotzdem über Stadtgrenzen hinweg.
        </Section>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Hinweis: Röbel Münzen sind ein Gemeinschaftsexperiment. Sie sind kein E-Geld und
            nicht in Euro auszahlbar. Sie sind getrennt von den Punkten unter „Belohnungen“.
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
