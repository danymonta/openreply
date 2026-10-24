#!/bin/sh
# Single entrypoint for every process the image runs, chosen by OPENREPLY_ROLE.
# Platforms like Railway build one image per service from the same repo, so
# switching on an env var avoids per-service start-command settings.
#
#   web    (default) apply pending migrations, then serve the app on $PORT
#   worker send the queued DMs
#   cron   run the /api/cron scheduler (scripts/cron.sh)

set -eu

case "${OPENREPLY_ROLE:-web}" in
  web)
    npx prisma migrate deploy
    exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  worker)
    exec npm run worker
    ;;
  cron)
    exec sh scripts/cron.sh
    ;;
  *)
    echo "Unknown OPENREPLY_ROLE: ${OPENREPLY_ROLE}" >&2
    exit 1
    ;;
esac
