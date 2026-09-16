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

## Wichtige Trennung

- GitHub: Quellcode, Dokumentation und Entwicklungscontainer
- `.env.local`: lokale beziehungsweise serverseitige Geheimnisse
- `.data/`: lokale Entwürfe, Tokens und Laufzeitdaten
- `/srv/palmenheld-dev-hub`: laufende Server-Arbeitskopie

Die Verzeichnisse `.env.local` und `.data/` bleiben durch `.gitignore` von
Commits ausgeschlossen. Vor jedem Push zeigt `git status` deshalb nur Dateien,
die tatsächlich in GitHub landen sollen.
