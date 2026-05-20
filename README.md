# Wisata Jakarta AI (Local Setup)

Sistem rekomendasi wisata Jakarta berbasis **Vector Similarity Search** dan **Intelligent K-Means**.

## Techstack

- Frontend: Next.js 14, React, Tailwind
- Backend: FastAPI, Uvicorn
- Database: PostgreSQL
- Data/ML: scikit-learn, numpy, ChromaDB, Ollama

## Requirement

- Node.js 20+ dan npm
- Python 3.11+
- PostgreSQL 14+
- Git

## 1) Clone dan install frontend

```bash
git clone https://github.com/Zeronicos/wisatajakartaai.git
cd wisatajakartaai
npm install
```

## 2) Setup environment frontend

Buat file `.env.local` dari contoh:

```bash
cp .env.local.example .env.local
```

Untuk Windows PowerShell jika `cp` tidak tersedia:

```powershell
Copy-Item .env.local.example .env.local
```

## 3) Setup backend environment + dependencies

Masuk folder backend, buat virtual env, lalu install dependency:

```bash
cd backend
python -m venv venv
```

Aktivasi venv:

```powershell
.\venv\Scripts\Activate.ps1
```

Install package:

```bash
pip install -r requirements.txt
```

Buat file `backend/.env` dari contoh:

```bash
cp .env.example .env
```

Untuk Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Sesuaikan `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` di `backend/.env` dengan PostgreSQL lokal.

Opsional (guardrail kualitas query search) di `backend/.env`:

- `SEARCH_MIN_QUERY_CHARS` (default `5`)
- `SEARCH_MIN_QUERY_ALPHA_RATIO` (default `0.55`)
- `SEARCH_MIN_SEMANTIC_SCORE` (default `0.2`)
- `SEARCH_MIN_CONFIDENT_RESULTS` (default `3`)

## 4) Inisialisasi schema database

Masih di folder `backend` dan venv aktif:

```bash
python data_preprocessing/init_db.py
```

Jika sukses, akan muncul:

`Schema initialized successfully.`

## 5) Import data POI

Kembali ke root project:

```bash
cd ..
```

Jalankan script import:

```powershell
.\backend\venv\Scripts\python.exe .\backend\scripts\import_poi_lengkap_pdf140.py
```

## 6) Menjalankan aplikasi (lokal)

Dari root project:

### Opsi cepat (frontend + backend sekaligus)

```bash
npm run dev:all
```

### Opsi terpisah

Terminal 1 (backend):

```bash
npm run dev:backend
```

Terminal 2 (frontend):

```bash
npm run dev
```

## 7) Akses aplikasi

- Frontend: `http://127.0.0.1:3000`
- Backend health: `http://127.0.0.1:8000/health`
- Backend docs: `http://127.0.0.1:8000/docs`
