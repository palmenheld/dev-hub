#!/bin/sh
set -eu

secret_file="${PALMENHELD_SECRET_FILE:-/srv/palmenheld-dev-hub/ops/.env}"
secret="$({ sed -n 's/^BLOG_CRON_SECRET=//p' "$secret_file" || true; } | head -n 1)"
secret="${secret#\"}"
secret="${secret%\"}"
secret="${secret#\'}"
secret="${secret%\'}"

if [ -z "$secret" ]; then
  exit 1
fi

case "$secret" in
  *[!A-Za-z0-9_-]*) exit 1 ;;
esac

curl --fail --silent --show-error --max-time 590 \
  --request POST \
  --header "x-palmenheld-blog-cron: $secret" \
  http://127.0.0.1:3002/api/blog/cron >/dev/null
