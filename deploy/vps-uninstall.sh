#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/telegram-bot}"
SERVICE_NAME="${SERVICE_NAME:-telegram-bot}"
BACKUP_SERVICE_NAME="${BACKUP_SERVICE_NAME:-telegram-bot-backup}"
PURGE_APP="${PURGE_APP:-1}"     # 1 = delete /opt/telegram-bot
PURGE_DATA="${PURGE_DATA:-1}"   # 1 = delete data/backups together with app

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

echo "This will uninstall bot services:"
echo "- ${SERVICE_NAME}.service"
echo "- ${BACKUP_SERVICE_NAME}.service"
echo "- ${BACKUP_SERVICE_NAME}.timer"
echo "APP_DIR=${APP_DIR} (PURGE_APP=${PURGE_APP}, PURGE_DATA=${PURGE_DATA})"
echo

if [[ -t 0 ]]; then
  read -r -p "Type 'DELETE' to continue: " confirm
  if [[ "${confirm}" != "DELETE" ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

systemctl disable --now "${SERVICE_NAME}.service" 2>/dev/null || true
systemctl disable --now "${BACKUP_SERVICE_NAME}.timer" 2>/dev/null || true
systemctl stop "${BACKUP_SERVICE_NAME}.service" 2>/dev/null || true

rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
rm -f "/etc/systemd/system/${BACKUP_SERVICE_NAME}.service"
rm -f "/etc/systemd/system/${BACKUP_SERVICE_NAME}.timer"
systemctl daemon-reload

if [[ "${PURGE_APP}" == "1" && -d "${APP_DIR}" ]]; then
  if [[ "${PURGE_DATA}" == "1" ]]; then
    rm -rf "${APP_DIR}"
  else
    find "${APP_DIR}" -mindepth 1 -maxdepth 1 \
      ! -name data \
      ! -name backups \
      -exec rm -rf {} +
  fi
fi

echo "Uninstall complete."
