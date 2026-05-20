import logging
import os
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s: %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import admin_master, auth_history, cluster, eda, evaluate, features, hotels, route, search

logger = logging.getLogger(__name__)


def _parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pastikan tabel pendukung tersedia agar fitur search/print tidak gagal."""
    print("\n[INFO] lifespan: uvicorn sedang menjalankan startup aplikasi...", flush=True)
    try:
        from database import get_connection

        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            ALTER TABLE poi_enriched
            ADD COLUMN IF NOT EXISTS nearest_stop_name VARCHAR
            """
        )
        admin_master._ensure_master_tables(cur)
        auth_history.ensure_auth_and_history_tables(cur)
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Bootstrap DB: admin_cities / admin_categories / admin_destinations OK.")
    except Exception as exc:
        logger.warning("Bootstrap DB dilewati (pastikan Postgres jalan dan .env benar): %s", exc)
    logger.info("Backend aktif — GET /health atau buka http://127.0.0.1:8000/docs")
    banner = "=" * 62
    print(
        (
            f"\n{banner}\n"
            "[OK] BACKEND SIAP — silakan tes di browser atau curl:\n"
            "    http://127.0.0.1:8000/health\n"
            "    http://127.0.0.1:8000/docs\n"
            f"{banner}\n"
        ),
        flush=True,
    )
    yield


app = FastAPI(
    title="Sistem Rekomendasi Wisata DKI Jakarta",
    description=(
        "API sistem rekomendasi perjalanan wisata DKI Jakarta "
        "menggunakan Vector Similarity Search dan Intelligent K-Means."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://wisatajakartaai.com",
    "https://www.wisatajakartaai.com",
]
cors_origins.extend(_parse_cors_origins(os.getenv("CORS_ALLOW_ORIGINS")))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    # localhost + preview deployment Vercel
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://([a-zA-Z0-9-]+\.)*vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api", tags=["Vector Search"])
app.include_router(features.router, prefix="/api", tags=["Feature Extraction"])
app.include_router(cluster.router, prefix="/api", tags=["Clustering"])
app.include_router(route.router, prefix="/api", tags=["Routing"])
app.include_router(evaluate.router, prefix="/api", tags=["Evaluation"])
app.include_router(eda.router, prefix="/api", tags=["EDA"])
app.include_router(hotels.router, prefix="/api", tags=["Hotels"])
app.include_router(admin_master.router, prefix="/api", tags=["Admin Master Data"])
app.include_router(auth_history.router, prefix="/api", tags=["Auth & Cluster History"])


@app.get("/health")
async def health():
    return {"status": "success", "message": "Backend is healthy"}


# Muncul segera setelah impor modul selesai (sering "lama diam" sebelum baris uvicorn).
# Jika baris ini tidak muncul, proses masih terjebak di salah satu `import` router/fitu.
print(
    "\n[INFO] main.py: impor selesai, router terdaftar. Menunggu uvicorn memicu startup...\n",
    flush=True,
)
