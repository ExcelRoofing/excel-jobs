#!/bin/sh
# Daily backup of Excel Jobs, then a copy off the server.
# Local copies live in $DATA_DIR/backups. Off-server copy uses rclone.
# Run once: BACKUP_ONCE=1 ./scripts/backup-offsite.sh
# The compose backup service leaves BACKUP_ONCE unset and repeats every day.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DATA_DIR="${DATA_DIR:-$ROOT/data}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
REMOTE="${RCLONE_REMOTE:-}"
export NODE_OPTIONS="${NODE_OPTIONS:---disable-warning=ExperimentalWarning}"

if [ -f /config/rclone/rclone.conf ]; then
  export RCLONE_CONFIG=/config/rclone/rclone.conf
fi

run_once() {
  echo "excel-jobs backup: local copy"
  node "$ROOT/scripts/backup.mjs"

  if [ -d "$DATA_DIR/backups" ]; then
    find "$DATA_DIR/backups" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION" -exec rm -rf {} +
  fi

  if [ -z "$REMOTE" ]; then
    echo "excel-jobs backup: off-server copy skipped. Set RCLONE_REMOTE." >&2
    if [ "${BACKUP_REQUIRE_OFFSITE:-}" = "1" ]; then
      exit 1
    fi
    return 0
  fi

  if ! command -v rclone >/dev/null 2>&1; then
    echo "excel-jobs backup: rclone is not installed." >&2
    exit 1
  fi

  echo "excel-jobs backup: copy to $REMOTE"
  rclone copy "$DATA_DIR/backups" "$REMOTE" --create-empty-src-dirs
  rclone delete "$REMOTE" --min-age "${RETENTION}d" || true
  rclone rmdirs "$REMOTE" --leave-root || true
  echo "excel-jobs backup: off-server copy done"
}

if [ "${BACKUP_ONCE:-}" = "1" ]; then
  run_once
  exit 0
fi

while true; do
  if ! run_once; then
    echo "excel-jobs backup: run failed" >&2
    if [ "${BACKUP_REQUIRE_OFFSITE:-}" = "1" ]; then
      exit 1
    fi
  fi
  echo "excel-jobs backup: next run in ${INTERVAL}s"
  sleep "$INTERVAL"
done
