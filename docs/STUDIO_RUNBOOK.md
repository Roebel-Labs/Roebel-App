# Ortis Studio – Handbuch

Livestream-Studio für den Mac: Kameras und Medien mischen, Einblendungen und Werbung steuern, an mehrere Ziele
senden und aufnehmen. Dieses Handbuch gilt für jede Veranstaltung und ist in der App unter **Hilfe** nachzulesen.

## Schnellstart

1. ffmpeg mit SRT installieren und **Einstellungen → Technik → Prüfen** abwarten (Abschnitt Installation).
2. macOS-Zugriff auf Kamera und Mikrofon erlauben.
3. Im **Show**-Tab Kameras und Medien als Quellen anlegen, im **Design**-Tab die Einblendungen anpassen.
4. In **Einstellungen → Sendeziele** ein Ziel anlegen und mit **Testen** prüfen.
5. Proben (Abschnitt Probe), dann **Auf Sendung gehen**.

## Installation

Ortis Studio braucht auf dem Mac **ffmpeg mit SRT-Unterstützung** (das normale `ffmpeg` kann kein SRT):

```bash
brew install ffmpeg-full
```

- Standardpfad in den Einstellungen: `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`.
- In **Einstellungen → Technik → Prüfen** muss stehen: `SRT ja · VideoToolbox ja`.
- **Vor einer Sendung niemals `brew upgrade`.** ffmpeg-full hängt an festgepinnten Bibliotheken; ein Upgrade kann
  ffmpeg kaputt machen. Upgrades nur direkt nach einer Veranstaltung, danach Probelauf.

## Starten

**Stand: Entwicklungs-Branch.** Das Studio liegt zurzeit auf dem Branch `feat/roebel-studio` im Ordner
`~/Documents/privat/side_projects/DAO_test/.worktrees/roebel-studio`. **Nicht** die alte Kopie
`.worktrees/ortis-studio-test` verwenden.

Beim ersten Mal und nach jedem Update dort einmal `pnpm install`, dann starten:

```bash
cd ~/Documents/privat/side_projects/DAO_test/.worktrees/roebel-studio
source ~/.nvm/nvm.sh
pnpm install   # nur beim ersten Mal und nach Updates
pnpm studio
```

Der erste Start nach einem Update fragt evtl. erneut nach Kamera und Mikrofon – erlauben (die Electron-App wird
dabei neu signiert und gilt für macOS als neue App).

`pnpm studio` baut die Oberfläche und startet Ortis Studio. Es setzt `env -u ELECTRON_RUN_AS_NODE` selbst (nötig,
wenn das Terminal aus VS Code oder Cursor kommt, sonst startet Electron als reines Node und es passiert nichts).

## macOS-Berechtigungen

- **Systemeinstellungen → Datenschutz & Sicherheit → Kamera** und **→ Mikrofon**: „Electron" bzw. „Ortis Studio" erlauben.
- Beim ersten Start fragt macOS selbst. Wurde einmal „Nicht erlauben" gewählt: dort von Hand einschalten und das
  Studio neu starten.

## Kameras

Alles, was macOS als Kamera (UVC) meldet, ist als Quelle nutzbar. Beispiele:

- **Kamera mit HDMI-Ausgang** (z. B. Sony FX) → HDMI → Capture-Karte (UVC) → USB-C. Erscheint als normale Kamera.
- **iPhone** über Continuity Camera. Per USB-Kabel ist es stabiler als drahtlos.
- **DJI Osmo Pocket 4** (oder ähnliche Action-Cams): USB-C-**Daten**kabel an den Mac, am Gerät **„Webcam"** wählen.
  Höchstens 1080p und **30 fps** einstellen. Keine USB-zu-HDMI-Adapter (nur ca. 15–20 fps).
- Viele Macs haben nur 2 Anschlüsse: **USB-C-Hub mit eigenem Netzteil und Datenleitung** verwenden.
- Soll dieselbe Kamera parallel in einer zweiten App laufen (z. B. OBS), vorher testen: USB-UVC-Geräte gehen meist in
  zwei Apps, iPhone/Continuity Camera und manche Capture-Karten nur in einer.

### iPhone als Kamera (Continuity Camera)

1. Mac und iPhone mit derselben Apple-ID, auf beiden WLAN und Bluetooth an.
2. iPhone gesperrt und quer in eine Halterung nahe am Mac stellen, oder per USB-Kabel anschließen (stabiler).
3. Es erscheint als „<Name> Kamera" unter **+ Quelle → Kamera**.

Fehlt das iPhone: Studio beenden und `pnpm studio` neu starten (das wendet den nötigen Info.plist-Eintrag
`NSCameraUseContinuityCameraDeviceType` erneut an, siehe `apps/studio/scripts/patch-electron-plist.cjs`). Dann prüfen:
Mac **Systemeinstellungen → Allgemein → AirPlay & Handoff → Continuity-Kamera** an, und am iPhone
**Einstellungen → Allgemein → AirPlay & Handoff → Continuity-Kamera** an.

Nach einem Update fragt macOS evtl. erneut nach Kamera/Mikrofon – erlauben. (Der Patch signiert die Electron-App neu,
dadurch gilt sie für macOS als neue App.)

## Audio und Mischpult

- **Das Mischpult startet leer.** Vor dem Sendestart mindestens einen Kanal anlegen (**Show → Audio → „+ Kanal“**),
  sonst ist der Stream stumm. Das Studio warnt im Sendedialog und unten in der Leiste („Ton: stumm“).
- Mischpult oder Audio-Interface als Mikrofonquelle wählen; die Pegel zeigt der Mixer im **Show**-Tab.
- **Lippensynchronität:** Der Ton kommt meist früher als das Bild. In der Audiospur lässt sich eine Verzögerung
  einstellen. Zum Abgleich vor der Kamera klatschen und im aufgenommenen Stream prüfen, ob Klatschen und Ton zusammenpassen.
- Videodateien und Zuspielungen laufen mit ihrem eigenen Ton über dieselbe Mischung.

## Tabelle und CSV

Im **Tabelle**-Tab pflegst du Listen (z. B. Teilnehmer, Programmpunkte, Ergebnisse), aus denen Einblendungen ihre
Texte holen.

- Zeilen und Spalten direkt bearbeiten; die aktuelle Zeile steuert die verknüpften Einblendungen.
- Import und Export als **CSV** (UTF-8, Trennzeichen Komma oder Semikolon).
- Ändert sich eine Zelle, die gerade auf Sendung ist, aktualisiert sich die Einblendung.

## Grafiken und Design

Im **Design**-Tab entstehen die Vorlagen für Einblendungen: Bauchbinden, Uhr, Logo, Werbung, Ergebnistafeln.

- Elemente verschieben, Schrift, Farben, Bilder und Animation (Einblenden/Ausblenden) einstellen.
- Textfelder lassen sich an Tabellenspalten binden.
- Im **Show**-Tab schaltest du Einblendungen mit einem Klick ein und aus. Vorschau (grün) und Sendung (rot) sind getrennt;
  **TAKE** bringt die Vorschau auf Sendung.

## Werbepausen und Werbe-Protokoll

Werbespots (Sponsoren) laufen als Zuspielung oder Einblendung und werden zeitlich protokolliert.

- Reihenfolge und Dauer legst du bei den Sponsoren fest; eine Kampagne rotiert automatisch.
- Jede gelaufene Einblendung steht mit Name, Start und Ende in `werbung-airtime.jsonl` im Aufnahmeordner.
  Das ist der Nachweis für Werbepartner.
- Zusammenstellung zur Abrechnung: die Datei in eine Tabellenkalkulation importieren (eine JSON-Zeile pro Spot).

## Sendeziele

**Einstellungen → Sendeziele → „+ Ziel"**: Cloudflare SRT, Cloudflare RTMPS, YouTube, Facebook, Eigenes RTMP.
Pro Ziel: Name, An/Aus, Adresse, Schlüssel (verdeckt; „Zeigen" nur kurz), **Testen** (20 s Testbild mit Ton nur an dieses
Ziel; danach beim Ziel nachsehen, ob das Bild ankam).

### Ein oder mehrere Ziele

| Weg | So geht's | Upload |
|---|---|---|
| **Verteiler** (z. B. Cloudflare) | Studio sendet 1 Ziel; der Dienst verteilt weiter an YouTube, Facebook usw. | 1 × Stream |
| **Direkt** | Studio sendet an mehrere Ziele (z. B. YouTube und Facebook), Schlüssel direkt einfügen. | N × Stream |

- Das Studio kodiert **einmal** und schickt dieselben Daten an alle Ziele.
- **Pro Protokoll nur ein Eingang:** SRT und RTMPS desselben Dienstes nie gleichzeitig auf denselben Eingang
  senden; der Dienst wirft sonst eine der beiden Verbindungen raus („Broken pipe").
- Dieselben Schlüssel nie in zwei Programmen gleichzeitig verwenden (Studio und OBS bekommen je einen eigenen).

### Upload-Bedarf

Die Einstellungen zeigen „≈ N × (Video + Audio) kbit/s". Bei 6000 + 160 kbit/s: 1 Ziel ≈ 6,2 Mbit/s,
2 Ziele ≈ 12,3 Mbit/s, 3 Ziele ≈ 18,5 Mbit/s. Messe den Upload vor Ort und plane mindestens das 1,5-fache ein.

### Ein Ziel hängt oder fällt aus

- Fällt ein Ziel aus, laufen die anderen weiter. In der Statusleiste wird die Pille rot, oben erscheint „Ziel ausgefallen".
- **Tempo fällt gegen 0 → ein Ziel hängt → Ziel ausschalten → „Ziel neu verbinden".** Während der Sendung lassen sich
  in den Einstellungen nur Ziele an- und ausschalten; erst „Ziel neu verbinden" übernimmt das.
- **„Ziel neu verbinden"** startet den Encoder neu: **alle** Ziele haben ein paar Sekunden Pause, die Aufnahme geht in
  einer neuen Datei weiter. Nur in einer ruhigen Minute drücken. Mindestens ein Ziel muss an bleiben.
- Ein hängendes Ziel bremst die anderen nur kurz (eigener Puffer je Ziel; ein RTMP-Ziel ohne Antwort gilt nach ca. 2 s als ausgefallen).
- Bei nur einem Ziel verbindet das Studio selbst neu (Pille gelb, solange es neu verbindet).
- Bei mehreren Zielen zeigt die Statusleiste keine Bitrate („–"); maßgeblich sind **Tempo** (≈ 1,00×) und **Encoder-fps**.
- „Testen" und „Auf Sendung gehen" schließen sich aus: Wer trotz laufendem Test live geht, bricht den Test ab.

## Nur aufnehmen

Ist **kein Ziel eingeschaltet**, heißt der Knopf **„Nur aufnehmen"**: Es entsteht nur die lokale Aufnahme, nichts geht
ins Netz. Ideal für Proben und Mitschnitte.

## Notfall: OBS mit den Einblendungen

Läuft das Studio nicht mehr rund, kann OBS senden; die Einblendungen (Bauchbinden, Werbung, Uhr, Chat-Nachricht)
kommen trotzdem:

- OBS → Quelle **Browser** → URL `http://127.0.0.1:7311/overlay.html`, Breite **1920**, Höhe **1080**.
- **`127.0.0.1` verwenden, nicht `localhost`.**
- Das Studio muss dafür laufen (es liefert die Seite und den Zustand); gesteuert wird weiter im Studio.
- Unterstützungen aus der App erscheinen nie im Bild (weder Stream noch Aufnahme), nur im Live-Raum-Tab und in der App.

## App-Anbindung (Live-Raum)

Der **Live-Raum**-Tab verbindet das Studio mit der Röbel App: Zuschauer-Chat, Hinweise auf Unterstützungen,
Handy-Gäste und die Live-Anzeige in der App.

- Chat-Nachrichten lassen sich ausblenden oder hervorheben; Hervorgehobene erscheinen als Einblendung.
- Unterstützungen sind **nie** auf Sendung, sondern nur ein Hinweis für das Team.
- **Gäste:** Handy-Gäste erscheinen als Kachel und lassen sich wie jede Quelle schneiden.
- Nach einem Neuladen der Oberfläche sind Gäste weg: im Live-Raum-Tab **„Neu verbinden"**.
- **„Folgt dem Studio“** (Abschnitt „Status in der App“, standardmäßig an): Geht das Studio auf Sendung, steht die
  verbundene Show in der App auf LIVE; beim Beenden fragt das Studio, ob sie auch in der App enden soll. Den Live-Raum
  deshalb nur mit der Show verbinden, für die dieser Stream gedacht ist – bei einem Paralleltest mit einer Test-Show
  oder „Folgt dem Studio“ ausschalten.

## Aufnahmen

- Ordner: **Einstellungen → Aufnahme** (Standard `~/Movies/Ortis Studio`).
- Dateinamen: `ortis-studio-JJJJ-MM-TT_HH-MM-SS`. Es entsteht **eine .mkv pro Sitzung**; nach jedem Neuverbinden beginnt eine neue Datei.
- In MP4 umwandeln (verlustfrei, dauert Sekunden):

```bash
ffmpeg -i aufnahme.mkv -c copy aufnahme.mp4
```

## Störungen

- **Studio-Fenster neu geladen oder abgestürzt, während gesendet wird:** Die Sendung läuft weiter (das Studio übernimmt
  sie automatisch), aber das **Live-Bild ist leer, bis eine Szene neu genommen wird**. Sofort eine Szene anklicken und
  **TAKE** drücken (oder Doppelklick auf die Kachel). Gäste: im Live-Raum-Tab „Neu verbinden".
- **Gast-Kachel „Signal verloren" auf Sendung:** Der Gast hat aufgelegt oder die Verbindung verloren. Auf eine andere
  Szene schneiden; die Kachel verschwindet dann von selbst.
- **Kein Bild von einer Kamera:** Kabel/Hub prüfen, macOS-Berechtigung prüfen, Kamera ist evtl. in einer anderen App offen.
- **Tempo unter 1,00×:** Upload zu knapp oder ein Ziel hängt; Bitrate senken oder Ziel ausschalten und neu verbinden.
- **Speicherdruck gelb/rot** (Aktivitätsanzeige → Speicher): andere Programme schließen; im Zweifel auf den Notfallweg (OBS) wechseln.
- **Medienserver-Fehler (Port 7311 belegt):** Eine andere Instanz des Studios läuft noch; beenden und neu starten.

## Sicherheit der Schlüssel

- Schlüssel stehen nur lokal im Studio (nicht im Repo, nicht in Logs). Logs zeigen `***`.
- Die OBS-Einblendungsseite enthält keine Einstellungen und keine Schlüssel.
- Bildschirm teilen oder fotografieren nur, wenn kein Schlüssel per „Zeigen" sichtbar ist.
- Nach der Veranstaltung den Schlüssel beim Dienst bei Bedarf neu erzeugen.

## Probe

Vor jeder Veranstaltung:

- [ ] Upload am Veranstaltungsort gemessen: **gesamt ≥ 1,5 × Bedarf** (alle Ziele und ggf. ein zweites Programm zusammen).
- [ ] Jede Kamera einzeln getestet, auch parallel zu einem zweiten Programm, falls eingesetzt.
- [ ] **Klatschtest**: Bild und Ton passen zusammen; Mischpult-Verzögerung eingestellt.
- [ ] Jedes Ziel mit **Testen** geprüft und beim Ziel nachgesehen.
- [ ] **60-Minuten-Dauertest** an alle Ziele: Tempo bleibt ≈ 1,00×, „Verworfen" bleibt 0, Speicher wächst nicht.
- [ ] **Netzwerk-Ziehtest**: LAN/WLAN 20 s trennen; Studio verbindet neu, Aufnahme läuft durch. Bei mehreren Zielen
      danach prüfen, ob alle Pillen grün sind; sonst „Ziel neu verbinden".
- [ ] **Minimieren-Test**: Fenster minimieren oder anderes Programm nach vorn; der Stream läuft flüssig weiter.
- [ ] **Fenster-schließen-Test**: Fenster schließen während der Sendung; die Rückfrage erscheint, „Abbrechen" lässt die Sendung laufen.
- [ ] Notfallweg (OBS-Browserquelle) zeigt die Einblendungen.
- [ ] Netzteil am Mac, Energiesparen aus, Mitteilungen auf „Nicht stören".

## Go / No-Go

Standardkriterium (kann pro Veranstaltung verschärft werden):

> Das Studio fährt die Sendung nur, wenn es bei der Probe **mindestens 60 Minuten ununterbrochen** an **alle**
> vorgesehenen Ziele sendet, ohne Aussetzer, Standbild oder Tonversatz, Bauchbinden und Werbung funktionieren
> und Unterstützungs-Hinweise nur im Live-Raum-Tab erscheinen (nie im Bild). Andernfalls läuft die Sendung über
> OBS mit den Browserquellen-Einblendungen.

Im Zweifel während der Sendung: **Studio beenden, den Notfallweg weiterlaufen lassen.**
