#!/bin/sh

set -e

echo "Running database migrations..."

pnpm --filter=@mono/database exec prisma migrate deploy

echo "Migrations complete. Starting the application..."

exec "$@"