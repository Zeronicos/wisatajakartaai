# Hardening VPS WJAI

Dokumen ini untuk Ubuntu server yang menjalankan:
- Nginx
- `wjai-backend` (FastAPI/Uvicorn)
- PostgreSQL lokal
- Ollama

## 1) Buat user non-root untuk backend

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo chown -R deploy:deploy /var/www/app/backend
```

## 2) Terapkan file hardening dari repo

Jalankan sebagai root di VPS:

```bash
cd /var/www/app
sudo APP_ROOT=/var/www/app bash scripts/ops/apply_vps_hardening.sh
```

## 3) Atur password DB backup (WAJIB)

Edit file:

```bash
sudo nano /etc/cron.d/wjai-pg-backup
```

Ganti:
- `PGPASSWORD=GANTI_PASSWORD_KUAT`

Lalu restart cron:

```bash
sudo systemctl restart cron
```

## 4) Pasang fail2ban + firewall

```bash
sudo apt update
sudo apt install -y fail2ban ufw
sudo systemctl enable --now fail2ban
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 5) Verifikasi

```bash
systemctl status wjai-backend --no-pager
systemctl status ollama --no-pager
fail2ban-client status
ufw status verbose
ls -lah /var/backups/postgres
```

## 6) Uji backup manual

```bash
sudo -E PGHOST=127.0.0.1 PGPORT=5432 PGUSER=wisata_user PGPASSWORD=ISI_PASSWORD PGDATABASE=wisata_jakarta BACKUP_DIR=/var/backups/postgres RETENTION_DAYS=7 /usr/local/bin/wjai-backup-postgres.sh
```
