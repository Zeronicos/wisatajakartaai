#!/usr/bin/env bash
# Diagnosa kenapa toggle route TransJakarta masih 404 di VPS.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app}"
BACKEND_DIR="${APP_DIR}/backend"

echo "==> Commit repo"
cd "${APP_DIR}"
git rev-parse --short HEAD
git log -1 --oneline

echo
echo "==> Endpoint ada di file sumber?"
grep -n "transjakarta-routes/status" "${BACKEND_DIR}/routers/admin_master.py" || {
  echo "TIDAK ADA di admin_master.py — git pull/reset belum benar."
  exit 1
}

echo
echo "==> Status service"
systemctl is-active wjai-backend || true
systemctl status wjai-backend --no-pager | sed -n '1,12p'

echo
echo "==> Proses uvicorn di port 8000"
ss -tlnp | grep ':8000' || true

echo
echo "==> Route terdaftar di proses yang sedang jalan (openapi)"
curl -s "http://127.0.0.1:8000/openapi.json" | python3 - <<'PY'
import json, sys
data = json.load(sys.stdin)
paths = [p for p in data.get("paths", {}) if "transjakarta-routes" in p]
print("transjakarta-routes paths:", paths or "KOSONG (proses masih kode lama)")
PY

echo
echo "==> Health deployment flag"
curl -s "http://127.0.0.1:8000/health" || true
echo

echo
echo "==> Tes toggle route"
curl -s -X POST "http://127.0.0.1:8000/api/admin/transjakarta-routes/status" \
  -H "Content-Type: application/json" \
  -d '{"route_id":"1","is_active":true}'
echo
