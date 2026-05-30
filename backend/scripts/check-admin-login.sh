#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://apit.beemadiary.com}"
EMAIL="${EMAIL:-admin@beemadiary.com}"
PASSWORD="${PASSWORD:-kathmandu@kts@123}"

curl -i -X POST "${API_BASE_URL%/}/api/admin/login" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d "$(cat <<EOF
{
  \"email\": \"${EMAIL}\",
  \"password\": \"${PASSWORD}\"
}
EOF
)"
