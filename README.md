# WakeLog – persönliches Schlaf- und Aufwachprotokoll

WakeLog ist eine private, lokal arbeitende Web-App (PWA) für das iPhone. Du hältst damit fest, wann du nachts aufgewacht bist, was danach passiert ist und wann du endgültig aufgestanden bist. Über Wochen und Monate zeigt die App, zu welchen Uhrzeiten, wie oft und an welchen Wochentagen das passiert.

- Kein Konto, kein Backend, keine Cloud und kein Tracking. Alle Daten liegen in der IndexedDB auf dem Gerät.
- Nach dem ersten Laden läuft die App vollständig offline.
- Hell-, Dunkel- und Systemmodus.
- Export als JSON (vollständige Sicherung) und CSV (Tabelle), Import mit Prüfung.
- **Keine medizinische Diagnose.** Die Auswertungen beschreiben nur die eigenen Aufzeichnungen.

---

## 1. Schnellstart (Entwicklung)

Voraussetzung: Node.js **≥ 20.19** (empfohlen 22 LTS).

```bash
npm install          # Abhängigkeiten installieren
npm run dev          # Entwicklungsserver (http://localhost:5173)
npm test             # Automatisierte Tests (Vitest)
npm run build        # Produktions-Build nach dist/ (inkl. Service Worker dist/sw.js)
npm run preview      # Produktions-Build lokal prüfen (http://localhost:4173, auch im LAN)
npm run typecheck    # TypeScript-Prüfung (optional)
```

> Im Entwicklungsmodus (`npm run dev`) wird absichtlich **kein** Service Worker registriert. Offline-Verhalten und Update-Hinweis lassen sich nur mit `npm run build && npm run preview` prüfen.

Optionaler Browser-Rauchtest (Python + Playwright, 32 Prüfungen inkl. Offline-Start):

```bash
pip install playwright && playwright install chromium
npm run build && python tests/e2e/smoke.py
```

---

## 2. Installation auf dem iPhone

### Warum ein HTTPS-Hosting nötig ist

Ein Service Worker (Offline-Funktion) und „Zum Home-Bildschirm“ als eigenständige App funktionieren in Safari nur, wenn die App **einmal über eine sichere HTTPS-Adresse** geladen wird. Eine HTML-Datei aus der Dateien-App (`file://`) bekommt **keinen** Service Worker und keinen verlässlichen dauerhaften Speicher. Sie lässt sich auch nicht als Offline-App installieren. Ohne einmalige Bereitstellung ist WakeLog deshalb **keine** installierbare PWA (siehe Szenario B).

Das Hosting liefert nur die App-Dateien aus. **Schlafdaten werden nie übertragen.** Nach der Installation braucht die App keinen Server mehr.

### Szenario A: PWA (empfohlen)

**Variante A1: GitHub Pages (kostenlos)**

1. Projekt in ein GitHub-Repository pushen (Branch `main`).
2. Unter *Repository → Settings → Pages → Source* „**GitHub Actions**“ wählen.
3. Der Workflow `.github/workflows/deploy-pages.yml` baut, testet und veröffentlicht die App, z. B. unter `https://<name>.github.io/<repo>/`.
   - Durch relative Pfade (`base: './'`) funktioniert die App auch in Unterordnern.
   - Hinweis: GitHub Pages aus privaten Repositories setzt einen kostenpflichtigen GitHub-Plan voraus. Das Repository enthält nur Code, keine persönlichen Daten.

**Variante A2: Eigener Server, z. B. Raspberry Pi hinter einem Cloudflare-Tunnel**

Den Inhalt von `dist/` über einen beliebigen statischen Webserver (nginx, Caddy) per HTTPS ausliefern, etwa unter einer eigenen Subdomain. Wichtig: `sw.js` sollte ohne langen HTTP-Cache ausgeliefert werden (z. B. `Cache-Control: no-cache`), damit Updates erkannt werden.

**Installation in Safari (iOS 16.4 oder neuer empfohlen)**

1. Die HTTPS-Adresse in **Safari** öffnen und warten, bis die App vollständig geladen ist.
2. Unten auf das **Teilen-Symbol** tippen und dann **„Zum Home-Bildschirm“** wählen.
3. Den Namen „WakeLog“ bestätigen. Auf dem Home-Bildschirm erscheint das WakeLog-Icon (`apple-touch-icon.png`).
4. WakeLog **vom Home-Bildschirm aus** öffnen. Unter *Einstellungen → Informationen* sollte bei „Offline-Nutzung“ der Status **bereit** stehen.
5. Ab jetzt funktioniert die App ohne Internet, auch im Flugmodus.

> **Wichtig:** Auf dem iPhone haben der Safari-Tab und die Home-Bildschirm-App **getrennte Speicher**. Erfasse Daten deshalb nur in der installierten App. Falls du schon im Safari-Tab Einträge gemacht hast, exportiere dort eine JSON-Sicherung und importiere sie in der App.

**Updates:** Gibt es eine neue Version auf dem Server, zeigt die App beim nächsten Öffnen mit Internet den Hinweis „Eine neue Version von WakeLog ist verfügbar“. Die neue Version wird erst geladen, wenn du **Aktualisieren** tippst. So unterbricht ein Update nie eine laufende Eingabe.

### Szenario B: Kein Hosting und keinerlei externer Server

Ehrlich gesagt: **Ohne einmalige HTTPS-Bereitstellung lässt sich WakeLog auf iOS nicht als Offline-PWA auf den Home-Bildschirm installieren.** Safari behandelt lokale Dateien nicht wie eine Website, hier gibt es weder Service Worker noch eine installierbare Web-App.

Realistische Alternativen:

| Weg | Voraussetzungen | Bewertung |
|---|---|---|
| **B1: Native App-Hülle mit Capacitor** (empfohlen, falls kein Hosting) | Mac mit Xcode, Apple-ID, USB-Kabel | Die App läuft vollständig lokal aus dem App-Bundle, ohne Server. Mit einer kostenlosen Apple-ID ist die Signatur nur **7 Tage** gültig, danach muss neu installiert werden. Mit dem Apple Developer Program (99 €/Jahr) gilt sie 1 Jahr, außerdem ist TestFlight möglich. |
| B2: Lokales Netz (z. B. `npm run preview`) | PC im WLAN | Über `http://192.168.x.x` gibt es **kein HTTPS** und damit keinen Service Worker. Die App funktioniert nur, solange der PC läuft. Für den Alltag ungeeignet. |

**B1 – Capacitor-Schritte (auf einem Mac, hier nicht getestet):**

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/ios
npm run build
npx cap add ios          # nutzt capacitor.config.json (webDir: dist)
npx cap sync ios
npx cap open ios         # öffnet Xcode
```

In Xcode:

1. Unter *Signing & Capabilities* das eigene Team (Apple-ID) wählen.
2. `public/icons/icon-1024.png` unter *App/Assets.xcassets → AppIcon* als 1024 × 1024 Single-Size-Icon einsetzen.
3. iPhone anschließen und mit **Run** installieren. Beim ersten Start unter *Einstellungen → Allgemein → VPN & Geräteverwaltung* dem Entwickler vertrauen.

In der Capacitor-Hülle ist kein Service Worker nötig, weil die Dateien im App-Bundle liegen. Die IndexedDB-Daten bleiben erhalten, solange die App installiert ist.

---

## 3. Offline-Funktionalität

- **App-Shell-Precache:** Beim Build erzeugt ein kleines Vite-Plugin (`vite.config.ts`) aus `sw/service-worker.js` die Datei `dist/sw.js`. Darin stehen **alle** Build-Dateien (HTML, JS, CSS, Icons, Manifest) sowie eine Versionskennung, die als Hash über alle Dateiinhalte gebildet wird.
- **Cache-Strategie:**
  - Navigationen werden immer aus der gecachten App-Shell bedient. Dadurch startet die App offline zuverlässig.
  - Statische Dateien kommen zuerst aus dem Cache und nur ersatzweise aus dem Netz.
  - Fremde Ursprünge werden ignoriert.
- **Keine externen Ressourcen:** Es werden keine Fonts, CDNs, Bilder oder Skripte von fremden Servern geladen. Schrift ist die Systemschrift, Icons sind lokales SVG.
- **Datenschutz im Cache:** Der Cache Storage enthält ausschließlich App-Dateien. Persönliche Daten liegen nur in der IndexedDB, und Exporte entstehen als Blob direkt im Speicher.
- **Updates:** Eine neue Version wartet, bis der Nutzer „Aktualisieren“ tippt. Danach wird der alte Cache gelöscht.
- **Dauerhafter Speicher:** Die App fragt `navigator.storage.persist()` an. Der Status steht unter *Einstellungen → Informationen*.

---

## 4. Projektstruktur

```
wakelog/
├─ index.html                  App-Shell, iOS-Metadaten, Theme-Vorabskript
├─ vite.config.ts              Build + Service-Worker-Generator + Vitest-Konfiguration
├─ sw/service-worker.js        Service-Worker-Vorlage (wird beim Build befüllt)
├─ capacitor.config.json       Optional: native iOS-Hülle (Szenario B1)
├─ assets-src/icon-master.svg  Editierbares Icon-Master (SVG)
├─ public/
│  ├─ manifest.webmanifest     Web-App-Manifest
│  └─ icons/                   Alle generierten Icons
├─ scripts/generate-icons.mjs  Erzeugt alle Icon-Größen aus dem Master
├─ beispieldaten/              Optionale, erfundene Beispieldaten (klar gekennzeichnet)
├─ src/
│  ├─ main.tsx, App.tsx        Einstieg, App-Rahmen, Navigation
│  ├─ lib/                     Reine Logik (ohne React, vollständig getestet)
│  │  ├─ model.ts              Typen, Wertebereich outcome, Sortierung, applyChanges
│  │  ├─ time.ts               Zeitzone, Nachtzuordnung, Sommerzeit, Formatierung
│  │  ├─ episodes.ts           Anlegen/Ändern/Löschen + Validierung
│  │  ├─ stats.ts              Alle Statistikfunktionen
│  │  ├─ backup.ts             JSON-Export, Import-Validierung, Zusammenführen
│  │  ├─ csv.ts                CSV-Export
│  │  ├─ settings.ts           Einstellungen + Theme
│  │  ├─ download.ts           Teilen-Menü (iOS) bzw. Download
│  │  └─ storage/              DataStore-Schnittstelle, IndexedDB, Memory-Fallback
│  ├─ state/                   AppContext (Daten, Einstellungen, Navigation), Service-Worker-Hook
│  ├─ components/              Sheets, Formulare, Timeline, Diagramme, Icons
│  ├─ views/                   Heute, Kalender, Statistik, Einstellungen
│  └─ styles/                  theme.css (Designsystem), app.css
└─ tests/                      Vitest-Tests (+ optional e2e/smoke.py)
```

### Technologieentscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| UI | React 19 + TypeScript, Vite 8 | wie gefordert |
| Tests | Vitest 4 | wie gefordert. Die Logik ist komplett von React getrennt. |
| Diagramme | **eigene SVG-Komponenten** statt Recharts | Volle Steuerung über CSS-Variablen (Hell/Dunkel), Lücken für fehlende Nächte (statt 0), Touch-Auswahl, Tabellen-Alternative für Screenreader, kein zusätzliches Paket |
| PWA | **eigener Service Worker + Build-Plugin** statt vite-plugin-pwa | Der Service Worker ist klein, vollständig nachvollziehbar und ohne Workbox-Abhängigkeit. Die Precache-Liste wird automatisch erzeugt. |
| Icons | lokales SVG-Icon-Set (Strichstil wie Lucide) | keine externe Abhängigkeit, offline |
| Speicher | IndexedDB (eigene schlanke Hülle) | atomare Transaktionen, Schema-Versionierung |

Laufzeit-Abhängigkeiten sind nur `react` und `react-dom`.

---

## 5. Datenmodell

```ts
type Outcome = 'fell_asleep_again' | 'stayed_awake' | 'got_up' | 'unknown';

interface SleepEpisode {     // eine Nacht
  id: string;                // UUID
  nightDate: string;         // "YYYY-MM-DD", lokales Datum des Abends, eindeutig
  createdAt: string;         // ISO-8601 (UTC)
  updatedAt: string;
  bedTime?: string;          // geschätzte Schlafenszeit
  finalWakeTime?: string;    // endgültiges Aufwachen
  gotUpAt?: string;          // tatsächliche Aufstehzeit
  gotUpEventId?: string;     // falls aus einem Ereignis „Aufgestanden“ übernommen
  note?: string;
}

interface WakeEvent {        // ein Aufwachereignis
  id: string;
  episodeId: string;         // → SleepEpisode.id
  occurredAt: string;        // vollständiger Zeitpunkt, ISO-8601 (UTC)
  outcome: Outcome;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Regeln:**

- **Nachtzuordnung:** Ereignisse vor 18:00 Uhr gehören zur Nacht des Vortags, ab 18:00 Uhr zur Nacht desselben Tags. Ein Zeitpunkt ist für die Nacht *N* gültig, wenn er zwischen *N* 12:00 und *N+1* 18:00 liegt. Spätere Zeitpunkte werden abgewiesen, damit nichts versehentlich am falschen Tag landet.
- **Zeitpunkte:** Alle Zeitpunkte werden vollständig mit Datum gespeichert, in UTC. Angezeigt werden sie in lokaler Zeit. Uhrzeiten, die durch die Sommerzeitumstellung nicht existieren (z. B. 02:30 am letzten Märzsonntag), werden abgewiesen. Zeitspannen werden aus absoluten Zeitstempeln berechnet und sind damit sommerzeitsicher.
- **Sortierung:** nach `occurredAt`, dann `createdAt`, dann `id`. Das ist auch bei gleicher Minute deterministisch.
- **Duplikate:** Gleiche Nacht, gleiche Minute und gleicher Ausgang ergeben eine Warnung mit der Option „Trotzdem speichern“. Mehrere Ereignisse in derselben Minute bleiben also möglich.
- **„Aufgestanden“ als endgültiges Aufstehen:** Der Schalter im Formular übernimmt den Zeitpunkt als `gotUpAt` und verknüpft ihn über `gotUpEventId`. Dabei entsteht **kein zweites Ereignis**. Wird das Ereignis geändert oder gelöscht, ändert sich die Aufstehzeit mit bzw. wird entfernt.
- **Aufstehen ≠ Wachzeit:** Aus Aufwachen 03:37 und Aufstehen 06:15 wird keine durchgehende Wachzeit abgeleitet.

**IndexedDB-Schema** (DB `wakelog`, Version 1):

- `episodes` mit Schlüssel `id` und eindeutigem Index `nightDate`
- `events` mit Schlüssel `id` und den Indizes `episodeId` und `occurredAt`

Jede Änderung läuft als **eine** Transaktion über beide Stores. Löschen einer Nacht entfernt per Kaskade auch ihre Ereignisse.

**Schema-Änderungen:** `DB_VERSION` in `src/lib/storage/indexeddb.ts` erhöhen und in `MIGRATIONS` eine Funktion für die neue Version ergänzen. Alle Migrationen ab der alten Version laufen nacheinander in der Upgrade-Transaktion. Schlägt eine fehl, bleibt die alte Datenbank unverändert. Das JSON-Sicherungsformat hat eine eigene `schemaVersion`. Sicherungen aus neueren App-Versionen werden mit einer verständlichen Meldung abgelehnt.

Einstellungen liegen in `localStorage` (`wakelog.settings.v1`), damit das Theme schon vor dem ersten Rendern feststeht und nichts aufblitzt.

---

## 6. Statistik – Definitionen

- **Zeiträume:** 7, 30 oder 90 Tage, der gesamte dokumentierte Zeitraum oder ein frei wählbarer Zeitraum. Ein Zeitraum umfasst Nächte nach `nightDate`. „Letzte 7 Tage“ sind die 7 Nächte bis einschließlich der aktuellen Nacht.
- **Nenner:** Grundlage sind immer die **dokumentierten** Nächte. Eine nicht erfasste Nacht ist **kein Nullwert** und taucht in Diagrammen als offener Kreis bzw. Lücke auf. Eine erfasste Nacht ohne Ereignis zählt dagegen als 0.
- **Intervalle (5/15/30/60 min):**
  - Beginn = ⌊Minute ÷ Größe⌋ × Größe. Das Ende ist inklusive, z. B. umfasst `03:30–03:44` die Zeit von 03:30:00 bis 03:44:59.
  - 03:34, 03:37, 03:41 und 03:44 liegen im 15-Minuten-Modus im selben Intervall.
  - Die Achse beginnt um 18:00 Uhr. Dieselbe Logik gilt in allen Ansichten.
- **Ereignisse und Nächte werden getrennt gezählt:** Dreimaliges Aufwachen im selben Intervall einer Nacht sind 3 Ereignisse, aber nur 1 betroffene Nacht. Ranglisten sortieren nach betroffenen Nächten. Exakt gleiche Uhrzeiten (HH:MM) werden separat ausgewiesen.
- **Häufigstes Zeitfenster:** wird erst ab 3 Ereignissen angezeigt und nur dann, wenn ein Intervall mehr als einmal vorkommt. Andernfalls erscheint eine Erklärung.
- **Uhrzeit-Durchschnitt und -Median** (z. B. der Aufstehzeit) werden auf einer Achse ab 18:00 Uhr berechnet. So ergeben 23:50 und 00:10 im Mittel 00:00. Fehlende Aufstehzeiten fließen nicht ein (und schon gar nicht als 00:00).
- **Zeitfenster-Filter** (z. B. 03:00–04:00): Beginn inklusive, Ende exklusive, über Mitternacht möglich.
- **Wochentage:** Maßgeblich ist der Wochentag des Abends, an dem die Nacht beginnt. Angezeigt werden absolute Ereignisse, dokumentierte Nächte und der Durchschnitt pro dokumentierter Nacht.
- **Zeitspanne erstes Aufwachen → Aufstehen:** Sie wird ausdrücklich **nicht** als Wachzeit bezeichnet. Berücksichtigt werden nur Nächte, in denen beide Zeitpunkte vorhanden sind.

---

## 7. App-Icon

| Datei | Größe | Verwendung |
|---|---|---|
| `assets-src/icon-master.svg` | Vektor | **Editierbares Master**, auch als `public/icons/icon-master.svg` |
| `public/icons/icon-192.png` | 192 × 192 | Manifest (`purpose: any`) |
| `public/icons/icon-512.png` | 512 × 512 | Manifest (`purpose: any`) |
| `public/icons/icon-maskable-512.png` | 512 × 512 | Manifest (`purpose: maskable`, Motiv in der 80 %-Safe-Zone) |
| `public/icons/apple-touch-icon.png` | 180 × 180 | iOS Home-Bildschirm (`<link rel="apple-touch-icon">` in `index.html`) |
| `public/icons/favicon.svg`, `favicon-32.png` | Vektor, 32 × 32 | Browser-Tab |
| `public/icons/icon-1024.png` | 1024 × 1024 | Native Hülle (Xcode AppIcon) |

Alle PNG-Dateien für App-Icons sind vollflächig und **ohne Transparenz** (RGB). iOS rundet die Ecken selbst. Das Motiv besteht aus einem Zifferblatt-Ring, einer Mondsichel und einem türkisen „Aufwach-Punkt“ bei etwa 03:30. Es bleibt bis 32 px erkennbar und ist auf hellen wie dunklen Hintergründen gut sichtbar.

Neu erzeugen nach einer Änderung am Master:

```bash
npm i -D sharp && npm run icons
```

---

## 8. Datensicherung und bekannte Einschränkungen

- **Datenverlust-Risiken:** Lokale Daten gehen verloren, wenn du in Safari Website-Daten löschst, die Home-Bildschirm-App entfernst oder das Gerät ohne Backup zurücksetzt. → Exportiere regelmäßig eine JSON-Sicherung (Einstellungen → JSON exportieren → In Dateien sichern).
- **iOS-Speichertrennung:** Safari-Tab und installierte App teilen sich keine Daten.
- **Speicherbereinigung durch iOS:** Für Websites, die nur im Safari-Tab genutzt werden, kann iOS den Speicher nach längerer Inaktivität löschen. Installierte Home-Bildschirm-Apps sind davon ausgenommen. → Nutze die installierte App.
- **Kein Hosting = keine PWA:** siehe Szenario B.
- **Import:** Beim **Zusammenführen** werden Nächte über ihr Datum zugeordnet. Bei Konflikten gewinnt der neuere `updatedAt`-Stand, inhaltlich identische Ereignisse werden übersprungen. **Ersetzen** verlangt eine ausdrückliche Bestätigung. Ungültige Datensätze werden einzeln gemeldet und nicht übernommen.
- **„Alle lokalen Daten löschen“** erfordert die Eingabe von `LÖSCHEN` und setzt auch die Einstellungen zurück.
- Die Nachtgrenze (18:00 Uhr) ist fest eingestellt.
- Ohne `@vitejs/plugin-react` gibt es im Entwicklungsmodus keinen React-Fast-Refresh. Bei Änderungen lädt die Seite komplett neu.

---

## 9. Prüfstatus

**In der Entwicklungsumgebung ausgeführt:**

- `npm test` → **56/56 Tests bestanden** (4 Dateien). Abgedeckt sind:
  - Episoden anlegen und ändern, mehrere Ereignisse, Mitternacht, Sortierung
  - Bearbeiten und Löschen, Duplikate, Verknüpfung „Aufgestanden“
  - 5/15/30/60-Minuten-Intervalle, Ereignisse vs. Nächte
  - Wochentage mit Lücken, Mittelwert und Median, Sommerzeit
  - JSON-Roundtrip und Validierung, Zusammenführen, CSV-Escaping
  - Theme-Speicherung, leere und unvollständige Daten
- `vite build` → erfolgreich. Der Service Worker enthält 10 Dateien im Precache.
- `tsc --strict` für `src/lib` und `tests` → fehlerfrei.
- Browser-Rauchtest (`tests/e2e/smoke.py`, Chromium mit iPhone-Viewport 390 × 844 und 320 × 568) → **32/32 Prüfungen bestanden**, keine Konsolenfehler. Geprüft wurden u. a.:
  - Erfassen, Bearbeiten und Löschen, Persistenz in IndexedDB nach Reload
  - Import und Export
  - Kalender und Statistik
  - Theme-Wechsel mit Persistenz, System-Modus
  - **Offline-Start über den Service Worker**
  - Update-Hinweis, kein horizontales Scrollen

**Nicht geprüft:**

- Ein echtes iPhone bzw. WebKit/Safari. Getestet wurde in Chromium mit iPhone-Viewport. Safe-Areas, native iOS-Picker und „Zum Home-Bildschirm“ müssen auf dem Gerät kontrolliert werden.
- `npm run typecheck` für die React-Komponenten, weil die `@types/react`-Pakete in der Build-Umgebung nicht verfügbar waren. `npm run build` ist davon nicht betroffen.
- Die Capacitor-Hülle (Szenario B1), denn dafür fehlt ein Mac mit Xcode.
- Der GitHub-Pages-Workflow (noch nicht in einem Repository ausgeführt).

---

## 10. Beispieldaten

`beispieldaten/wakelog-beispieldaten.json` enthält **frei erfundene** Daten (52 Nächte, 81 Ereignisse) zum Ausprobieren der Statistik. Du kannst sie über *Einstellungen → JSON importieren* laden. Exportiere vorher deine eigenen Daten bzw. nutze die Beispieldaten nur in einer Test-Installation. Die App selbst enthält keine Demo-Daten.
