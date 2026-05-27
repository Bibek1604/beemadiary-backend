#!/usr/bin/env bash
set -euo pipefail

# Simple deploy script for manual deployments (no CI/CD)
# Place this repo on the server and run ./deploy.sh from the backend/backend folder.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$REPO_DIR/logs"
ECOSYSTEM="$REPO_DIR/ecosystem.config.js"
APP_NAME="dashboard-overview-api"
BRANCH=${BRANCH:-main}

echo "Deploying ${APP_NAME} from ${REPO_DIR} (branch: ${BRANCH})"

# Ensure logs directory exists
if [ ! -d "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR"
  echo "Created logs dir: $LOG_DIR"
fi

cd "$REPO_DIR"

# Fetch latest and reset to remote branch
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Fetching latest from origin/${BRANCH}..."
  git fetch origin ${BRANCH}
  git reset --hard origin/${BRANCH}
else
  echo "Not a git repo. Exiting."
  exit 1
fi

# Install production dependencies
echo "Installing production dependencies..."
npm ci --production

# Build
echo "Building project..."
npm run build

# Start or reload PM2
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "Reloading PM2 process ${APP_NAME}..."
  pm2 reload "$ECOSYSTEM" --env production || pm2 restart "$APP_NAME"
else
  echo "Starting PM2 process ${APP_NAME}..."
  pm2 start "$ECOSYSTEM" --env production
fi

# Save PM2 list so it restarts on reboot
pm2 save || true

echo "Deploy complete. Tail logs with: pm2 logs ${APP_NAME} --lines 200"
