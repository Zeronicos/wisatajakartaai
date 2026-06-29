# Wisata Jakarta AI (WJAI)

Sistem rekomendasi wisata Jakarta berbasis **semantic search** (embedding Ollama), **clustering K-Means**, perencanaan **itinerary multi-hari**, dan rekomendasi **transit TransJakarta** (GTFS).

| Lapisan | Teknologi |
|---------|-----------|
| Frontend | Next.js 14, React, Tailwind CSS, Leaflet |
| Backend | FastAPI, Uvicorn |
| Database | PostgreSQL |
| ML / Search | Ollama (`nomic-embed-text`), scikit-learn, ChromaDB |

**URL produksi:** [wisatajakartaai.com](https://wisatajakartaai.com) · API: `https://api.wisatajakartaai.com`

---

## Struktur program

```
wisatajakartaai/
├── app/                          # Halaman Next.js (App Router)
│   ├── page.tsx                  # Beranda / landing
│   ├── planner/                  # Form perencana perjalanan
│   ├── itinerary/                # Hasil itinerary + tab Transit
│   ├── cluster/                  # Hasil clustering destinasi
│   ├── eda/                      # Exploratory data analysis
│   ├── auth/user/                # Login & reset password pengguna
│   ├── user/                     # Profil & riwayat pengguna
│   ├── admin/                    # Panel admin (destinasi, GTFS, kota, dll.)
│   └── wjai-internal-admin-login/ # Gerbang login admin tersembunyi
│
├── components/                   # Komponen UI React (peta, auth, itinerary, …)
├── lib/                          # Klien API, tipe TypeScript, utilitas frontend
├── public/                       # Asset statis
├── scripts/
│   ├── free-dev-ports.cjs        # Bebaskan port 3000/8000 sebelum dev
│   └── ops/                      # Skrip operasional VPS (deploy, backup, hardening)
│
├── backend/
│   ├── main.py                   # Entry point FastAPI
│   ├── database.py               # Koneksi PostgreSQL
│   ├── routers/                  # Endpoint REST API
│   │   ├── search.py             # Semantic search destinasi
│   │   ├── cluster.py            # K-Means clustering
│   │   ├── route.py              # Rute jalan & walk-leg
│   │   ├── transit.py            # Itinerary transit TransJakarta
│   │   ├── hotels.py             # Rekomendasi hotel
│   │   ├── eda.py                # Statistik & visualisasi data
│   │   ├── admin_master.py       # CRUD master data admin
│   │   └── auth_history.py       # Auth, riwayat cluster/itinerary
│   ├── services/                 # Logika bisnis (transit, GTFS, routing, …)
│   ├── data_preprocessing/       # Schema DB, import, generate embedding
│   ├── data/                     # CSV/JSON data kanon (POI PDF_140, koordinat)
│   ├── scripts/                  # Skrip maintenance DB (lihat tabel di bawah)
│   └── tests/                    # Unit test backend
│
├── mdb-1909-202602150020/        # Feed GTFS TransJakarta (stops, routes, shapes, …)
├── etc/                          # Template systemd, cron backup, fail2ban (VPS)
└── .env.local.example            # Contoh env frontend
    backend/.env.example          # Contoh env backend
```

### Alur data utama

1. **POI** diimpor ke PostgreSQL (`poi_enriched`, `admin_destinations`).
2. **Embedding** dihasilkan via Ollama dan disimpan untuk semantic search.
3. **GTFS** TransJakarta di-load ke tabel `gtfs_*` saat startup / admin sync.
4. Frontend memanggil API lewat proxy same-origin (`NEXT_PUBLIC_API_RELATIVE_PROXY=true`) atau langsung ke backend.

### Skrip backend yang dipertahankan

| Skrip | Fungsi |
|-------|--------|
| `import_poi_lengkap_pdf140.py` | Import awal 140 destinasi dari CSV |
| `sync_pdf140_active_destinations.py` | Sinkron koordinat & status aktif PDF_001–140 (server) |
| `verify_pdf140_coords_db.py` | Verifikasi koordinat di database |
| `verify_eda_active_destinations.py` | Verifikasi destinasi aktif untuk EDA |
| `backfill_wikipedia_descriptions.py` | Isi deskripsi dari Wikipedia |
| `backfill_nearest_stop_name.py` | Isi nama halte terdekat per POI |
| `bootstrap_admin.py` | Buat akun admin pertama |
| `sync_destination_whitelist.py` | Sinkron whitelist destinasi |

Modul pendukung: `refine_pdf140_google_coords.py`, `fix_kepulauan_seribu_pdf.py` (dipakai oleh sync).

---

## Persyaratan

- Node.js 20+ dan npm
- Python 3.11+
- PostgreSQL 14+
- [Ollama](https://ollama.com) dengan model `nomic-embed-text`
- Git

---

## Instalasi lokal

### 1. Clone dan install frontend

```bash
git clone https://github.com/Zeronicos/wisatajakartaai.git
cd wisatajakartaai
npm install
```

### 2. Environment frontend

```bash
cp .env.local.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

Untuk dev lokal, default proxy relatif sudah cukup (`NEXT_PUBLIC_API_RELATIVE_PROXY=true`).

### 3. Backend — virtual env & dependency

```bash
cd backend
python -m venv venv
```

Aktivasi venv:

```powershell
# Windows
.\venv\Scripts\Activate.ps1

# Linux / macOS
source venv/bin/activate
```

```bash
pip install -r requirements.txt
cp .env.example .env   # Windows: Copy-Item .env.example .env
```

Sesuaikan kredensial PostgreSQL di `backend/.env`:

```
DB_HOST=localhost
DB_NAME=wisata_jakarta
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
```

### 4. Inisialisasi database

Masih di folder `backend` dengan venv aktif:

```bash
python data_preprocessing/init_db.py
```

Output sukses: `Schema initialized successfully.`

### 5. Import data POI

Dari root project:

```powershell
# Windows
.\backend\venv\Scripts\python.exe .\backend\scripts\import_poi_lengkap_pdf140.py
```

```bash
# Linux / macOS
backend/venv/bin/python backend/scripts/import_poi_lengkap_pdf140.py
```

### 6. Ollama & embedding

Pastikan Ollama berjalan, lalu unduh model:

```bash
ollama pull nomic-embed-text
```

Generate embedding untuk POI yang sudah punya deskripsi:

```bash
cd backend
python data_preprocessing/generate_embeddings.py --described
```

### 7. Menjalankan aplikasi

**Opsi cepat** (frontend + backend):

```bash
npm run dev:all
```

**Opsi terpisah** — Terminal 1 (backend):

```bash
npm run dev:backend
```

Terminal 2 (frontend):

```bash
npm run dev
```

> Jangan jalankan `npm run build` dan `npm run dev` bersamaan — cache `.next` bisa rusak. Jika muncul error chunk 404, hapus folder `.next` lalu restart dev.

### 8. Akses lokal

| Layanan | URL |
|---------|-----|
| Frontend | http://127.0.0.1:3000 |
| Backend health | http://127.0.0.1:8000/health |
| Swagger API | http://127.0.0.1:8000/docs |

### Akun admin (opsional)

```bash
cd backend
python scripts/bootstrap_admin.py
```

Login admin melalui path rahasia di `.env.local` (`WJAI_ADMIN_SECRET_PATH`).

---

## Deploy produksi (VPS)

Aplikasi produksi: frontend di-build oleh Nginx di VPS, backend sebagai systemd service `wjai-backend`.

### Deploy cepat

Setelah **commit & push** ke `origin/main`:

```bash
ssh root@IP_VPS
cd /var/www/app
bash scripts/ops/deploy_vps.sh
```

Atau alur lengkap update destinasi:

```bash
bash scripts/ops/update_destinations_server.sh deploy   # sync + restart + build
bash scripts/ops/update_destinations_server.sh wiki --limit 100
bash scripts/ops/update_destinations_server.sh embed
bash scripts/ops/update_destinations_server.sh coords   # koordinat PDF_140
bash scripts/ops/update_destinations_server.sh verify
```

Detail hardening server: [`scripts/ops/HARDENING_VPS.md`](scripts/ops/HARDENING_VPS.md).

### Environment produksi

| Variabel | Lokasi | Keterangan |
|----------|--------|------------|
| `NEXT_PUBLIC_API_RELATIVE_PROXY` | Vercel / build VPS | Proxy API same-origin |
| `BACKEND_INTERNAL_URL` | Frontend | URL internal backend |
| `CORS_ALLOW_ORIGINS` | `backend/.env` | Domain frontend yang diizinkan |
| `GOOGLE_OAUTH_CLIENT_ID` | `backend/.env` | Login Google admin |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `.env.local` / build | Login Google pengguna |

Frontend Vercel mem-proxy request ke `https://api.wisatajakartaai.com` agar menghindari CORS.

---

## Backup PostgreSQL (server)

Skrip backup: [`scripts/ops/backup_postgres.sh`](scripts/ops/backup_postgres.sh)

### Backup manual (sekali jalan)

Jalankan di VPS sebagai user yang punya akses `pg_dump`:

```bash
cd /var/www/app
PGHOST=127.0.0.1 \
PGPORT=5432 \
PGUSER=wisata_user \
PGPASSWORD='password_anda' \
PGDATABASE=wisata_jakarta \
BACKUP_DIR=/var/backups/postgres \
RETENTION_DAYS=7 \
bash scripts/ops/backup_postgres.sh
```

Hasil: file terkompresi `/var/backups/postgres/wisata_jakarta-YYYY-MM-DD-HHMMSS.sql.gz`

Backup lebih lama dari `RETENTION_DAYS` (default 7 hari) dihapus otomatis.

### Backup otomatis (cron)

Template cron ada di [`etc/cron.d/wjai-pg-backup`](etc/cron.d/wjai-pg-backup):

```bash
sudo cp etc/cron.d/wjai-pg-backup /etc/cron.d/wjai-pg-backup
sudo nano /etc/cron.d/wjai-pg-backup   # ganti PGPASSWORD
sudo systemctl restart cron
```

Jadwal default: setiap hari pukul **03:00** waktu server. Log: `/var/log/wjai-pg-backup.log`.

### Restore dari backup

```bash
gunzip -c /var/backups/postgres/wisata_jakarta-2026-05-26-030001.sql.gz | \
  psql -h 127.0.0.1 -U wisata_user -d wisata_jakarta
```

> Untuk restore penuh ke database kosong, buat database terlebih dahulu (`createdb wisata_jakarta`) lalu jalankan perintah di atas.

### Unduh backup ke komputer lokal

```bash
scp root@IP_VPS:/var/backups/postgres/wisata_jakarta-*.sql.gz ./backups/
```

---

## Perintah npm

| Perintah | Deskripsi |
|----------|-----------|
| `npm run dev` | Frontend saja (port 3000) |
| `npm run dev:backend` | Backend FastAPI (port 8000) |
| `npm run dev:all` | Keduanya sekaligus |
| `npm run build` | Build produksi Next.js |
| `npm run start` | Jalankan build produksi |
| `npm run lint` | ESLint |

---

## Lisensi & kontribusi

Proyek skripsi / penelitian Wisata Jakarta AI. Untuk pertanyaan teknis, buka issue di repositori GitHub.
