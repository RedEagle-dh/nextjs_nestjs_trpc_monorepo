# Stage 1: Build the Next.js application
FROM node:22-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install pnpm
RUN npm install -g pnpm

# Copy workspace/meta files
COPY .npmrc .npmrc
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy package.json of frontend and tRPC
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/trpc/package.json ./packages/trpc/package.json

# Install dependencies for frontend (including tRPC via workspace)
RUN pnpm install --filter=frontend... --prod=false

# Copy source code
COPY apps/frontend ./apps/frontend
COPY packages/trpc ./packages/trpc

# Build the frontend (this creates .next/standalone under apps/frontend)
RUN pnpm --filter=frontend build

# Stage 2: Production image
FROM node:22-alpine AS runner

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy the standalone output from the builder into /app
# - /app/apps/frontend/.next/standalone should contain server.js, package.json, and node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone /app

# Copy the Next.js “static” folder so that the server can serve it
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static /app/apps/frontend/.next/static

# Copy the public folder so that static assets (e.g. images) are available
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public /app/apps/frontend/public

USER nextjs
EXPOSE 3000
ENV PORT=3000

# Start the Next.js server from the standalone output
CMD ["node", "apps/frontend/server.js"]
