FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace configuration
COPY .npmrc .npmrc
COPY pnpm-workspace.yaml pnpm-workspace.yaml
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY package.json package.json

# Copy package.json files for all required packages
COPY apps/backend/package.json apps/backend/package.json
COPY packages/trpc/package.json packages/trpc/package.json
COPY packages/prisma/package.json packages/prisma/package.json

# Install all dependencies including dev dependencies for building
RUN pnpm install --filter=backend... --prod=false

# Copy source code for all packages
COPY apps/backend apps/backend
COPY packages/trpc packages/trpc
COPY packages/prisma packages/prisma

# Generate Prisma client
RUN pnpm --filter=@mono/prisma generate

# Build tRPC package
RUN pnpm --filter=@mono/trpc build

# Build backend
RUN pnpm --filter=backend build

# Production stage
FROM node:22-alpine AS runner

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nestapp

WORKDIR /app
ENV NODE_ENV="production"

RUN npm install -g pnpm

# Copy workspace configuration
COPY .npmrc .npmrc
COPY pnpm-workspace.yaml pnpm-workspace.yaml
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY package.json package.json

# Copy package.json files
COPY apps/backend/package.json apps/backend/package.json
COPY packages/trpc/package.json packages/trpc/package.json
COPY packages/prisma/package.json packages/prisma/package.json

# Install only production dependencies
RUN pnpm install --filter=backend... --prod

# Copy built artifacts from builder stage
COPY --from=builder --chown=nestapp:nodejs /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nestapp:nodejs /app/packages/trpc/dist ./packages/trpc/dist
COPY --from=builder --chown=nestapp:nodejs /app/packages/prisma/generated ./packages/prisma/generated
COPY --from=builder --chown=nestapp:nodejs /app/packages/prisma/schema.prisma ./packages/prisma/schema.prisma

# Create startup script
RUN echo $'#!/bin/sh\n\
set -e\n\
echo "Syncing database schema..."\n\
cd /app/packages/prisma && npx prisma db push --schema=./schema.prisma --accept-data-loss --skip-generate\n\
echo "Starting application..."\n\
exec node /app/apps/backend/dist/main.js' > /app/start.sh && \
chmod +x /app/start.sh && \
chown nestapp:nodejs /app/start.sh

USER nestapp
EXPOSE 3000

CMD ["/app/start.sh"]
