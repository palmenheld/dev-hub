# Remote-Entwicklung an mehreren Arbeitsplätzen

Der Quellcode liegt im GitHub-Repository `palmenheld/dev-hub`. Der gemeinsame
Entwicklungsbranch ist zunächst `chore/remote-development-setup`.

## Ersteinrichtung am weiteren Arbeitsplatz

Voraussetzungen:

- Git
- Docker Desktop oder Docker Engine
- Visual Studio Code mit der Erweiterung **Dev Containers**
- Zugriff auf das private GitHub-Repository

Repository klonen und den Entwicklungsbranch öffnen:

```bash
git clone https://github.com/palmenheld/dev-hub.git
cd dev-hub
git switch chore/remote-development-setup
```

Anschließend den Ordner in Visual Studio Code öffnen. Dort über die
Befehlspalette **Dev Containers: Reopen in Container** wählen. Der Container
verwendet automatisch Node.js 22 und installiert die Abhängigkeiten mit
`npm ci`.

Die lokale Anwendung starten:

```bash
npm run dev
```

Sie ist anschließend normalerweise unter `http://localhost:3000` erreichbar.

## Zugangsdaten

`.env.local` wird absichtlich nicht über GitHub übertragen. Dadurch gelangen
Weclapp-, Shopware-, OpenAI- und eBay-Schlüssel nicht in das Repository.

Am neuen Arbeitsplatz zunächst die Vorlage kopieren:

```bash
cp .env.example .env.local
```

Danach nur die benötigten Werte lokal eintragen. Produktive Zugangsdaten sollten
nicht unverschlüsselt zwischen Arbeitsplätzen verschickt werden. Für reine
Oberflächenarbeit können nicht benötigte Integrationen deaktiviert bleiben.

## Täglicher Git-Ablauf

Vor Arbeitsbeginn den aktuellen Stand holen:

```bash
git switch chore/remote-development-setup
git pull --ff-only
```

Nach einer abgeschlossenen Änderung prüfen und veröffentlichen:

```bash
npm run lint
npm run typecheck
git add -A
git commit -m "Kurze Beschreibung der Änderung"
git push
```

Nicht gleichzeitig auf beiden Arbeitsplätzen dieselben Dateien ändern. Falls
das doch passiert, erst committen und anschließend `git pull --rebase` verwenden,
bevor erneut gepusht wird.

## Anwendung auf dem Linux-Server öffnen

Der Servercontainer stellt die Anwendung nur auf `127.0.0.1:3001` bereit. Das
ist beabsichtigt und verhindert einen ungeschützten öffentlichen Entwicklungsport.

Von Windows PowerShell kann ein Tunnel auf einen freien lokalen Port geöffnet
werden:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 33001:127.0.0.1:3001 hubadmin@SERVER-IP
```

Dieses PowerShell-Fenster bleibt während der Nutzung geöffnet. Im Browser wird
danach `http://localhost:33001` aufgerufen. Der Tunnel zeigt die Serverinstanz;
er ersetzt nicht das lokale Klonen des Repositorys.

## Öffentliche Testadresse

Die aktuelle Server-Testversion ist zusätzlich unter
`https://dev-hub.palmenheld.de/` erreichbar. Die Domain ist durch eine separate
Browser-Anmeldung geschützt. Benutzername und Passwort werden nicht im
Repository gespeichert.

Der Aufruf läuft über folgende Stationen:

1. Plesk nimmt die verschlüsselte HTTPS-Verbindung an.
2. `ops/plesk-dev-proxy.cjs` prüft die Browser-Anmeldung.
3. Der Proxy leitet die Anfrage intern an `127.0.0.1:3002` weiter.
4. Dort läuft ein eigener Node.js-22-Vorschaucontainer mit einem stabilen
   Next.js-Produktions-Build aus `/srv/palmenheld-dev-hub`.

Der Entwicklungsserver auf Port `3001` bleibt davon getrennt und ist weiterhin
nur über den SSH-Tunnel erreichbar.

Die Zugangsdaten liegen ausschließlich auf dem Server in:

```text
/var/www/vhosts/palmenheld.de/dev-hub.palmenheld.de/.dev-hub-basic-auth.env
```

Nach einer Passwortänderung wird der Plesk-Einstieg neu geladen:

```bash
touch /var/www/vhosts/palmenheld.de/dev-hub.palmenheld.de/app/tmp/restart.txt
```

Um einen neuen Git-Stand in der Testversion bereitzustellen:

```bash
cd /srv/palmenheld-dev-hub
git pull --ff-only origin chore/remote-development-setup
mkdir -p .data
docker compose -f ops/compose.preview.yaml up -d --force-recreate
```

Die Docker-Ports `3001` und `3002` bleiben absichtlich an `127.0.0.1`
gebunden. Sie dürfen nicht direkt öffentlich freigegeben werden, weil die
Anwendung Schreibfunktionen für Shopware und eBay enthält.

## Wichtige Trennung

- GitHub: Quellcode, Dokumentation und Entwicklungscontainer
- `.env.local`: lokale beziehungsweise serverseitige Geheimnisse
- `.data/`: lokale Entwürfe, Tokens und Laufzeitdaten
- `/srv/palmenheld-dev-hub`: laufende Server-Arbeitskopie

Die Verzeichnisse `.env.local` und `.data/` bleiben durch `.gitignore` von
Commits ausgeschlossen. Vor jedem Push zeigt `git status` deshalb nur Dateien,
die tatsächlich in GitHub landen sollen.
