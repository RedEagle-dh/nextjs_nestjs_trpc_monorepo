FROM node:22-alpine AS base

WORKDIR /app

RUN corepack enable

#----------------------------------------------------#
# Stage 2: Pruner                                    #
#----------------------------------------------------#

FROM base AS pruner

WORKDIR /app

COPY . .

RUN pnpm install --prod=false

RUN pnpm turbo prune --scope=frontend --docker

#----------------------------------------------------#
# Stage 3: Builder                                   #
#----------------------------------------------------#

FROM pruner AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=pruner /app/out/json/ .

RUN pnpm install --prod=false

COPY --from=pruner /app/out/full/ .

RUN pnpm turbo build --filter=frontend

#----------------------------------------------------#
# Stage 4: Runner                                    #
#----------------------------------------------------#

FROM pruner AS runner

WORKDIR /app

ENV NODE_ENV="production"

ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static

COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "apps/frontend/server.js"]