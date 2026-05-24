#!/usr/bin/env bash
# Alur update data destinasi di VPS — jalankan sendiri langkah demi langkah.
#
# Contoh:
#   bash scripts/ops/update_destinations_server.sh deploy
#   bash scripts/ops/update_destinations_server.sh wiki --limit 100
#   bash scripts/ops/update_destinations_server.sh embed
#   bash scripts/ops/update_destinations_server.sh all --limit 200
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app}"
BACKEND_DIR="${APP_DIR}/backend"
VENV_PY="${BACKEND_DIR}/venv/bin/python"
WIKI_IDS_FILE="${BACKEND_DIR}/.wiki_updated_poi_ids"
WIKI_LIMIT=100
EMBED_SLEEP_MS=100

usage() {
  cat <<'EOF'
Update data destinasi di server (VPS)

Perintah:
  deploy   Sync kode GitHub + restart backend + rebuild frontend
  wiki     Backfill deskripsi dari Wikipedia (CLI)
  embed    Regenerasi embedding Ollama untuk POI yang baru punya deskripsi
  verify   Cek health backend + endpoint Wikipedia
  all      deploy → wiki → embed (satu alur lengkap)

Opsi:
  --limit N    Jumlah POI untuk backfill Wikipedia (default: 100)
  --overwrite  Timpa deskripsi yang sudah ada (Wikipedia backfill)

Contoh alur manual (disarankan):
  1. ssh root@IP_VPS
  2. cd /var/www/app && git fetch origin && git reset --hard origin/main
  3. bash scripts/ops/update_destinations_server.sh deploy
  4. bash scripts/ops/update_destinations_server.sh wiki --limit 100
  5. bash scripts/ops/update_destinations_server.sh embed
  6. bash scripts/ops/update_destinations_server.sh verify

Alternatif via Admin UI (setelah deploy):
  Admin → Destination Management → Backfill Wikipedia (50)
  lalu jalankan langkah embed di atas.
EOF
}

require_backend() {
  if [[ ! -x "${VENV_PY}" ]]; then
    echo "GAGAL: venv backend tidak ditemukan di ${VENV_PY}"
    exit 1
  fi
}

step_deploy() {
  echo "==> [1/3] Sync kode dari GitHub"
  cd "${APP_DIR}"
  git fetch origin
  git reset --hard origin/main
  echo "Commit aktif: $(git rev-parse --short HEAD)"

  echo "==> [2/3] Restart backend"
  sudo systemctl stop wjai-backend || true
  sleep 2
  sudo pkill -f "uvicorn main:app" 2>/dev/null || true
  sleep 1
  sudo systemctl start wjai-backend
  sleep 2
  sudo systemctl is-active --quiet wjai-backend

  echo "==> [3/3] Build frontend + restart nginx"
  cd "${APP_DIR}"
  npm install
  npm run build
  sudo systemctl restart nginx
  echo "Deploy selesai."
}

step_wiki() {
  require_backend
  local overwrite_flag=()
  if [[ "${OVERWRITE_WIKI}" == "true" ]]; then
    overwrite_flag=(--overwrite)
  fi

  echo "==> Backfill deskripsi Wikipedia (limit=${WIKI_LIMIT})"
  cd "${BACKEND_DIR}"
  PYTHONPATH="${BACKEND_DIR}" "${VENV_PY}" scripts/backfill_wikipedia_descriptions.py \
    --limit "${WIKI_LIMIT}" \
    --continue-on-error \
    --write-ids "${WIKI_IDS_FILE}" \
    "${overwrite_flag[@]}"

  if [[ ! -f "${WIKI_IDS_FILE}" ]]; then
    echo "Tidak ada POI baru yang di-update dari Wikipedia."
    return 0
  fi

  echo "POI terupdate disimpan di ${WIKI_IDS_FILE}"
}

step_embed() {
  require_backend
  echo "==> Regenerasi embedding (Ollama nomic-embed-text)"
  cd "${BACKEND_DIR}"

  if [[ -f "${WIKI_IDS_FILE}" ]]; then
    local ids
    ids="$(tr -d '\n' < "${WIKI_IDS_FILE}")"
    if [[ -n "${ids}" ]]; then
      echo "Embed POI hasil backfill Wikipedia: ${ids}"
      PYTHONPATH="${BACKEND_DIR}" "${VENV_PY}" data_preprocessing/generate_embeddings.py \
        --ids "${ids}" \
        --sleep-ms "${EMBED_SLEEP_MS}" \
        --continue-on-error
      return 0
    fi
  fi

  echo "Fallback: embed semua POI yang punya deskripsi tapi perlu refresh embedding"
  PYTHONPATH="${BACKEND_DIR}" "${VENV_PY}" data_preprocessing/generate_embeddings.py \
    --described \
    --sleep-ms "${EMBED_SLEEP_MS}" \
    --continue-on-error
}

step_verify() {
  echo "==> Health backend"
  curl -s "http://127.0.0.1:8000/health" || true
  echo

  echo "==> Endpoint Wikipedia terdaftar?"
  curl -s "http://127.0.0.1:8000/openapi.json" | grep -o '/api/admin/destinations[^"]*wikipedia[^"]*' || {
    echo "Endpoint Wikipedia belum ada — jalankan deploy dulu."
    exit 1
  }
  echo

  echo "==> Ollama aktif?"
  if command -v curl >/dev/null 2>&1; then
    curl -s "http://127.0.0.1:11434/api/tags" | head -c 200 || echo "Ollama tidak merespons di port 11434"
    echo
  fi

  echo "Verifikasi selesai."
}

COMMAND="${1:-}"
shift || true
OVERWRITE_WIKI="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      WIKI_LIMIT="${2:-100}"
      shift 2
      ;;
    --overwrite)
      OVERWRITE_WIKI="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opsi tidak dikenal: $1"
      usage
      exit 1
      ;;
  esac
done

case "${COMMAND}" in
  deploy) step_deploy ;;
  wiki) step_wiki ;;
  embed) step_embed ;;
  verify) step_verify ;;
  all)
    step_deploy
    step_wiki
    step_embed
    step_verify
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "Perintah tidak dikenal: ${COMMAND}"
    usage
    exit 1
    ;;
esac
