#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/telegram-bot}"
BRANCH="${BRANCH:-main}"
PROFILE="${PROFILE:-default}" # default | test
SERVICE_NAME="${SERVICE_NAME:-telegram-bot}"

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo -E bash "$0" "$@"
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "ERROR: ${APP_DIR} is not a git repository. Run install/deploy first."
  exit 1
fi

RUN_USER="$(stat -c '%U' "${APP_DIR}")"
if [[ -z "${RUN_USER}" || "${RUN_USER}" == "UNKNOWN" ]]; then
  RUN_USER="root"
fi

run_as_user() {
  local cmd="$1"
  if [[ "${RUN_USER}" == "root" ]]; then
    bash -lc "cd '${APP_DIR}' && ${cmd}"
  else
    sudo -u "${RUN_USER}" bash -lc "cd '${APP_DIR}' && ${cmd}"
  fi
}

echo "[1/5] Fetching latest commits from origin/${BRANCH}..."
run_as_user "git fetch origin ${BRANCH} --prune"

LOCAL_SHA="$(run_as_user "git rev-parse HEAD")"
REMOTE_SHA="$(run_as_user "git rev-parse origin/${BRANCH}")"

if [[ "${LOCAL_SHA}" == "${REMOTE_SHA}" ]]; then
  echo "No updates: already on latest commit (${LOCAL_SHA})."
  exit 0
fi

DIRTY_COUNT="$(run_as_user "git status --porcelain | wc -l")"
if [[ "${DIRTY_COUNT}" != "0" ]]; then
  echo "ERROR: Local repository has uncommitted changes. Commit/stash them first."
  exit 1
fi

if ! run_as_user "git merge-base --is-ancestor HEAD origin/${BRANCH}"; then
  echo "ERROR: Local branch is ahead/diverged from origin/${BRANCH}. Auto-update aborted."
  echo "Resolve manually: inspect git log and decide merge/rebase/reset."
  exit 1
fi

echo "[2/5] Pulling updates..."
run_as_user "git checkout ${BRANCH}"
run_as_user "git pull --ff-only origin ${BRANCH}"

echo "[3/5] Installing dependencies + build..."
run_as_user "npm install"
run_as_user "npm run build"

echo "[4/5] Applying DB init/migrations for profile=${PROFILE}..."
if [[ "${PROFILE}" == "default" ]]; then
  run_as_user "npm run db:init"
else
  run_as_user "npm run db:init:${PROFILE}"
fi

echo "[5/5] Restarting service ${SERVICE_NAME}..."
systemctl restart "${SERVICE_NAME}.service"

NEW_SHA="$(run_as_user "git rev-parse HEAD")"
echo "Update complete: ${LOCAL_SHA} -> ${NEW_SHA}"
echo "Check logs: journalctl -u ${SERVICE_NAME} -f"
