# DanceCup 07.11.2026 – Checkliste für Ortis Studio

Veranstaltungsspezifisch. Das allgemeine Handbuch steht in der App unter **Hilfe** (Quelle: `docs/STUDIO_RUNBOOK.md`).

## Aufbau

- Hauptsendung: **OBS** wie gewohnt. Ortis Studio läuft **parallel als Test** (Paralleltest).
- Sendeweg: Studio → 1 Ziel (**Cloudflare SRT**). Cloudflare verteilt über „Live Outputs" an YouTube/Facebook und an die Röbel App.
- **Eigener Cloudflare-Input für das Studio.** Nie den Schlüssel der OBS-Sendung verwenden; sonst werfen sich beide
  gegenseitig raus und die Hauptsendung bricht ab. Alternative: nicht-öffentliche YouTube-Sendung.
- Cloudflare SRT und Cloudflare RTMPS nie gleichzeitig auf denselben Input.
- Upload ≈ **doppelt** (OBS + Studio). Vorher im Saal messen.

## Rechner

- 8-GB-M3: Aktivitätsanzeige → Speicher im Blick. Gelber/roter Speicherdruck → **Studio beenden, OBS hat Vorrang**.
- M3 hat nur 2 Anschlüsse → USB-C-Hub mit eigenem Netzteil und Datenleitung.
- Kameras in beiden Apps gleichzeitig: bei der Probe testen. Capture-Karte und Osmo Pocket gehen meist in zwei Apps,
  iPhone (Continuity Camera) und manche Karten nur in einer – dann bekommt OBS die Kamera.
- Kameras: Sony FX → HDMI → Capture-Karte; iPhone per USB-Kabel (lang); DJI Osmo Pocket 4 im Webcam-Modus (1080p, 30 fps).

## Probe 06.11. (Checkliste)

- [ ] Upload im Saal gemessen: gesamt ≥ 15–20 Mbit/s bzw. ≥ 1,5 × Bedarf (Studio + OBS zusammen).
- [ ] Jede Kamera einzeln und parallel mit OBS getestet (Capture-Karte, iPhone über das lange Kabel, Osmo Pocket).
- [ ] Klatschtest; Mischpult-Verzögerung in der Audiospur eingestellt.
- [ ] Cloudflare-Ziel mit **Testen** geprüft und im Dashboard nachgesehen.
- [ ] 60-Minuten-Dauertest: Tempo ≈ 1,00×, „Verworfen" = 0, Speicher wächst nicht.
- [ ] Netzwerk-Ziehtest (20 s), Minimieren-Test, Fenster-schließen-Test.
- [ ] OBS-Notfall: Browser-Quelle `http://127.0.0.1:7311/overlay.html` (1920 × 1080) zeigt die Einblendungen.
- [ ] Netzteil, Energiesparen aus, „Nicht stören".

## Go / No-Go (Spezifikation §2)

Studio-Show nur, wenn es ≥ 60 Minuten ohne Aussetzer, Standbild oder Tonversatz an alle drei Ziele sendet und
Bauchbinden, Werbung und Spenden-Hinweise auf Sendung funktionieren. Sonst läuft die Show auf OBS mit den
Browser-Quellen-Einblendungen.

Am 07.11. gilt zusätzlich: OBS sendet, das Studio ist nur Test. Im Zweifel **Studio beenden, OBS weiterlaufen lassen.**
