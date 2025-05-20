# Nextjs Nestjs TRPC Turborepo

## Übersicht

Dieses Projekt ist ein Full-Stack Monorepo, das ein Next.js Frontend, ein NestJS Backend und eine typsichere API-Schicht mittels tRPC kombiniert. Ein besonderes Merkmal ist der benutzerdefinierte Workflow zur Definition von tRPC-Prozeduren im Backend und zur automatischen Generierung eines typsicheren Vertrags für das Frontend.

Das Monorepo wird mit **pnpm Workspaces** und **Turborepo** für effizientes Build-Management und Skriptausführung verwaltet.

## Architektur

Das Projekt ist in mehrere Kernbereiche unterteilt:

* **Monorepo Management:**
    * **pnpm Workspaces:** Verwaltet Abhängigkeiten über die verschiedenen Pakete und Anwendungen hinweg.
    * **Turborepo:** Orchestriert Build-Prozesse, Tests und Linting für das gesamte Monorepo und optimiert diese durch Caching.

* **Backend (`apps/backend`):**
    * Entwickelt mit **NestJS**, einem progressiven Node.js-Framework für den Bau effizienter und skalierbarer serverseitiger Anwendungen.
    * Verantwortlich für die Geschäftslogik, Datenbankinteraktionen (z.B. über `DbModule`) und Authentifizierung (`AuthService`).
    * Definiert tRPC-Prozeduren mithilfe von benutzerdefinierten Decorators (`@TrpcRouter`, `@TrpcProcedure`) direkt in den NestJS Providern.
    * Ein `MainTrpcRouterFactory` baut zur Laufzeit den tRPC-Router mit den echten Implementierungen aus diesen dekorierten Providern.
    * Ein `TRPCController` und `TRPCService` stellen den tRPC-Endpunkt unter `/trpc` bereit.

* **Frontend (`apps/frontend`):**
    * Entwickelt mit **Next.js**, einem React-Framework für serverseitiges Rendering und statische Seitengenerierung.
    * Verwendet **TanStack Query (React Query)** für das Data-Fetching und State-Management auf Client-Seite.
    * Integriert tRPC über einen typsicheren Client, der auf dem generierten Vertrag aus dem `packages/trpc`-Paket basiert.

* **tRPC Schicht:**
    * **`packages/trpc` (agiert als Contract-Paket, Name in `package.json`: `@mono/trpc-server`):**
        * Enthält die Definition des `TRPCContext` (in `server.ts`).
        * Beinhaltet den **automatisch generierten tRPC-Vertrag** (`trpc-contract.ts`). Diese Datei definiert den `appRouter` mit allen Prozeduren, deren Input- und Output-Zod-Schemata (extrahiert aus dem Backend) und Placeholder-Implementierungen für reine Typsicherheitszwecke im Frontend.
    * **`apps/backend/src/trpc/decorators.ts`:** Definiert die `@TrpcRouter`- und `@TrpcProcedure`-Decorators, die im Backend zur Kennzeichnung von tRPC-Definitionen verwendet werden.
    * **`apps/backend/src/generator/` (Codegenerator-Modul):**
        * Enthält den `TrpcContractGenerator` (`code-generator.ts`) und das ausführende Skript (`run.ts`).
        * Dieses Modul parst den Backend-Code (speziell die mit Decorators versehenen Klassen/Methoden), extrahiert die tRPC-Struktur sowie Input-/Output-Zod-Schemata und generiert die `trpc-contract.ts`-Datei im `packages/trpc`-Paket.

## Key Features

* **End-to-End Typsicherheit:** Von der Datenbank bis zum UI dank TypeScript und tRPC.
* **Single Source of Truth für API-Definitionen:** tRPC-Prozeduren (Signaturen, Input-/Output-Validierungsschemata mit Zod) werden einmal im Backend-Code mithilfe von Decorators definiert.
* **Automatisierte Vertragsgenerierung:** Ein benutzerdefiniertes Skript generiert den tRPC-Router-Vertrag für das Frontend, was manuelle Synchronisation eliminiert.
* **Domain-orientierte Router-Struktur:** Backend tRPC-Router können nach fachlichen Domänen aufgeteilt und dynamisch zu einem Hauptrouter zusammengeführt werden.
* **Effizientes Monorepo-Management:** Durch pnpm und Turborepo.

## Projektstruktur (vereinfacht)
```
n2_stickstoff_monorepo/
├── apps/
│   ├── backend/        # NestJS Anwendung
│   │   ├── src/
│   │   │   ├── user/       # Beispiel Domänenmodul (z.B. user.trpc.ts)
│   │   │   ├── trpc/
│   │   │   │   ├── decorators.ts
│   │   │   │   ├── trpc-main.router.ts  # MainTrpcRouterFactory
│   │   │   │   ├── trpc.service.ts
│   │   │   │   └── trpc.controller.ts
│   │   │   ├── generator/
│   │   │   │   ├── code-generator.ts    # TrpcContractGenerator Klasse
│   │   │   │   └── run.ts               # Skript zum Ausführen des Generators
│   │   │   └── main.ts                 # Backend Startpunkt
│   │   └── package.json
│   └── frontend/       # Next.js Anwendung
│       ├── src/
│       │   ├── utils/
│       │   │   ├── trpc.ts          # tRPC Hooks Setup
│       │   │   └── react-trpc.tsx   # TRPCProvider Setup
│       │   └── app/
│       │       └── page.tsx         # Beispielkomponente mit tRPC-Aufruf
│       └── package.json
├── packages/
│   ├── trpc/           # Fungiert als Contract-Paket (Name: @mono/trpc-server)
│   │   ├── server.ts               # Definition von TRPCContext
│   │   ├── trpc-contract.ts        # GENERIERTER AppRouter für Frontend-Typen
│   │   └── package.json
│   └── ui/             # (Optional) Geteilte UI-Komponenten
├── tools/              # Alternativer Ort für den Generator, falls nicht im Backend
├── package.json        # Root package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Getting Started

### Voraussetzungen

* Node.js (empfohlen v18 oder höher, siehe `engines` in root `package.json`)
* pnpm (Version siehe `packageManager` in root `package.json`, z.B. `pnpm@9.0.0`)

### Installation

1.  Klone das Repository.
2.  Installiere die Abhängigkeiten im Root-Verzeichnis des Monorepos:
    ```bash
    pnpm install
    ```

### Umgebungsvariablen

* **Backend (`apps/backend/.env`):**
    * `PORT`: Port, auf dem das Backend läuft (Standard: `3001` wie von dir bestätigt, oder `3000` falls `PORT` nicht gesetzt).
    * `JWT_SECRET`: Geheimer Schlüssel für JWT-Authentifizierung (verwendet von `AuthService`).
    * Weitere Datenbank- oder Service-spezifische Variablen.
* **Frontend (`apps/frontend/.env.local`):**
    * `NEXT_PUBLIC_TRPC_API_URL`: (Optional, falls die tRPC URL nicht fest im Code steht) z.B. `http://localhost:3001/trpc`. Aktuell ist sie fest in `react-trpc.tsx` kodiert.

## Entwicklung

### Dev-Server starten

Um Frontend und Backend parallel im Entwicklungsmodus zu starten (mit Hot Reloading):
```bash
pnpm dev
```

Dieses Skript wird von Turborepo ausgeführt und startet die dev-Skripte der einzelnen Anwendungen (z.B. next dev für Frontend, nest start --watch für Backend).

## Linting und Formatierung
* Formatieren des gesamten Codes:
```Bash

pnpm format
```
* Linting (z.B. mit ESLint, Biome):
```Bash

pnpm lint
```
## tRPC Workflow
Der Kern dieses Projekts ist der typsichere API-Workflow mit tRPC:

1. Prozeduren im Backend definieren:

* Erstelle oder bearbeite einen NestJS Provider (z.B. apps/backend/src/user/user.trpc.ts).
* Dekoriere die Klasse mit @TrpcRouter({ domain: 'user' }), um sie als Teil eines tRPC-Routers (hier unter dem Namespace user) zu kennzeichnen.
* Definiere Methoden für Queries oder Mutations. Dekoriere diese mit @TrpcProcedure({...}).
* Gib im @TrpcProcedure-Decorator an:
  * type: 'query' oder 'mutation'.
  * isProtected: true (benötigt Authentifizierung, Standard-Middleware wird angewendet) oder false (öffentlich).
  * inputType: z.object({...}): Ein inline definiertes Zod-Schema für die Validierung der Eingabedaten.
  * outputType: z.object({...}): Ein inline definiertes Zod-Schema für die Struktur der Ausgabedaten (wichtig für den Generator und optionale Backend-Output-Validierung).
  * Implementiere die Methode mit deiner NestJS-Geschäftslogik. Sie sollte einen Wert zurückgeben, der dem outputType-Schema entspricht.

Beispiel:

```TypeScript

// apps/backend/src/user/user.trpc.ts
import { z } from 'zod';
import { TrpcRouter, TrpcProcedure } from '../trpc/decorators'; // Pfad anpassen
// ...
@TrpcRouter({ domain: 'user' })
export class UserTrpcRouter {
    // ...
    @TrpcProcedure({
        type: 'query',
        isProtected: false,
        inputType: z.object({ id: z.string() }),
        outputType: z.object({ id: z.string(), name: z.string() })
    })
    async getUserById(input: { id: string }): Promise<{ id: string; name: string }> {
        // ... deine Logik mit this.userService.findById(input.id) ...
        return { id: input.id, name: "Beispiel User" };
    }
}
```
2. tRPC Vertragsdatei generieren:
Nachdem du Änderungen an den tRPC-Prozedurdefinitionen im Backend vorgenommen hast (neue Prozeduren, geänderte Input-/Output-Schemata), musst du den Frontend-Vertrag neu generieren.

* Führe das Generierungsskript aus (angenommen, es ist in apps/backend/package.json oder der Root package.json definiert):
```Bash

pnpm --filter @mono/backend generate:trpc-contract # Beispielhafter Aufruf
```

(Das Skript apps/backend/src/generator/run.ts führt die TrpcContractGenerator-Klasse aus.)

* Dies aktualisiert die Datei packages/trpc/trpc-contract.ts. Diese Datei sollte nicht manuell bearbeitet werden und idealerweise in .gitignore stehen, wenn sie immer frisch generiert wird (oder committet werden, wenn sie Teil des "stabilen" Vertrags ist). Für den Anfang ist es besser, sie zu committen, um zu sehen, was generiert wird.
* Automatisierung (Optional für später): Für eine bessere DX kann dieser Schritt mit einem File-Watcher (wie nodemon) automatisiert werden, der bei Änderungen in den Backend *.trpc.ts-Dateien den Generator startet, oder über einen Git Pre-Commit Hook.

3. Prozeduren im Frontend verwenden:

* Importiere die tRPC-Hooks aus frontend/src/utils/trpc.ts.
* Verwende die neue tRPC v11 / TanStack Query v5 Syntax:


```ts
// frontend/src/app/page.tsx
"use client";
import { useTRPC } from "@/utils/trpc";
import { useQuery, useMutation } from "@tanstack/react-query";

export default function MyComponent() {
  const trpc = useTRPC();

  const healthcheckQuery = useQuery(
    trpc.user.getHealthcheck.queryOptions("ein beliebiger string input")
  );

  // const userByIdQuery = useQuery(
  //   trpc.user.getUserById.queryOptions({ id: "123" })
  // );

  if (healthcheckQuery.isPending) return <p>Loading healthcheck...</p>;
  if (healthcheckQuery.isError) return <p>Error: {healthcheckQuery.error.message}</p>;

  return (
    <div>
      <p>Healthcheck Status: {healthcheckQuery.data?.status} at {healthcheckQuery.data?.timestamp}</p>
      {/* <p>User: {userByIdQuery.data?.name}</p> */}
    </div>
  );
}
```
## Building für Production
```bash
pnpm build
```
Turborepo kümmert sich um die korrekte Build-Reihenfolge der Pakete und Anwendungen.

## Wichtige Skripte (aus `package.json` im Root-Verzeichnis)
* `pnpm dev`: Startet alle Anwendungen im Entwicklungsmodus.
* `pnpm build`: Baut alle Anwendungen und Pakete für die Produktion.
* `pnpm lint`: Führt Linting für das gesamte Projekt aus.
* `pnpm format`: Formatiert den Code im gesamten Projekt.
* `pnpm generate:trpc-contract` (oder ähnlich, falls im Backend oder Root definiert): Generiert den tRPC-Vertrag.

## Kerntechnologien
* TypeScript
* pnpm (mit Workspaces)
* Turborepo (Monorepo Build System)
* NestJS (Backend Framework)
* Next.js (Frontend Framework)
* tRPC (Typsichere API-Schicht)
* Zod (Schema-Validierung und Typinferenz)
* TanStack Query (React Query) (Data Fetching und State Management im Frontend)
* ts-morph (Verwendet vom TrpcContractGenerator zur Code-Analyse im Backend)
* (Optional) Biome (Formatter/Linter, basierend auf deinen Kommentaren)