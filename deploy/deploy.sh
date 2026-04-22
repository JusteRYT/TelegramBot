#!/usr/bin/env bash
set -e

APP_DIR="/opt/telegram-bot"

echo "Deploying app into ${APP_DIR}"
mkdir -p "${APP_DIR}"
rsync -av --delete ./ "${APP_DIR}/" --exclude node_modules --exclude dist --exclude .git

cd "${APP_DIR}"
npm install
npm run build
npm run db:init

echo "Deploy finished. Configure systemd or run: npm start"
