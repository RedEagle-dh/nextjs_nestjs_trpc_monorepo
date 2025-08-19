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

RUN pnpm turbo prune --scope=backend --docker

#----------------------------------------------------#
# Stage 3: Builder                                   #
#----------------------------------------------------#

FROM pruner AS builder

WORKDIR /app

ENV NODE_ENV="production"

ENV NEXT_TELEMETRY_DISABLED=1

ARG AUTH_URL
ENV AUTH_URL=${NEXTAUTH_URL}

COPY --from=pruner /app/out/json/ .

RUN pnpm install --prod=false

COPY --from=pruner /app/out/full/ .

RUN pnpm --filter=@mono/database build

RUN pnpm --filter=backend build

#----------------------------------------------------#
# Stage 4: Runner                                    #
#----------------------------------------------------#

FROM base AS runner

WORKDIR /app

ENV NODE_ENV="production"

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache \
    openssl

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestapp

COPY --from=pruner /app/out/json/ .

COPY pnpm-lock.yaml .

COPY pnpm-workspace.yaml .

RUN pnpm install --prod

COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

COPY --from=builder /app/packages/database/dist ./apps/backend/node_modules/@mono/database/dist

COPY --from=builder /app/packages/database/generated ./apps/backend/node_modules/@mono/database/generated

COPY --from=builder /app/packages/database/prisma ./packages/database/prisma

COPY --from=builder /app/apps/backend/docker-entrypoint.sh .

RUN chmod +x docker-entrypoint.sh

RUN chown -R nestapp:nodejs .

USER nestapp

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]

CMD ["node", "apps/backend/dist/main.js"]
