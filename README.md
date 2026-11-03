# BGS Auftragsplaner (Version 3)

Installierbare Web-App (PWA) für PC und Handy, mit Kalender, Kunden, Mitarbeitern,
wiederkehrenden Aufträgen, Stundenübersicht und Spracheingabe (offline oder mit Claude-KI).

## Aufbau

```
index.html            Seite
css/app.css           Aussehen (Handy + PC + Druck)
js/app.js             Start, verbindet alles
js/store.js           Daten speichern, Sicherung, Import
js/recurrence.js      Wiederkehrende Aufträge
js/parser.js          Offline-Spracherkennung
js/ai.js              KI-Modus (Claude)
js/voice.js           Mikrofon
js/views/*.js         Kalender, Tagesfenster, Verwaltung, Stunden, Einstellungen
sw.js                 Offline-Fähigkeit
tests/                Automatische Tests (im Browser öffnen)
tools/dev-server.ps1  Lokaler Testserver
```

## Lokal starten

```
powershell -ExecutionPolicy Bypass -File tools\dev-server.ps1
```

Dann im Browser `http://localhost:8765/` öffnen. Tests: `http://localhost:8765/tests/`.

## Aufs Handy bringen

Damit Handy und Installation funktionieren, muss die App unter einer `https://`-Adresse
liegen. Kostenlos geht das z. B. mit GitHub Pages: den Ordner `BGS-App` in ein
Repository hochladen und unter *Settings → Pages* veröffentlichen.

## Daten

Die Daten liegen auf jedem Gerät separat im Browser. Übertragen und sichern über
⚙️ → „Sicherung speichern“ / „Daten importieren“. Den Export der alten Version
(alte App → ⚙️ → „Daten exportieren“) importiert man genauso.

## Neue Version veröffentlichen

Versionsnummer in `js/version.js` **und** `sw.js` erhöhen – installierte Apps
zeigen dann „Neue Version verfügbar“.
