#!/bin/sh
# Stores a secret on Railway without echoing it to the screen or shell history.
#   sh scripts/railway-set-secret.sh RESEND_API_KEY web
#   sh scripts/railway-set-secret.sh INSTAGRAM_APP_SECRET web worker
set -eu

name="$1"; shift
[ "$#" -gt 0 ] || { echo "Uso: $0 NOME_VARIABILE servizio [servizio...]" >&2; exit 1; }

printf 'Incolla il valore di %s e premi Invio (non verra mostrato): ' "$name"
stty -echo
IFS= read -r value
stty echo
printf '\n'
[ -n "$value" ] || { echo "Valore vuoto, niente salvato." >&2; exit 1; }

cd "$(dirname "$0")/.."
for service in "$@"; do
  printf '%s' "$value" | railway variable set "$name" --stdin --service "$service" --json >/dev/null
  echo "OK: $name salvata su $service (Railway sta ridistribuendo)"
done
