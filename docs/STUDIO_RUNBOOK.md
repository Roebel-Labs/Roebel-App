# Röbel Studio – Betriebshandbuch

Für den Operator (Max). Kurz, zum Abhaken. Stand: 2026-11-05.

---

## 1. Installation (einmalig)

```bash
# Node über nvm, pnpm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh && nvm install --lts
corepack enable && corepack prepare pnpm@9.15.0 --activate

# ffmpeg MIT SRT (das normale "ffmpeg" kann kein SRT)
brew install ffmpeg-full

# Abhängigkeiten
cd ~/Documents/privat/side_projects/DAO_test && pnpm install
```

- **Vor einer Show NIEMALS `brew upgrade`.** ffmpeg-full hängt an einer festgepinnten freetype-Version; ein Upgrade
  kann ffmpeg kaputt machen. Upgrades nur direkt nach einer Show, danach Probelauf.
- ffmpeg-Pfad (Standard in den Einstellungen): `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`.
  In **Einstellungen → Technik → Prüfen** muss stehen: `SRT ja · VideoToolbox ja`.

## 2. Starten

```bash
cd ~/Documents/privat/side_projects/DAO_test/.worktrees/roebel-studio
source ~/.nvm/nvm.sh
env -u ELECTRON_RUN_AS_NODE pnpm --filter @roebel/studio start
```

Kurzform vom Repo-Wurzelordner: `pnpm studio`.

`env -u ELECTRON_RUN_AS_NODE` ist nötig, wenn das Terminal aus VS Code/Cursor kommt – sonst startet Electron als
reines Node und es passiert nichts.

## 3. macOS-Berechtigungen

- **Systemeinstellungen → Datenschutz & Sicherheit → Kamera** und **→ Mikrofon**: „Electron" erlauben.
- Beim ersten Start fragt macOS selbst. Wurde einmal „Nicht erlauben" geklickt: dort von Hand einschalten,
  Studio neu starten.

## 4. Sendeziele

**Einstellungen → Sendeziele → „+ Ziel"**: Cloudflare SRT, Cloudflare RTMPS, YouTube, Facebook, Eigenes RTMP.
Pro Ziel: Name, An/Aus, Adresse, Schlüssel (verdeckt; „Zeigen" nur kurz), **Testen** (20 s Testbild mit Ton nur an
dieses Ziel – danach beim Ziel nachsehen, ob das Bild ankam).

Zwei Wege:

| Weg | So geht's | Upload vom Saal |
|---|---|---|
| **Cloudflare** (Standard) | Studio → 1 Ziel (Cloudflare SRT). Cloudflare verteilt selbst an YouTube/Facebook („Live Outputs" im Cloudflare-Dashboard) und an die Röbel App. | 1 × Stream |
| **Direkt** | Studio → mehrere Ziele (z. B. Cloudflare + YouTube + Facebook), Schlüssel direkt einfügen. | N × Stream |

- Das Studio kodiert **einmal** und schickt dieselben Daten an alle Ziele (ffmpeg tee).
- Fällt ein Ziel aus, laufen die anderen weiter. In der Statusleiste wird die Pille des Ziels rot, oben erscheint
  „Ziel ausgefallen". **„Ziel neu verbinden"** startet den Encoder neu: **alle** Ziele haben dann ein paar Sekunden
  Pause (im Test ~2 s), die Aufnahme geht in einer neuen Datei weiter. Nur in einer ruhigen Minute drücken.
- Bei nur einem Ziel verbindet das Studio von selbst neu.
- Upload-Bedarf steht in den Einstellungen: „≈ N × (Video + Audio) kbit/s". Bei 6000 + 160 kbit/s:
  1 Ziel ≈ 6,2 Mbit/s, 2 Ziele ≈ 12,3 Mbit/s, 3 Ziele ≈ 18,5 Mbit/s.
- Bei mehreren Zielen zeigt die Statusleiste keine Bitrate („–"); maßgeblich sind **Tempo** (≈ 1,00×) und
  **Encoder-fps**.
- **Kein Ziel eingeschaltet** → der Knopf heißt **„Nur aufnehmen"**: nur lokale Aufnahme, nichts geht ins Netz.

## 5. Paralleltest mit OBS (DanceCup 07.11.)

OBS sendet die Hauptsendung wie gewohnt, das Studio läuft parallel als Test.

- **Jede App bekommt ihr EIGENES Ziel/ihren eigenen Schlüssel.** Nie denselben Schlüssel zweimal – sonst werfen
  sich beide gegenseitig raus und die Hauptsendung bricht ab. Beispiel: OBS → wie immer; Studio → eigener
  Cloudflare-Input oder eine nicht-öffentliche YouTube-Sendung.
- Upload ≈ **doppelt** (OBS + Studio). Vorher messen.
- **Kameras in beiden Apps gleichzeitig** – bei der Probe testen:
  - USB-UVC-Geräte (Capture-Karte, Osmo Pocket) lassen sich auf macOS meist von zwei Apps gleichzeitig nutzen.
  - iPhone über Continuity Camera und manche Capture-Karten erlauben **nur eine App**. Dann bekommt OBS die Kamera.
- **RAM** auf dem 8-GB-M3 im Blick behalten: Aktivitätsanzeige → Speicher. Gelber/roter „Speicherdruck" → Studio
  beenden, die Hauptsendung (OBS) hat Vorrang.

## 6. Kameras

- **Sony FX** → HDMI → Capture-Karte (UVC) → USB-C. Erscheint als normale Kamera.
- **iPhone** → Continuity Camera; **per USB-Kabel** ist stabiler als drahtlos.
- **DJI Osmo Pocket 4** → USB-C-**Daten**kabel an den Mac → auf der Pocket **„Webcam"** tippen → erscheint als
  UVC-Kamera. Max. 1080p, **30 fps** einstellen. **Keine USB-zu-HDMI-Adapter** (nur ~15–20 fps).
- Das M3 hat nur 2 Anschlüsse → **USB-C-Hub mit eigenem Netzteil und Datenleitung**.

## 7. Notfall: OBS mit den Einblendungen

Läuft das Studio nicht, sendet OBS – die Einblendungen (Bauchbinden, Werbung, Uhr, Unterstützen) kommen trotzdem:

- OBS → Quelle **Browser** → URL `http://127.0.0.1:7311/overlay.html`, Breite **1920**, Höhe **1080**.
- **`127.0.0.1` verwenden, nicht `localhost`.**
- Das Studio muss dafür laufen (es liefert die Seite und den Zustand); gesteuert wird weiter im Studio.

## 8. Aufnahmen und Werbe-Protokoll

- Ordner: Einstellungen → Aufnahme (Standard `~/Movies/Röbel Studio`).
- **Eine .mkv pro Sitzung**; nach jedem Neuverbinden beginnt eine neue Datei.
- In MP4 umwandeln (verlustfrei, Sekunden):
  ```bash
  ffmpeg -i aufnahme.mkv -c copy aufnahme.mp4
  ```
- `werbung-airtime.jsonl` im selben Ordner: jede gelaufene Werbeeinblendung mit Name, Start und Ende – Nachweis für
  die Partner.

## 9. Probe (Checkliste)

- [ ] Upload im Saal gemessen: **≥ 15–20 Mbit/s pro Stream** (bei Paralleltest: für beide zusammen).
- [ ] Jede Kamera einzeln getestet (Capture-Karte, iPhone über das lange USB-Kabel, Osmo Pocket), auch parallel mit OBS.
- [ ] **Klatschtest**: vor der Kamera klatschen, im Stream prüfen, ob Bild und Ton zusammenpassen; Mischpult-Verzögerung
      in der Audiospur einstellen.
- [ ] Jedes Ziel mit **Testen** geprüft und beim Ziel nachgesehen.
- [ ] **60-Minuten-Dauertest** an alle Ziele: Tempo bleibt ≈ 1,00×, „Verworfen" bleibt 0, Speicher wächst nicht.
- [ ] **Netzwerk-Ziehtest**: LAN/WLAN 20 s trennen → Studio verbindet neu, Aufnahme läuft durch.
      Bei mehreren Zielen danach prüfen, ob alle Ziel-Pillen grün sind; sonst „Ziel neu verbinden".
- [ ] **Minimieren-Test**: Fenster minimieren / anderes Programm vorne → Stream läuft flüssig weiter.
- [ ] **Fenster-schließen-Test**: Fenster schließen während der Sendung → Rückfrage erscheint; „Abbrechen" lässt die
      Sendung laufen.
- [ ] OBS-Notfall: Browser-Quelle zeigt die Einblendungen.
- [ ] Netzteil am Mac, Energiesparen aus, Mitteilungen auf „Nicht stören".

## 10. Go / No-Go

Kriterium aus der Spezifikation (§2, wörtlich):

> **Go/no-go at the 11-06 rehearsal** *(Claude's call)*: the studio runs the show only if it streams ≥ 60 minutes
> continuously to all three destinations with no drop, freeze or audio desync, and lower thirds, ads and donation
> alerts work on air. Otherwise the show runs on OBS with the browser-source overlays (§4.6).

Für den 07.11. gilt zusätzlich: OBS sendet die Hauptsendung, das Studio läuft nur parallel als Test. Im Zweifel
**Studio beenden, OBS weiterlaufen lassen.**

## 11. Sicherheit der Schlüssel

- Schlüssel stehen nur lokal im Studio (nicht im Repo, nicht in Logs). Logs zeigen `***`.
- Die OBS-Einblendungsseite enthält keine Einstellungen und keine Schlüssel.
- Bildschirm teilen/fotografieren nur, wenn kein Schlüssel per „Zeigen" sichtbar ist.
- Nach der Show bei YouTube/Facebook/Cloudflare den Schlüssel bei Bedarf neu erzeugen.
