// Printable invitation letters for the credential register: one A4 page per person with the
// org, the credential, a QR code of the personal link, the link as text and three steps.
// Server-only (route action `letters`). Names arrive already cleaned (delivery.printableName);
// react-pdf renders them as plain text, nothing in them is evaluated.
// Relative imports only: loaded by `npx tsx --test`.
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { LetterContext, LetterRow } from "./delivery";

const NAVY = "#00498B";
const GREY = "#6B7280";

const styles = StyleSheet.create({
  page: { padding: 56, fontFamily: "Helvetica", fontSize: 12, color: "#111827" },
  brand: { fontSize: 11, color: NAVY, fontFamily: "Helvetica-Bold", marginBottom: 40 },
  greeting: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  lead: { fontSize: 13, marginBottom: 28, lineHeight: 1.4 },
  card: { borderWidth: 1, borderColor: "#B4B8C1", borderRadius: 8, padding: 24, alignItems: "center", marginBottom: 28 },
  org: { fontSize: 12, color: GREY, marginBottom: 4 },
  type: { fontSize: 18, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 16 },
  qr: { width: 200, height: 200, marginBottom: 12 },
  url: { fontSize: 9, color: GREY },
  stepsTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  step: { fontSize: 12, marginBottom: 4 },
  note: { fontSize: 10, color: GREY, marginTop: 24, lineHeight: 1.4 },
});

export const LETTER_STEPS = ["1. Röbel App installieren.", "2. Diesen Code scannen.", "3. Ausweis annehmen."] as const;

export async function renderLetters(rows: LetterRow[], ctx: LetterContext): Promise<Buffer> {
  const qrs = await Promise.all(rows.map((r) => QRCode.toDataURL(r.url, { errorCorrectionLevel: "M", margin: 1, width: 600 })));
  const doc = (
    <Document title={`Ausweise – ${ctx.typeName}`} author={ctx.orgName} creator="Röbel App" producer="Röbel App">
      {rows.map((r, i) => (
        <Page key={i} size="A4" style={styles.page}>
          <Text style={styles.brand}>Röbel App</Text>
          <Text style={styles.greeting}>{r.displayName}</Text>
          <Text style={styles.lead}>Du hast einen Ausweis erhalten.</Text>
          <View style={styles.card}>
            <Text style={styles.org}>{ctx.orgName}</Text>
            <Text style={styles.type}>{ctx.typeName}</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={qrs[i]} style={styles.qr} />
            <Text style={styles.url}>{r.url}</Text>
          </View>
          <Text style={styles.stepsTitle}>So geht es</Text>
          {LETTER_STEPS.map((s) => (
            <Text key={s} style={styles.step}>
              {s}
            </Text>
          ))}
          <Text style={styles.note}>Dieser Code ist persönlich. Wer ihn hat, kann den Ausweis abholen – bitte gib ihn nicht weiter.</Text>
        </Page>
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
