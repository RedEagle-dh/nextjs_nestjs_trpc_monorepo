# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js + NestJS + tRPC monorepo with automatic API contract generation. The project uses a custom decorator-based workflow for defining tRPC procedures in the backend with automatic type-safe contract generation for the frontend.

### Architecture

- **Monorepo Management**: pnpm workspaces + Turborepo
- **Backend**: NestJS with custom tRPC decorators
- **Frontend**: Next.js with TanStack Query
- **Database**: Prisma ORM with PostgreSQL
- **Type Safety**: End-to-end type safety via tRPC contract generation

## Common Commands

### Development
```bash
# Start all services (backend, frontend)
pnpm dev

# Start individual services
pnpm --filter=frontend dev        # Frontend only
pnpm --filter=backend start:dev   # Backend only
```

### Building
```bash
# Build everything in correct order
pnpm build

# Build specific apps
pnpm --filter=backend build
pnpm --filter=frontend build
```

### Code Quality
```bash
# Run linter with Biome
pnpm check

# Fix linting issues
pnpm check:write
```

### Database Operations
```bash
# Generate Prisma client and Zenstack routers
pnpm --filter=@mono/database generate

# Build database package
pnpm --filter=@mono/database build

# Run database migrations
pnpm --filter=@mono/database migrate
```

### tRPC Contract Generation
```bash
# Generate tRPC contract from backend decorators
pnpm --filter=backend generate:trpc-contract
```

### Testing
```bash
# Run backend tests
pnpm --filter=backend test

# Run specific test
pnpm --filter=backend test -- path/to/test.spec.ts
```

### Clean Project
```bash
# Remove all generated files, node_modules, and build artifacts
pnpm clean
```

## Critical Development Workflow

### TODO Management and Type Safety

**IMPORTANT**: After completing each TODO item, ALWAYS:
1. Check for type errors in the affected files
2. Fix any type errors immediately before moving to the next task
3. Run type checking commands if available:
   - Backend: `pnpm --filter=backend tsc --noEmit`
   - Frontend: `pnpm --filter=frontend tsc --noEmit`

### Adding New tRPC Procedures

**IMPORTANT**: Zenstack automatically generates tRPC routers from Prisma models with domain names matching the model names. To avoid conflicts, **ALL custom tRPC routers MUST use a "c" prefix** in their domain name.

1. **Create tRPC Router Class** in backend:
```typescript
// apps/backend/src/[module]/[module].trpc.ts
@Injectable()
@TrpcRouter({ domain: 'cExample' })  // MUST start with 'c' prefix!
export class MyTrpcRouter {
  @TrpcProcedure({
    type: 'query',
    isProtected: false,  // or true for auth-required
    inputType: z.object({ id: z.string() }),
    outputType: z.object({ data: z.string() })
  })
  async myProcedure(params: TrpcProcedureParameters<typeof inputSchema>) {
    // Implementation
  }
}
```

2. **Add to Module**:
```typescript
// apps/backend/src/[module]/[module].module.ts
@Module({
  providers: [MyService, MyTrpcRouter],
  exports: [MyService]
})
```

3. **Generate Contract**:
```bash
pnpm --filter=backend generate:trpc-contract
```

4. **Use in Frontend**:
```typescript
const trpc = useTRPC();
const query = useQuery(
  trpc.cExample.myProcedure.queryOptions({ id: '123' })
);
```

### Build Dependencies Order

The build process MUST follow this order due to dependencies:

1. `pnpm --filter=backend generate:trpc-contract` - Generate tRPC contract
2. `pnpm --filter=@mono/database generate` - Generate database clients
3. `pnpm --filter=@mono/database build` - Build database package
4. `pnpm --filter=backend build` - Build backend
5. `pnpm --filter=frontend build` - Build frontend

## Key Architecture Patterns

### Frontend Performance Guidelines

When working with React components in the frontend:
- **Always use `useMemo`** for expensive computations to prevent unnecessary recalculations
- **Always use `useCallback`** for function definitions passed as props to prevent unnecessary re-renders
- This is especially important when using tRPC queries with computed options or when passing callbacks to child components

Example:
```typescript
const queryOptions = useMemo(
  () => trpc.cExample.getData.queryOptions({ id }),
  [id]
);

const handleClick = useCallback((data: string) => {
  // Handle click
}, []);
```

### tRPC Decorator System

- **@TrpcRouter**: Marks a class as a tRPC router source
  - `domain` parameter MUST be unique across the entire project
  - **MUST use "c" prefix** (e.g., `cExample`, `cAuth`, `cHealthcheck`) to avoid conflicts with Zenstack-generated routers
  - Zenstack automatically generates routers from Prisma models using the model name as domain
- **@TrpcProcedure**: Defines a tRPC procedure on a method
  - `type`: 'query' or 'mutation'
  - `isProtected`: true requires authentication
  - `inputType`/`outputType`: Zod schemas for type safety

### Code Generator

The custom code generator (`apps/backend/src/generator/`) parses TypeScript AST to:
- Extract all @TrpcRouter decorated classes
- Generate type-safe tRPC contract in `packages/database/src/trpc-contract.ts`
- Provide placeholder implementations for frontend type inference

### Authentication

- JWT-based authentication with access/refresh token rotation
- Protected procedures require valid JWT token
- Auth context available in `ctx.user` for protected procedures

## Environment Setup

### Backend (.env)
```
PORT=3001
JWT_SECRET=your_jwt_secret
DATABASE_URL=postgres://user:password@localhost:5432/postgres
REDIS_URL=redis://localhost:6379
ACCESS_TOKEN_EXPIRES_IN_SECONDS=900
REFRESH_TOKEN_EXPIRES_IN_SECONDS=604800
NODE_ENV=development
ENCRYPTION_KEY=your_base64_key
```

### Frontend (.env)
```
PORT=3000
AUTH_SECRET=your_auth_secret
AUTH_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
HOSTNAME=0.0.0.0
```

### Database Package (.env)
```
DATABASE_URL=postgres://user:password@localhost:5432/postgres
```

## Common Pitfalls

1. **Domain Name Conflicts**: 
   - ALWAYS use "c" prefix for custom tRPC routers (e.g., `cExample` not `example`)
   - Zenstack generates routers for Prisma models using the model name as domain
   - Never use the same domain name for multiple @TrpcRouter decorators
2. **Build Order**: Always generate contracts before building
3. **Type Sync**: After changing procedure signatures, always regenerate contracts
4. **Module Registration**: Ensure tRPC router classes are added to their module's providers
5. **Protected Routes**: Remember to handle authentication state in frontend for protected procedures

## File Locations

- **Backend tRPC Routers**: `apps/backend/src/*/**.trpc.ts`
- **Generated Contract**: `packages/database/src/trpc-contract.ts`
- **Frontend tRPC Setup**: `apps/frontend/src/utils/trpc.ts`
- **tRPC Decorators**: `apps/backend/src/trpc/decorators.ts`
- **Code Generator**: `apps/backend/src/generator/`