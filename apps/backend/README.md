<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">Ein progressives <a href="http://nodejs.org" target="_blank">Node.js</a> Framework zum Erstellen effizienter und skalierbarer serverseitiger Anwendungen.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>


## Projekt: Backend-Anwendung

### Beschreibung

Dieses Projekt ist die Backend-Anwendung für [**BITTE PROJEKTNAMEN ODER ZWECK ERGÄNZEN**]. Es wurde mit dem [NestJS](https://github.com/nestjs/nest) Framework entwickelt und nutzt TypeScript.
Das Backend stellt eine API bereit, die von verschiedenen Clients (z.B. dem Frontend) konsumiert werden kann.

### Verwendete Technologien

*   **Framework**: NestJS
*   **Sprache**: TypeScript
*   **API-Protokoll**: tRPC (für typsichere API-Aufrufe)
*   **Datenbank-ORM/Toolkit**: Prisma & ZenStack (aus dem `@mono/database` Paket)
*   **Authentifizierung**: JWT-basiert (JSON Web Tokens)
*   **Caching**: Redis (optional, je nach Konfiguration)
*   **Weitere wichtige Bibliotheken**:
    *   `@nestjs/config` für Konfigurationsmanagement
    *   `zod` für Schema-Validierung

## Projektstruktur (Wichtige Module)

Das Backend ist modular aufgebaut. Hier eine Übersicht der wichtigsten Module im `src`-Verzeichnis:

*   `app.module.ts`: Das Hauptmodul der Anwendung.
*   `auth/`: Verantwortlich für Authentifizierung (Login, Logout, Token-Management) und Autorisierung.
*   `article/`: Beinhaltet Logik für Artikel und möglicherweise geplante Tasks (`tasks/`).
*   `contact/`: Stellt Funktionalität für Kontaktformulare oder ähnliches bereit (tRPC-basiert).
*   `db/`: Stellt einen Service für Datenbankinteraktionen bereit, wahrscheinlich eine Abstraktion über Prisma.
*   `ftp/`: Modul für FTP-bezogene Operationen.
*   `healthcheck/`: Stellt Endpunkte zur Überprüfung des Systemzustands bereit.
*   `redis/`: Integration mit einem Redis-Server für Caching oder andere Zwecke.
*   `trpc/`: Konfiguration und Bereitstellung der tRPC-Router und Prozeduren.
*   `generator/`: Enthält Skripte zur Code-Generierung (z.B. tRPC-Verträge).

## Konfiguration

Die Anwendung wird über Umgebungsvariablen konfiguriert. Eine `.env`-Datei kann für die lokale Entwicklung verwendet werden. Wichtige Konfigurationsparameter umfassen:

*   Datenbank-Verbindungszeichenfolge
*   JWT-Secrets und Ablaufzeiten
*   Redis-Verbindungsparameter
*   Ports für den Server
*   [**BITTE WEITERE WICHTIGE VARIABLEN ERGÄNZEN**]

Die Konfiguration wird über den `ConfigService` von `@nestjs/config` geladen.

## Datenbank

Die Anwendung nutzt Prisma und ZenStack für den Datenzugriff, die im Paket `@mono/database` definiert sind.

*   **Schema**: Das Datenbankschema wird in `packages/database/schema.zmodel` (ZenStack) und `packages/database/prisma/schema.prisma` (Prisma) definiert.
*   **Migrationen**: Prisma Migrate wird für Datenbankschemamigrationen verwendet. Diese befinden sich in `packages/database/prisma/migrations/`.
    *   Um Migrationen im `@mono/database` Paket zu erstellen oder anzuwenden, verwende die dort definierten Skripte (z.B. `pnpm run migrate` im Paket `database`).

## API via tRPC

Die API wird hauptsächlich über tRPC bereitgestellt. Dies ermöglicht typsichere Aufrufe zwischen Backend und Frontend.

*   **Router und Prozeduren**: Werden in den jeweiligen Modulen definiert (z.B. `contact.trpc.ts`) und im `trpc`-Modul zusammengeführt.
*   **Vertrag**: Der tRPC-Vertrag (Typdefinitionen für die API) wird generiert und kann vom Frontend importiert werden, um typsichere Client-Aufrufe zu ermöglichen. Das Skript `generate:trpc-contract` im `package.json` ist dafür zuständig.

## Projekt einrichten

Stelle sicher, dass du `pnpm` als Paketmanager verwendest.

```bash
# Installiere alle Abhängigkeiten im Monorepo-Root
$ pnpm install
```

## Anwendung kompilieren und starten

```bash
# Entwicklung (startet die Anwendung mit Watch-Modus)
$ pnpm run start:dev

# Alternativ, wenn Abhängigkeiten wie @mono/trpc auch im Watch-Modus laufen sollen:
$ pnpm run start:dev:deps

# Build für die Produktion erstellen
$ pnpm run build

# Produktion (startet die gebaute Anwendung)
$ pnpm run start:prod

# Debug-Modus mit Watch
$ pnpm run start:debug
```

Das Skript `start:dev` führt auch `pnpm generate:trpc-contract` aus, um sicherzustellen, dass der tRPC-Vertrag aktuell ist.

## Tests ausführen

```bash
# Unit-Tests
$ pnpm run test

# E2E-Tests (End-to-End)
$ pnpm run test:e2e

# Test-Coverage anzeigen
$ pnpm run test:cov
```

## Deployment

[**BITTE SPEZIFISCHE DEPLOYMENT-ANWEISUNGEN FÜR DIESES PROJEKT ERGÄNZEN**]

Die Standard-NestJS-Dokumentation zum [Deployment](https://docs.nestjs.com/deployment) bietet allgemeine Hinweise.

## Weitere Ressourcen

*   [NestJS Dokumentation](https://docs.nestjs.com)
*   [tRPC Dokumentation](https://trpc.io/docs)
*   [Prisma Dokumentation](https://www.prisma.io/docs/)
*   [ZenStack Dokumentation](https://zenstack.dev/docs)

## Support

Nest ist ein MIT-lizenziertes Open-Source-Projekt. Es kann dank der Sponsoren und der Unterstützung durch die großartigen Unterstützer wachsen. Wenn du dich ihnen anschließen möchtest, lies bitte [hier mehr](https://docs.nestjs.com/support).

## Kontakt bleiben

*   Autor - [Kamil Myśliwiec](https://twitter.com/kammysliwiec) (Ursprünglicher NestJS Autor)
*   Projektverantwortliche(r) - [**DEIN NAME/TEAMNAME HIER EINTRAGEN**]
*   Website - [https://nestjs.com](https://nestjs.com/)
*   Twitter - [@nestframework](https://twitter.com/nestframework)

## Lizenz

Nest ist [MIT lizenziert](https://github.com/nestjs/nest/blob/master/LICENSE).
[**BITTE ÜBERPRÜFEN, OB DIE LIZENZ FÜR DEIN PROJEKT KORREKT IST ODER ANGEPASST WERDEN MUSS**]