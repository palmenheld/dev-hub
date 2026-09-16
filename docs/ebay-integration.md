# eBay-Modul

Das eBay-Modul veröffentlicht ausschließlich manuell ausgewählte Weclapp-Artikel. Es übernimmt Artikelnummer, Namen, Größenbereich, Topfgröße, Shopware-/Bruttopreis-Fallback, Bestand und Fotos. Die vorhandene Quellenrecherche erstellt Beschreibung und Pflegeinformationen. Vor jeder Übertragung müssen Kategorie, eBay-Pflichtmerkmale und der fertige Entwurf geprüft und ausdrücklich freigegeben werden.

## Sicherheitsmodell

- Ohne vollständige eBay-Zugangsdaten findet kein eBay-Schreibzugriff statt.
- Das Modul startet standardmäßig in der eBay-Sandbox.
- Eine Anzeige wird nur über den sichtbaren Knopf „Jetzt bei eBay veröffentlichen“ live gestellt und verlangt zusätzlich den privaten serverseitigen eBay-Sicherheitscode.
- Richtlinien, Marktplatz und Umgebung werden bei der Freigabe eingefroren; Änderungen erzwingen eine neue Freigabe.
- Dateibasierte Sperren verhindern parallele Doppelaktionen auch bei mehreren Next.js-Prozessen.
- Mehrfachveröffentlichungen umfassen ausschließlich bereits einzeln freigegebene Entwürfe und verlangen eine zusätzliche Bestätigung.
- Direkt vor dem Schreiben werden die Weclapp-Quelldaten erneut verglichen.
- Eine bereits bei eBay vorhandene SKU wird nicht überschrieben.
- Bei einer unklaren API-Antwort wird nicht automatisch erneut gesendet. Der Entwurf wechselt zu „Status prüfen“.
- Zugangsdaten und Refresh Token werden nie an den Browser ausgeliefert.

## Benötigter eBay-Zugang

Ein eBay-Pro-Verkäuferkonto allein ist nicht ausreichend. Benötigt werden:

1. ein eBay Developers Program Konto,
2. ein Keyset für Sandbox und später ein getrenntes Keyset für Production,
3. Client-ID (App-ID) und Client-Secret (Cert-ID),
4. ein OAuth-fähiger Redirect URL name (RuName) mit der Hub-Rücksprungadresse,
5. eine einmalige Verkäuferfreigabe über den sichtbaren Knopf „Mit eBay verbinden“,
6. die Scopes `api_scope`, `sell.inventory` und `sell.account`,
7. ein selbst gewählter langer `EBAY_PUBLISH_KEY` als zusätzliche Bestätigung für Veröffentlichen und Löschen.

Servervariablen stehen in `.env.example`. In eBay wird für das Sandbox-Keyset unter „User Tokens“ ein Redirect URL name angelegt. Als „Auth Accepted URL“ und „Auth Declined URL“ wird die stabile HTTPS-Adresse `https://<hub-domain>/api/channels/ebay/oauth/callback` eingetragen. Derselbe vollständige Wert kommt in `EBAY_OAUTH_CALLBACK_URL`, der von eBay erzeugte Name in `EBAY_RUNAME`. Ein localhost- oder reiner Port-3001-Aufruf genügt hierfür nicht, weil eBay eine von außen erreichbare HTTPS-Rücksprungadresse verlangt.

Der Hub schützt die Anmeldung mit einer einmaligen, zufälligen und zeitlich begrenzten Sicherheitskennung. Nach erfolgreicher Freigabe tauscht er den eBay-Code serverseitig aus und speichert den Refresh Token getrennt nach Sandbox und Production mit Dateirechten `0600` unter `.data/ebay/<umgebung>/oauth.json`. Der Token wird nie an den Browser geliefert. `EBAY_REFRESH_TOKEN` bleibt nur als manueller Fallback möglich.

Der Weclapp-Preisimport liest alle Preisseiten, berücksichtigt nur aktuell gültige Preiszeiträume und nutzt die gespeicherte Shopware-Währung oder optional `WECLAPP_EBAY_CURRENCY_ID`. Zunächst bleibt `EBAY_ENVIRONMENT=sandbox`. Nach einer Änderung muss der Entwicklungscontainer neu erstellt oder mit den aktualisierten Umgebungsvariablen neu gestartet werden; ein bloßer Browser-Reload übernimmt keine neue Container-Umgebung.

## Einmalige Einrichtung im Hub

1. Sandbox-Keyset, RuName, HTTPS-Rücksprungadresse und Sicherheitscode serverseitig hinterlegen.
2. eBay-Modul öffnen und „Mit eBay verbinden“ wählen.
3. Mit einem eBay-Sandbox-Testverkäufer anmelden und die Freigabe bestätigen.
4. Zurück im Hub „Verbindung testen“ wählen.
5. Einen aktiven eBay-Lagerort auswählen.
6. Versand-, Zahlungs- und Rückgaberichtlinie auswählen.
7. Ziel speichern.
8. Einen Testartikel laden, KI-Entwurf erstellen, eBay-Kategorie auswählen und alle roten Pflichtmerkmale ergänzen.
9. Entwurf speichern, Quellen prüfen und freigeben.
10. Erst in der Sandbox veröffentlichen und das Ergebnis bei eBay kontrollieren.
11. Für Production das Verfahren bewusst mit Produktions-Keyset, Produktions-RuName und dem echten Verkäuferkonto wiederholen.

## Optimierte eBay-Texte

Die eBay-Fassung wird nicht mehr direkt aus dem Shopware-Ratgebertext übernommen. Nach der Quellenrecherche erzeugt ein eigener strukturierter KI-Schritt:

- einen suchstarken Titel mit maximal 80 Zeichen,
- eine mobil priorisierte Einleitung mit den konkreten Weclapp-Verkaufsdaten,
- drei bis fünf knappe Verkaufspunkte,
- getrennte Abschnitte für Erscheinungsbild, Standort, Pflege und Überwinterung,
- interne Suchbegriffe zur Qualitätskontrolle.

Jeder Textbereich muss intern mindestens zwei unabhängige Fachquellen aus der geprüften Recherche zuordnen; der Wintertext benötigt drei. Diese Quellen-IDs und URLs werden nicht in die eBay-Beschreibung geschrieben. Externe Adressen, Kontaktdaten, aktive Inhalte, unbelegte Versprechen und Keyword-Wiederholungen werden blockiert. Über „KI-Text neu erzeugen“ lassen sich Titel und Beschreibung bewusst ersetzen; Kategorie, Artikelmerkmale, Preis und Bestand bleiben erhalten.

Zusätzlich zeigt der Hub nicht nur erforderliche, sondern auch von eBay empfohlene Artikelmerkmale als Qualitätshinweis. Bis zu 24 vorhandene Produktbilder können übernommen werden.

## Technischer Ablauf

1. Weclapp-Kandidat laden und die vorhandene Feld-/Preislogik anwenden.
2. Pflanzeninformationen mit der bestehenden mehrstufigen Quellenrecherche erzeugen.
3. Daraus einen eigenen strukturierten eBay-Verkaufstext mit internen Quellenzuordnungen erzeugen.
4. eBay-Kategorie über die Taxonomy API vorschlagen lassen.
5. Kategorieabhängige erforderliche und empfohlene Artikelmerkmale über die Taxonomy API laden.
6. Über die Metadata API bestätigen, dass die Kategorie den Zustand „Neu“ erlaubt.
7. Bis zu 24 Bilder in eBay Picture Services übernehmen.
8. Inventory Item mit der Weclapp-Artikelnummer als eindeutiger SKU anlegen.
9. Offer mit Lagerort, Preis, `GTC`-Laufzeit und Geschäftsrichtlinien erzeugen.
10. Offer nach der letzten Bestätigung veröffentlichen.

Hinweis: Angebote, die über die Inventory API erstellt werden, müssen auch über diese API weiter gepflegt werden. Das spätere Aktualisieren und Pausieren sollte deshalb in diesem Hub ergänzt werden, bevor Production als führender eBay-Prozess genutzt wird.
