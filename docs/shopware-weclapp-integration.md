# Shopware- und weclapp-Integration

Stand: 7. September 2026

Diese Datei beschreibt den bewusst begrenzten Shopware-Umfang des Palmenheld Hub: ausgewählte Weclapp-Artikel werden mit aktuellen KI-Inhalten angereichert, geprüft und als fertige Produkte in Shopware angelegt. Die übrige kaufmännische Abwicklung übernimmt weiterhin die direkte weclapp-Shopware-Schnittstelle.

## Sicherheitsmodell

- Keine automatische Massenverarbeitung im Startzustand.
- Recherche wird nur für ausdrücklich ausgewählte Artikel gestartet; pro Lauf sind höchstens zehn Artikel möglich.
- Schreibvorgänge beginnen mit einer serverseitigen Vorschau.
- Vorschläge können vor der Freigabe korrigiert werden; danach müssen Inhalt und weiterhin passende Quellen ausdrücklich neu bestätigt werden.
- Freigabe und Ausführung sind zwei getrennte Schritte.
- Vor dem Schreiben werden Artikelnummer, Namen, Größe, Topfgröße, Preis, Bestand, Bilder und Versandklasse erneut aus weclapp gelesen; Abweichungen stoppen den Lauf.
- Veränderte Datensätze werden gestoppt und nicht überschrieben.
- Schreibende Routen prüfen die Herkunft der Anfrage.
- Zugangsdaten bleiben ausschließlich serverseitig.
- Jeder Plan und jeder einzelne Erfolg oder Fehler wird protokolliert.

## Betriebsbereit

### Ein oder mehrere Artikel nach Shopware

- Einen oder mehrere geeignete weclapp-Artikel manuell auswählen; auch große Artikelbestände sind seitenweise erreichbar.
- Name, lateinischen Namen, Artikelnummer, Höhe, optionale Topfgröße, Preis, Bestand und Bilder aus weclapp übernehmen und prüfen.
- Höhenwerte und Bereiche wie `120–140 cm`, `H 180 cm` oder `1,8–2,0 m` ersatzweise aus dem Produktnamen erkennen; für Versandregeln gilt die obere Grenze.
- Topfcodes `C45`, `V30` und `M50` als Topfdurchmesser interpretieren, normalisieren und strukturiert nach Shopware übertragen.
- KI-Recherche mit aktuellen Webquellen erst nach ausdrücklichem Klick starten; eine Neurecherche ersetzt vorhandene Korrekturen nur nach separater Warnung und Bestätigung.
- Strukturierte Pflanzen- und SEO-Daten mit Quellenbelegen erzeugen.
- Für jeden Artikel genau einen aktiven, dauerhaft gespeicherten Entwurf führen, vollständig korrigieren und ausdrücklich freigeben.
- Einzeln oder gesammelt veröffentlichen; die Sammelaktion berücksichtigt ausschließlich bereits freigegebene Entwürfe und verlangt eine zusätzliche Bestätigung.
- Shopware-Produkt inaktiv anlegen beziehungsweise eindeutig abgleichen.
- Preis, Bestand, Artikelnummer, Texte, Metadaten, Eigenschaften und Bilder übertragen.
- Für den Shopware-Preis zuerst `GROSS1` verwenden; fehlt oder ist dieser Preis ungültig, den ersten gültigen positiven `GROSS…`- beziehungsweise Bruttopreis übernehmen und seine Quelle im Entwurf kennzeichnen. Weclapp wird dabei nicht verändert.
- Bilder nur von freigegebenen HTTPS-Hosts laden; Größe, MIME-Typ und Dateisignatur prüfen.
- Unklare Antworten durch erneutes Lesen abgleichen, statt blind erneut anzulegen.

### Kontrollierter Preis- und Bestandsabgleich nach Shopware

- Nur ausgewählte Artikel verarbeiten.
- Vorher-/Nachher-Vorschau erstellen.
- Werte vor Freigabe korrigieren.
- Quellzustand vor Ausführung erneut prüfen.
- Einzelne Fehler isolieren und protokollieren.

### Kontrollierte GROSS1-Massenpreisänderung in weclapp

- Festpreis, prozentuale Erhöhung oder prozentuale Reduzierung.
- Serverseitige Vorschau für die ausgewählten Artikel.
- Einzelpreise vor der Freigabe korrigieren.
- Ausdrückliche Freigabe und zweite Bestätigung.
- Aktuellen weclapp-Preis unmittelbar vor dem Schreiben erneut prüfen.
- Der frühere direkte Schreibweg ist deaktiviert.

## Produktbezogene Erweiterungen

Folgende Erweiterungen bleiben innerhalb des Produkt-Publishers möglich, werden aber erst nach gesonderter fachlicher Festlegung aktiviert:

- Varianten und Variantenartikel.
- Mehrsprachige Produktdaten.
- Kategorien, Hersteller und Einheiten über feste Zuordnungen.
- Grund- und Staffelpreise sowie Kundengruppenpreise.

## Bewusst außerhalb des Hub-Umfangs

Kunden, Bestellungen, Auftragsbestätigungen, Zahlungen, Lieferungen, Tracking, Stornierungen und Bestellstatus werden nicht durch diesen Hub verarbeitet. Dafür bleibt die direkte weclapp-Shopware-Schnittstelle zuständig. Vorhandene technische Vorarbeiten sind nicht Bestandteil der sichtbaren Shopware-Oberfläche und werden nicht automatisch ausgeführt.

## Quellenbasis

- [Offizielle weclapp-Dokumentation: Shopware 6](https://doc.weclapp.com/documentation/erste-schritte-shopanbindung/shopware-6/)
- [Offizielles weclapp SDK und OpenAPI-Spezifikation](https://github.com/weclapp/sdk)
- [OpenAI Web Search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Betriebshinweise

- Entwicklung ausschließlich im separaten Container `palmenheld-dev-hub` mit Node.js 22.
- Entwicklungsoberfläche auf dem Server über den lokalen Port `3001` bereitstellen.
- Vor der ersten Nutzung die Shopware-Verbindung testen und die produktbezogenen Feldzuordnungen prüfen.
- Bei einer betroffenen Shopware-Version die in der Oberfläche angezeigte Sicherheitswarnung zuerst beheben.
- Schreibrechte der Shopware-Integration und des weclapp-Tokens auf die tatsächlich aktivierten Funktionen begrenzen.
