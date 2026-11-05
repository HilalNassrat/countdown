# Countdown

Schöne Countdowns für deine wichtigen Termine – läuft komplett im Browser, nichts verlässt dein Gerät.

**Live:** https://hilalnassrat.github.io/countdown/

## Funktionen

- Beliebig viele Countdowns, der nächste groß im Fokus
- Tage · Stunden · Minuten · Sekunden live – Tage als echte Kalendertage, auch über die Zeitumstellung hinweg
- Fortschrittsbalken seit dem Anlegen
- Schnellwahl (morgen, 1 Woche, 1 Monat, 100 Tage, Jahreswechsel)
- **Teilen** – auf dem Handy über das Teilen-Menü, am Rechner als Link; der Empfänger bestätigt vor dem Übernehmen
- **Kalender** – jeden Countdown als `.ics` in den Kalender eintragen; Termine aus einer `.ics`-Datei importieren (Button oder Datei auf die Seite ziehen)
- Löschen mit „Rückgängig“
- Mehrere Tabs bleiben synchron
- Hell- und Dunkelmodus automatisch
- Offline nutzbar und als App installierbar (PWA)

## Technik

`index.html` (Oberfläche) + `countdown-core.js` (reine Logik: Zeitrechnung, Teilen-Links, iCalendar). Keine Abhängigkeiten, die Schrift Plus Jakarta Sans liegt in `fonts/` – keine Anfragen an Dritte. Speicherung in `localStorage`.

- Unit-Tests (ohne Installation): `npm test`
- End-to-End-Tests: `npm i && npx playwright install chromium && npm run test:e2e`

Nach Änderungen: `VERSION` in `sw.js` hochzählen, damit installierte Apps die neue Version laden.
