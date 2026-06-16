#!/usr/bin/env bash
# Terapkan koordinat kanon PDF_001–PDF_140 ke database di VPS.
# Jalankan SETELAH git pull / deploy (butuh backend/data/pdf140_google_coords.json).
#
# Contoh:
#   ssh root@IP_VPS
#   cd /var/www/app && git fetch origin && git reset --hard origin/main
#   bash scripts/ops/apply_pdf140_coords_server.sh
#   bash scripts/ops/apply_pdf140_coords_server.sh --verify-only
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app}"
BACKEND_DIR="${APP_DIR}/backend"
VENV_PY="${BACKEND_DIR}/venv/bin/python"

if [[ ! -x "${VENV_PY}" ]]; then
  echo "GAGAL: venv backend tidak ditemukan di ${VENV_PY}"
  exit 1
fi

cd "${BACKEND_DIR}"

if [[ ! -f "data/pdf140_google_coords.json" ]]; then
  echo "GAGAL: data/pdf140_google_coords.json belum ada — git pull dulu."
  exit 1
fi

if [[ "${1:-}" == "--verify-only" ]]; then
  PYTHONPATH="${BACKEND_DIR}" "${VENV_PY}" scripts/verify_pdf140_coords_db.py
  exit $?
fi

echo "==> Sinkron destinasi aktif PDF_140 (tanpa hapus data)"
PYTHONPATH="${BACKEND_DIR}" "${VENV_PY}" scripts/sync_pdf140_active_destinations.py

echo "==> Verifikasi koordinat DB vs JSON"
PYTHONPATH="${BACKEND_DIR}" "${VENV_PY}" scripts/verify_pdf140_coords_db.py

echo "Koordinat + destinasi aktif PDF_140 di server sudah selaras."
