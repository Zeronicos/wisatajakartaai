#!/usr/bin/env bash
# Deploy WJAI di VPS: sinkronkan kode GitHub, restart backend, rebuild frontend.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app}"

echo "==> Sync repo di ${APP_DIR}"
cd "${APP_DIR}"
git fetch origin
git reset --hard origin/main

echo "==> Restart backend (hard)"
sudo systemctl stop wjai-backend || true
sleep 2
sudo pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 1
sudo systemctl start wjai-backend
sleep 2
sudo systemctl is-active --quiet wjai-backend

echo "==> Verifikasi endpoint toggle route"
verify_resp="$(curl -s -X POST "http://127.0.0.1:8000/api/admin/transjakarta-routes/status" \
  -H "Content-Type: application/json" \
  -d '{"route_id":"1","is_active":true}')"
if [[ "${verify_resp}" == *'"detail":"Not Found"'* ]]; then
  echo "GAGAL: endpoint /api/admin/transjakarta-routes/status belum terdaftar."
  echo "Periksa log: journalctl -u wjai-backend -n 50 --no-pager"
  exit 1
fi
echo "Endpoint /api/admin/transjakarta-routes/status OK"

echo "==> Build frontend"
cd "${APP_DIR}"
npm install
npm run build

echo "==> Restart nginx"
sudo systemctl restart nginx

echo "Deploy selesai."
