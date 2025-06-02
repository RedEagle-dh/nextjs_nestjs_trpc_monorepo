# Next.js + NestJS + tRPC Monorepo

A production-ready, type-safe full-stack monorepo template featuring automatic API contract generation.

## Overview

This project is a Full-Stack monorepo that combines a Next.js frontend, NestJS backend, and type-safe API layer using tRPC. The standout feature is a **custom decorator-based workflow** for defining tRPC procedures in the backend with **automatic contract generation** for the frontend.

The monorepo is managed with **pnpm Workspaces** and **Turborepo** for efficient build management and script execution.

## 🚀 What Makes This Project Special

### Revolutionary Type-Safe API Development
Instead of manually maintaining tRPC routers and keeping frontend/backend in sync, this project introduces a **decorator-based approach** where:

1. **Single Source of Truth**: Define tRPC procedures once in your NestJS services using `@TrpcRouter` and `@TrpcProcedure` decorators
2. **Automatic Contract Generation**: A custom code generator analyzes your backend decorators and automatically generates the complete tRPC contract for the frontend
3. **Zero Manual Synchronization**: No more manually updating API types or keeping schemas in sync

### Key Advantages ✅

- **🔒 End-to-End Type Safety**: From database to UI with TypeScript and tRPC
- **⚡ Developer Experience**: Write API logic once, get frontend types automatically  
- **🏗️ Domain-Driven Architecture**: Organize tRPC routes by business domains
- **📦 Monorepo Best Practices**: Efficient dependency management with pnpm and Turborepo
- **🐳 Production Ready**: Optimized Docker builds with multi-stage setup
- **🔄 Hot Reloading**: Full-stack development with instant feedback

### Trade-offs to Consider ⚠️

- **Learning Curve**: Custom decorator system requires initial understanding
- **Build Dependency**: Frontend depends on contract generation from backend
- **Complexity**: More setup compared to traditional REST APIs
- **Framework Lock-in**: Tightly coupled to NestJS and tRPC ecosystem

## Architecture

The project is structured into several core areas:

**Monorepo Management:**
- **pnpm Workspaces**: Manages dependencies across packages and applications
- **Turborepo**: Orchestrates build processes, tests, and linting with intelligent caching

**Backend (`apps/backend`):**
- Built with **NestJS**, a progressive Node.js framework for scalable server-side applications
- Handles business logic, database interactions (via `DbModule`), and authentication (`AuthService`)
- Defines tRPC procedures using custom decorators (`@TrpcRouter`, `@TrpcProcedure`) directly in NestJS providers
- `MainTrpcRouterFactory` builds the tRPC router at runtime with real implementations from decorated providers
- `TRPCController` and `TRPCService` expose the tRPC endpoint at `/trpc`

**Frontend (`apps/frontend`):**
- Built with **Next.js**, a React framework for server-side rendering and static site generation
- Uses **TanStack Query (React Query)** for data fetching and client-side state management
- Integrates tRPC via a type-safe client based on the auto-generated contract from `packages/trpc`

**tRPC Layer:**
- **`packages/trpc` (Contract Package, npm name: `@mono/trpc`):**
  - Contains `TRPCContext` definition (in `server.ts`)
  - Includes the **auto-generated tRPC contract** (`trpc-contract.ts`) with all procedures, input/output Zod schemas, and placeholder implementations for frontend type safety
- **`apps/backend/src/trpc/decorators.ts`**: Defines `@TrpcRouter` and `@TrpcProcedure` decorators for marking tRPC definitions
- **`apps/backend/src/generator/` (Code Generator Module):**
  - Contains `TrpcContractGenerator` (`code-generator.ts`) and execution script (`run.ts`)
  - Parses backend code (decorator-annotated classes/methods), extracts tRPC structure and Zod schemas, generates `trpc-contract.ts`

## Project Structure
```
t3_nest_turborepo/
├── apps/
│   ├── backend/        # NestJS Application
│   │   ├── src/
│   │   │   ├── healthcheck/    # Example domain module (healthcheck.trpc.ts)
│   │   │   ├── trpc/
│   │   │   │   ├── decorators.ts
│   │   │   │   ├── trpc.router.ts    # MainTrpcRouterFactory
│   │   │   │   ├── trpc.service.ts
│   │   │   │   └── trpc.controller.ts
│   │   │   ├── generator/
│   │   │   │   ├── code-generator.ts # TrpcContractGenerator class
│   │   │   │   └── run.ts            # Generator execution script
│   │   │   └── main.ts               # Backend entry point
│   │   └── package.json
│   └── frontend/       # Next.js Application
│       ├── src/
│       │   ├── utils/
│       │   │   ├── trpc.ts           # tRPC hooks setup
│       │   │   └── react-trpc.tsx    # TRPCProvider setup
│       │   └── app/
│       │       └── page.tsx          # Example component with tRPC usage
│       └── package.json
├── packages/
│   ├── trpc/           # Contract Package (npm: @mono/trpc)
│   │   ├── server.ts               # TRPCContext definition
│   │   ├── trpc-contract.ts        # GENERATED AppRouter for frontend types
│   │   └── package.json
│   ├── prisma/         # Database Schema & Client
│   │   ├── schema.prisma
│   │   └── package.json
│   └── ui/             # (Optional) Shared UI components
├── package.json        # Root package.json
├── pnpm-workspace.yaml
├── turbo.json
└── docker-compose.yml
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** v22+ (check `engines` in root `package.json`)
- **pnpm** (version specified in `packageManager` field, e.g., `pnpm@9.0.0`)
- **Docker** (optional, for containerized development)

### Clean Setup

1. **Clone the repository**
   ```bash
   git clone git@github.com:RedEagle-dh/t3_nest_turborepo.git
   cd t3_nest_turborepo
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   
   Checkout the .env.example files

4. **Generate Prisma client** (if using database)
   ```bash
   pnpm --filter @mono/prisma generate
   ```

5. **Build packages**
   ```bash
   pnpm build
   ```

6. **Start development servers**
   ```bash
   pnpm dev
   ```

   This starts:
   - Backend: `http://localhost:3001`
   - Frontend: `http://localhost:3000`
   - tRPC Endpoint: `http://localhost:3001/trpc`

### Docker Setup (Alternative)

```bash
# Start the entire stack
docker-compose up --build

# Or build and run backend only
cd apps/backend
docker build -t monorepo-backend .
docker run -p 3001:3001 monorepo-backend
```

## 🔧 Development Workflow

The core of this project is the type-safe API workflow with automatic contract generation:

### 1. Define Procedures in Backend

Create or edit a NestJS provider (e.g., `apps/backend/src/healthcheck/healthcheck.trpc.ts`):

```typescript
import { z } from 'zod';
import { TrpcRouter, TrpcProcedure } from '../trpc/decorators';
import { Injectable } from '@nestjs/common';

@Injectable()
@TrpcRouter({ domain: 'healthcheck' })
export class HealthcheckTrpcRouter {
  
  @TrpcProcedure({
    type: 'query',
    isProtected: false,  // Public endpoint
    inputType: z.string(),
    outputType: z.object({ 
      status: z.string(), 
      timestamp: z.string() 
    })
  })
  async getHealthcheck(input: string): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'OK',
      timestamp: new Date().toISOString()
    };
  }

  @TrpcProcedure({
    type: 'mutation',
    isProtected: true,   // Requires authentication
    inputType: z.object({ name: z.string() }),
    outputType: z.object({ id: z.string(), name: z.string() })
  })
  async createUser(input: { name: string }): Promise<{ id: string; name: string }> {
    // Your NestJS business logic here
    return { id: '123', name: input.name };
  }
}
```

### 2. Generate tRPC Contract

After making changes to tRPC procedure definitions:

```bash
pnpm --filter backend generate:trpc-contract
```

This updates `packages/trpc/trpc-contract.ts` with type-safe definitions for the frontend.

### 3. Use in Frontend

```typescript
// apps/frontend/src/app/page.tsx
"use client";
import { useTRPC } from "@/utils/trpc";
import { useQuery, useMutation } from "@tanstack/react-query";

export default function HomePage() {
  const trpc = useTRPC();

  const healthcheckQuery = useQuery(
    trpc.healthcheck.getHealthcheck.queryOptions("ping")
  );

  const createUserMutation = useMutation(
    trpc.healthcheck.createUser.mutationOptions()
  );

  if (healthcheckQuery.isPending) return <p>Loading...</p>;
  if (healthcheckQuery.isError) return <p>Error: {healthcheckQuery.error.message}</p>;

  return (
    <div>
      <h1>Health: {healthcheckQuery.data.status}</h1>
      <p>Last check: {healthcheckQuery.data.timestamp}</p>
      
      <button 
        onClick={() => createUserMutation.mutate({ name: "John" })}
        disabled={createUserMutation.isPending}
      >
        Create User
      </button>
    </div>
  );
}
```
## 📦 Available Scripts

```bash
# Development
pnpm dev              # Start all apps in development mode
pnpm dev:backend      # Start only backend in watch mode  
pnpm dev:frontend     # Start only frontend in development

# Building
pnpm build            # Build all packages and applications
pnpm build:backend    # Build only backend
pnpm build:frontend   # Build only frontend

# Code Quality
pnpm lint             # Run linting (ESLint, Biome)
pnpm format           # Format code across entire project
pnpm type-check       # TypeScript type checking

# tRPC Contract Generation
pnpm --filter backend generate:trpc-contract

# Database (if using Prisma)
pnpm --filter @mono/prisma generate    # Generate Prisma client
pnpm --filter @mono/prisma db:push     # Push schema changes to database
```

## 🏗️ Build Process

Turborepo ensures the correct build order:

1. **Prisma Client Generation** (`@mono/prisma`)
2. **tRPC Contract Generation** (`@mono/trpc`) 
3. **Backend Build** (`backend`)
4. **Frontend Build** (`frontend`)

## 🐳 Production Deployment

### Docker

```bash
# Build production image
docker build -f apps/backend/Dockerfile -t monorepo-backend .

# Run with docker-compose
docker-compose up --build
```

### Manual Deployment

```bash
# Build for production
pnpm build

# Start backend (production)
cd apps/backend && node dist/main.js

# Start frontend (production) 
cd apps/frontend && npm start
```

## 🛠️ Tech Stack

**Core Technologies:**
- **TypeScript** - End-to-end type safety
- **pnpm** (with Workspaces) - Efficient package management
- **Turborepo** - Monorepo build orchestration with caching

**Backend:**
- **NestJS** - Scalable Node.js framework
- **tRPC** - Type-safe API layer
- **Zod** - Schema validation and type inference
- **Prisma** - Database ORM and migrations
- **Redis** - Caching and session storage

**Frontend:**
- **Next.js** - React framework with SSR/SSG
- **TanStack Query** (React Query) - Data fetching and state management
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful UI components

**Development Tools:**
- **ts-morph** - TypeScript code analysis (used by contract generator)
- **Biome** - Fast formatter and linter
- **Docker** - Containerization
- **ESLint** - Code linting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Ensure code quality: `pnpm check && pnpm check:write`
5. Regenerate contracts if needed: `pnpm --filter backend generate:trpc-contract`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

If you have any questions or need help getting started:

1. Check the [existing issues](../../issues)
2. Create a new issue with the `question` label
3. Join our discussions in the [Discussions tab](../../discussions)

---

**Happy coding!** 🚀