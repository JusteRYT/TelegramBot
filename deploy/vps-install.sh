#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/JusteRYT/TelegramBot.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/telegram-bot}"
PROFILE="${PROFILE:-default}" # default | test
SERVICE_NAME="${SERVICE_NAME:-telegram-bot}"
BACKUP_SERVICE_NAME="${BACKUP_SERVICE_NAME:-telegram-bot-backup}"
NODE_MAJOR="${NODE_MAJOR:-22}"
DB_SOURCE_PATH="${DB_SOURCE_PATH:-}"   # e.g. /tmp/app.db
DB_SOURCE_URL="${DB_SOURCE_URL:-}"     # e.g. https://example.com/app.db
MIGRATE_TEST_DB_TO_DEFAULT="${MIGRATE_TEST_DB_TO_DEFAULT:-1}"

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

RUN_USER="${SUDO_USER:-root}"
if [[ "${RUN_USER}" == "root" ]]; then
  RUN_HOME="/root"
else
  RUN_HOME="$(getent passwd "${RUN_USER}" | cut -d: -f6)"
fi

echo "[1/8] Installing base packages..."
apt-get update -y
apt-get install -y git curl ca-certificates rsync

if ! command -v node >/dev/null 2>&1; then
  echo "[2/8] Installing Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
else
  echo "[2/8] Node.js already installed: $(node -v)"
fi

echo "[3/8] Preparing app directory..."
mkdir -p "${APP_DIR}"
chown -R "${RUN_USER}:${RUN_USER}" "${APP_DIR}"

if [[ -d "${APP_DIR}/.git" ]]; then
  echo "[4/8] Updating existing repository..."
  sudo -u "${RUN_USER}" git -C "${APP_DIR}" fetch --all --prune
  sudo -u "${RUN_USER}" git -C "${APP_DIR}" checkout "${BRANCH}"
  sudo -u "${RUN_USER}" git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
else
  echo "[4/8] Cloning repository..."
  sudo -u "${RUN_USER}" git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

ENV_FILE=".env"
if [[ "${PROFILE}" != "default" ]]; then
  ENV_FILE=".env.${PROFILE}"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[5/8] Creating ${ENV_FILE} from .env.example..."
  cp .env.example "${ENV_FILE}"
  chown "${RUN_USER}:${RUN_USER}" "${ENV_FILE}"
fi

current_token="$(grep -E '^TELEGRAM_BOT_TOKEN=' "${ENV_FILE}" | head -n1 | cut -d'=' -f2- || true)"
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  if [[ -n "${current_token}" && "${current_token}" != "replace_with_real_bot_token" ]]; then
    TELEGRAM_BOT_TOKEN="${current_token}"
  elif [[ -t 0 ]]; then
    while [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; do
      read -r -p "Enter TELEGRAM_BOT_TOKEN: " TELEGRAM_BOT_TOKEN
    done
  else
    echo "ERROR: TELEGRAM_BOT_TOKEN is empty and interactive input is unavailable."
    echo "Pass token explicitly: TELEGRAM_BOT_TOKEN='...' sudo bash deploy/vps-install.sh"
    exit 1
  fi
fi

set_env_value() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    return
  fi

  if grep -qE "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|g" "${ENV_FILE}"
  else
    echo "${key}=${value}" >> "${ENV_FILE}"
  fi
}

# Optional inline env overrides for fully unattended deploy.
set_env_value "TELEGRAM_BOT_TOKEN" "${TELEGRAM_BOT_TOKEN:-}"
set_env_value "TELEGRAM_ALLOWED_ADMIN_IDS" "${TELEGRAM_ALLOWED_ADMIN_IDS:-}"
set_env_value "TELEGRAM_BOT_USERNAME" "${TELEGRAM_BOT_USERNAME:-}"
set_env_value "TELEGRAM_GROUP_INVITE_URL" "${TELEGRAM_GROUP_INVITE_URL:-}"
set_env_value "TELEGRAM_CANDIDATE_BOT_USERNAME" "${TELEGRAM_CANDIDATE_BOT_USERNAME:-}"
set_env_value "TELEGRAM_CANDIDATE_BOT_API_URL" "${TELEGRAM_CANDIDATE_BOT_API_URL:-}"
set_env_value "MAIN_CHAT_ID" "${MAIN_CHAT_ID:-}"
set_env_value "GENERAL_CHAT_ID" "${GENERAL_CHAT_ID:-}"
set_env_value "ANNOUNCEMENT_TOPIC_ID" "${ANNOUNCEMENT_TOPIC_ID:-}"
set_env_value "ADMIN_CHAT_ID" "${ADMIN_CHAT_ID:-}"
set_env_value "ADMIN_TOPIC_ID" "${ADMIN_TOPIC_ID:-}"
set_env_value "DATABASE_PATH" "${DATABASE_PATH:-}"
set_env_value "BACKUP_DIR" "${BACKUP_DIR:-}"
set_env_value "BACKUP_RETENTION_DAYS" "${BACKUP_RETENTION_DAYS:-}"
set_env_value "ADMIN_USERNAME" "${ADMIN_USERNAME:-}"
set_env_value "ADMIN_PASSWORD" "${ADMIN_PASSWORD:-}"

chown "${RUN_USER}:${RUN_USER}" "${ENV_FILE}"

resolve_db_path() {
  local raw_db_path
  raw_db_path="$(grep -E '^DATABASE_PATH=' "${ENV_FILE}" | head -n1 | cut -d'=' -f2- || true)"
  if [[ -z "${raw_db_path}" ]]; then
    raw_db_path="./data/app.db"
  fi

  if [[ "${raw_db_path}" = /* ]]; then
    echo "${raw_db_path}"
  else
    echo "${APP_DIR}/${raw_db_path#./}"
  fi
}

DB_PATH="$(resolve_db_path)"
DB_DIR="$(dirname "${DB_PATH}")"
mkdir -p "${DB_DIR}"
chown -R "${RUN_USER}:${RUN_USER}" "${DB_DIR}"

if [[ ! -f "${DB_PATH}" ]]; then
  if [[ -n "${DB_SOURCE_PATH}" && -f "${DB_SOURCE_PATH}" ]]; then
    echo "Restoring DB from local source: ${DB_SOURCE_PATH} -> ${DB_PATH}"
    cp -f "${DB_SOURCE_PATH}" "${DB_PATH}"
  elif [[ -n "${DB_SOURCE_URL}" ]]; then
    echo "Downloading DB from URL: ${DB_SOURCE_URL}"
    curl -fsSL "${DB_SOURCE_URL}" -o "${DB_PATH}"
  elif [[ "${PROFILE}" == "default" && "${MIGRATE_TEST_DB_TO_DEFAULT}" == "1" && -f "${APP_DIR}/data/app.test.db" ]]; then
    echo "Migrating existing test DB to default DB: data/app.test.db -> ${DB_PATH}"
    cp -f "${APP_DIR}/data/app.test.db" "${DB_PATH}"
  fi
  chown "${RUN_USER}:${RUN_USER}" "${DB_PATH}" 2>/dev/null || true
fi

echo "[6/8] Installing dependencies + build..."
sudo -u "${RUN_USER}" npm install
sudo -u "${RUN_USER}" npm run build

echo "[7/8] Running DB init for profile=${PROFILE}..."
if [[ "${PROFILE}" == "default" ]]; then
  sudo -u "${RUN_USER}" npm run db:init
  START_CMD="/usr/bin/npm start"
  BACKUP_CMD="/usr/bin/npm run backup:db"
else
  sudo -u "${RUN_USER}" npm run "db:init:${PROFILE}"
  START_CMD="/usr/bin/npm run start:${PROFILE}"
  BACKUP_CMD="/usr/bin/npm run backup:db:${PROFILE}"
fi

echo "[8/8] Installing systemd services..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Telegram Bot Platform
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${START_CMD}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/${BACKUP_SERVICE_NAME}.service" <<EOF
[Unit]
Description=Telegram Bot SQLite Backup
After=network.target

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${BACKUP_CMD}
EOF

cat > "/etc/systemd/system/${BACKUP_SERVICE_NAME}.timer" <<EOF
[Unit]
Description=Run Telegram Bot DB backup daily

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
Unit=${BACKUP_SERVICE_NAME}.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"
systemctl enable --now "${BACKUP_SERVICE_NAME}.timer"
systemctl restart "${SERVICE_NAME}.service"

echo
echo "Deployment complete."
echo "- Service: ${SERVICE_NAME}.service"
echo "- Backup timer: ${BACKUP_SERVICE_NAME}.timer"
echo "- Env file: ${APP_DIR}/${ENV_FILE}"
echo "- DB path: ${DB_PATH}"
echo
echo "Useful commands:"
echo "  systemctl status ${SERVICE_NAME} --no-pager"
echo "  journalctl -u ${SERVICE_NAME} -f"
echo "  systemctl list-timers | grep ${BACKUP_SERVICE_NAME}"
echo "  systemctl start ${BACKUP_SERVICE_NAME}.service"
