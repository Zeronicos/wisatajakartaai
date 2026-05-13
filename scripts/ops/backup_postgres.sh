#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=wisata_user PGPASSWORD=... PGDATABASE=wisata_jakarta \
#   BACKUP_DIR=/var/backups/postgres RETENTION_DAYS=7 ./backup_postgres.sh

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DB_NAME="${PGDATABASE:-}"

if [[ -z "${DB_NAME}" ]]; then
  echo "[ERROR] PGDATABASE belum diset."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
TIMESTAMP="$(date +%F-%H%M%S)"
OUT_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"

pg_dump --no-owner --no-privileges | gzip -9 > "${OUT_FILE}"
find "${BACKUP_DIR}" -type f -name "${DB_NAME}-*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "[OK] Backup selesai: ${OUT_FILE}"
