// Info-/Erklärscreen: Was ist Röbel Münzen, wie funktioniert es, und die Vision.
// Bürgerfreundliches Deutsch, keine Krypto-Fachbegriffe (Currency = immer "Röbel Münzen").
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
          Röbel Münzen sind die digitale Gemeinschaftswährung von Röbel/Müritz — von Bürgern für
          Bürger. Sie soll Wertschöpfung in der Stadt halten und das lokale Miteinander stärken.
        </Text>

        <View style={{ marginBottom: 16 }}>
          <WeeklyEarnedChart points={weekly.points} labels={weekly.labels} changePct={weekly.changePct} />
        </View>

        <Section colors={colors} title="Wer kann mitmachen?" emoji="🪪">
          Nur verifizierte Bürger. Deine Bürger-Verifizierung ist dein Schlüssel — nur wer als
          echter Röbeler bestätigt ist, kann Röbel Münzen erzeugen. Das macht das Geld
          fälschungssicher: keine Bots, keine Fake-Konten.
        </Section>

        <Section colors={colors} title="Wie entstehen Röbel Münzen?" emoji="⏳">
          Als verifizierter Bürger erzeugst du laufend neue Röbel Münzen — ca. 1 pro Stunde, also
          rund 24 am Tag. Mit „Heute abholen“ sammelst du sie ein. Niemand teilt sie zu: jeder
          Mensch erzeugt seinen eigenen, gleichen Anteil.
        </Section>

        <Section colors={colors} title="Eine geteilte Währung (die Gruppe)" emoji="👥">
          Damit alle dasselbe Geld nutzen, bündeln die Bürger ihre persönlichen Münzen in einer
          gemeinsamen Gruppe — daraus entsteht der einheitliche Röbel Münzen, den alle akzeptieren.
          Deine eingebrachten Münzen dienen als Deckung und bleiben dir erhalten: du kannst sie
          jederzeit wieder zurücktauschen. Mitglied der Gruppe sind ausschließlich verifizierte
          Bürger — deshalb bleibt Röbel Münzen echtes Bürgergeld und kann nicht von Außenstehenden
          erzeugt werden.
        </Section>

        <Section colors={colors} title="Warum schrumpft mein Guthaben?" emoji="🌊">
          Röbel Münzen verlieren ganz langsam an Wert, wenn sie nur liegen bleiben (etwa 7 % im
          Jahr). Das ist Absicht: Geld soll genutzt werden, nicht gehortet. So bleibt es in
          Bewegung — und in der Stadt. Wer aktiv ist, verliert dadurch praktisch nichts.
        </Section>

        <Section colors={colors} title="Senden & bezahlen" emoji="🤝">
          Du kannst Röbel Münzen an andere Bürger senden. Schritt für Schritt sollen lokale
          Geschäfte und Vereine sie annehmen — damit dein Geld vor Ort kreist statt abzufließen.
        </Section>

        <Section colors={colors} title="Öffentlich & nachprüfbar" emoji="🔍">
          Röbel Münzen läuft auf einer offenen, öffentlichen Infrastruktur (Gnosis). Jede Münze und
          jede Überweisung ist für alle überprüfbar — niemand kann heimlich Geld „drucken“. Das
          schafft Vertrauen ohne zentrale Kontrolle.
        </Section>

        <Section colors={colors} title="Die Vision: ein Netzwerk von Städten" emoji="🌍">
          Röbel ist der Anfang. Weitere Städte erhalten ihre eigene Währung mit ihrer eigenen
          Bürger-Verifizierung. Diese Währungen vertrauen einander — so entsteht ein Netzwerk
          lokaler Wirtschaften. Jede Stadt behält ihr eigenes Geld und ihre eigenen Regeln;
          akzeptiert wird trotzdem über Stadtgrenzen hinweg. Geld wird lokal erzeugt, aber breit
          nutzbar.
        </Section>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Hinweis: Röbel Münzen sind eine experimentelle Gemeinschaftswährung — kein E-Geld und
            nicht 1:1 in Euro auszahlbar. Es ist getrennt von den Belohnungs-Münzen in der App.
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
    headerTitle: { fontFamily: "Inter-SemiBold", fontSize: 17, color: colors.textPrimary },
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
