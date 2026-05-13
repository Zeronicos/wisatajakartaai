#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "[ERROR] Jalankan script ini sebagai root (sudo)."
  exit 1
fi

APP_ROOT="${APP_ROOT:-/var/www/app}"

install -d /etc/systemd/system/ollama.service.d
install -d /etc/fail2ban/jail.d
install -d /etc/cron.d
install -d /var/backups/postgres

install -m 0644 "${APP_ROOT}/etc/systemd/system/wjai-backend.service" /etc/systemd/system/wjai-backend.service
install -m 0644 "${APP_ROOT}/etc/systemd/system/ollama.service.d/override.conf" /etc/systemd/system/ollama.service.d/override.conf
install -m 0644 "${APP_ROOT}/etc/fail2ban/jail.d/wjai.local" /etc/fail2ban/jail.d/wjai.local
install -m 0644 "${APP_ROOT}/etc/cron.d/wjai-pg-backup" /etc/cron.d/wjai-pg-backup
install -m 0755 "${APP_ROOT}/scripts/ops/backup_postgres.sh" /usr/local/bin/wjai-backup-postgres.sh

systemctl daemon-reload
systemctl enable --now wjai-backend
systemctl restart wjai-backend
systemctl restart ollama || true
systemctl enable --now fail2ban

echo "[OK] Hardening dasar terpasang."
echo "[INFO] Verifikasi:"
echo "  systemctl status wjai-backend --no-pager"
echo "  systemctl status ollama --no-pager"
echo "  fail2ban-client status"
