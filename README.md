# Radreise

Android-App für private Fahrradreisen: GPX-Tracks auf einer Radkarte, Ordnerverwaltung,
Routenplanung über das eingebettete bikerouter.de.

Angular 22 + Capacitor 8 (Android), Leaflet, `@tmcw/togeojson`.

## Starten

```bash
npm install
npm start            # Browser-Entwicklung (ohne Planer, GPX per Import-Button)
npm test             # Parser, Farbcodierung, Export-Hook (jsdom)
npm run android      # baut, synchronisiert und öffnet Android Studio
```

Voraussetzung für Android: Android Studio mit SDK 36, JDK 21.
Beim ersten Mal nach `npm run android` in Android Studio das Gerät wählen und starten.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/app/gpx.ts` | GPX lesen, Strecke und Höhenmeter, Farbcodierung (Höhe oder Steigung) |
| `src/app/route-store.ts` | Ordner und Dateien (Capacitor Filesystem), Anzeigezustand, Hauptroute |
| `src/app/map-view.ts` | Leaflet-Karte, Kartenstile, Routen-Zeichnung, Legende |
| `src/app/explorer.ts` | Routen-Explorer: Ordner, Auswahl, Hauptroute, Import, Löschen |
| `src/app/planner.ts` | Platzhalter für die native bikerouter-WebView, nimmt Exporte entgegen |
| `src/app/bikerouter.ts` | TypeScript-Schnittstelle zum nativen Plugin |
| `android/.../BikerouterPlugin.java` | Native WebView über dem Planer-Bereich, fängt Downloads ab |
| `android/app/src/main/assets/export-hook.js` | In bikerouter injiziertes Skript (Blob-/data:-Downloads) |

## Wie der Export ankommt

bikerouter erzeugt das GPX im Browser. Das Plugin injiziert `export-hook.js`, das
`URL.createObjectURL`, `HTMLAnchorElement.click`, `dispatchEvent` und Klicks auf
`a[download]` mit Blob-/data:-Ziel abfängt, den Inhalt als Base64 an die App gibt und
den Download unterdrückt. Als zweite Absicherung wertet ein `DownloadListener` Blob-URLs aus.
Angular speichert die Datei im Ordner, der im Explorer gerade offen ist, und setzt sie
als Hauptroute.

## Speicherort

Routen liegen unter `Directory.Data/routen/` (App-interner Speicher). Sie sind für
andere Apps und den Dateimanager nicht sichtbar und werden mit der App gelöscht.
Ein Export/Backup ist noch nicht eingebaut.

## Bekannte Lücken

- Verschieben und Umbenennen von Routen und Ordnern fehlt.
- Keine Offline-Karten, keine Standortanzeige.
- Kartenstile: CyclOSM, OpenTopoMap, OSM-Standard. Die öffentlichen Server haben
  Nutzungsbedingungen, bei intensiver Nutzung eigenen Tile-Dienst verwenden.
