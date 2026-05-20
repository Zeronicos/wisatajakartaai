"""
Impor poi_lengkap_final.csv ke PostgreSQL.

- Baris pertama (berhasil di-parse nama+lat+lon+district+kategori): source_id PDF_001 .. PDF_140
- Sisanya: source_id dari kolom id_poi csv (string)
- source: pdf_active untuk PDF_* 1–140; pdf_bulk untuk sisanya (tidak memicu flag osm+pdf di sync admin)

Setelah itu: sinkron kota/kategori admin, hapus destinasi admin lama, isi ulang dari poi_enriched:
  aktif jika poi.source_id cocok PDF_001–PDF_140, selain itu inactive.

Penggunaan:
  cd backend
  .\\venv\\Scripts\\python.exe scripts\\import_poi_lengkap_pdf140.py
  .\\venv\\Scripts\\python.exe scripts\\import_poi_lengkap_pdf140.py --csv ..\\poi_lengkap_final.csv --no-truncate-poi

Default: TRUNCATE poi_enriched dan DELETE semua admin_destinations lalu rebuild.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import (  # noqa: E402
    detect_delimiter,
    first_nonempty,
    normalize_coordinate,
)
from database import get_connection  # noqa: E402

from routers.admin_master import (  # noqa: E402
    _enforce_source_status_rules,
    _ensure_master_tables,
    _sync_destination_source_flags,
)

PDF_BATCH = 140


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=BACKEND_ROOT.parent / "poi_lengkap_final.csv")
    ap.add_argument(
        "--no-truncate-poi",
        action="store_true",
        help="Jangan kosongkan poi_enriched (bahaya duplikasi).",
    )
    ap.add_argument(
        "--keep-admin-destinations",
        action="store_true",
        help="Jangan hapus admin_destinations; hanya update is_active by join.",
    )
    args = ap.parse_args()

    if not args.csv.exists():
        print(f"Berkas tidak ada: {args.csv}", file=sys.stderr)
        return 1

    conn = get_connection()
    cur = conn.cursor()

    try:
        if not args.no_truncate_poi:
            cur.execute("TRUNCATE TABLE poi_enriched RESTART IDENTITY CASCADE")
        else:
            cur.execute("DELETE FROM poi_enriched")

        delim = detect_delimiter(args.csv)
        inserted = 0
        skipped = 0
        pdf_seq = 1  # next PDF_ number to assign (1..140)

        with args.csv.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f, delimiter=delim)
            for row in reader:
                name = first_nonempty(row, ["name", "nama", "nama_id", "nama_en"])
                category = first_nonempty(row, ["category", "kategori"])
                subcategory = first_nonempty(row, ["subcategory", "sub_kategori"])
                nearest_stop_name = first_nonempty(
                    row,
                    ["nearest_stop_name", "halte_terdekat", "nearest_stop", "stop_name_terdekat"],
                )
                description = first_nonempty(row, ["description", "deskripsi", "teks_gabungan"])
                phone = first_nonempty(row, ["phone", "telepon"])
                website = first_nonempty(row, ["website"])
                district = first_nonempty(row, ["district", "kota", "kabupaten"])
                raw_csv_id = first_nonempty(row, ["id_poi", "osm_id", "id"])

                lat = normalize_coordinate(first_nonempty(row, ["latitude", "lat"]), is_lat=True)
                lon = normalize_coordinate(first_nonempty(row, ["longitude", "lon", "lng"]), is_lat=False)

                if not name or lat is None or lon is None or not district or not category:
                    skipped += 1
                    continue

                if pdf_seq <= PDF_BATCH:
                    source_id = f"PDF_{pdf_seq:03d}"
                    source_val = "pdf_active"
                    pdf_seq += 1
                else:
                    source_id = raw_csv_id or f"csv_{inserted}"
                    source_val = "pdf_bulk"

                cur.execute(
                    """
                    INSERT INTO poi_enriched
                    (source_id, name, category, subcategory, latitude, longitude, nearest_stop_name,
                     description, phone, website, district, source)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        source_id,
                        name,
                        category,
                        subcategory,
                        lat,
                        lon,
                        nearest_stop_name,
                        description,
                        phone,
                        website,
                        district,
                        source_val,
                    ),
                )
                inserted += 1

        _ensure_master_tables(cur)

        # Pastikan kota & kategori dari POI ada
        cur.execute(
            """
            INSERT INTO admin_cities(name)
            SELECT DISTINCT TRIM(district)
            FROM poi_enriched
            WHERE district IS NOT NULL AND TRIM(district) <> ''
            ON CONFLICT (name) DO NOTHING
            """
        )
        cur.execute(
            """
            INSERT INTO admin_categories(name)
            SELECT DISTINCT TRIM(category)
            FROM poi_enriched
            WHERE category IS NOT NULL AND TRIM(category) <> ''
            ON CONFLICT (name) DO NOTHING
            """
        )

        if not args.keep_admin_destinations:
            cur.execute("DELETE FROM admin_destinations")

        cur.execute(
            """
            INSERT INTO admin_destinations (name, city_id, category_id, is_active, is_osm_pdf, is_osm_only, source_flags_synced)
            SELECT DISTINCT
                TRIM(p.name),
                c.id,
                k.id,
                FALSE,
                FALSE,
                FALSE,
                FALSE
            FROM poi_enriched p
            JOIN admin_cities c ON c.name = TRIM(p.district)
            JOIN admin_categories k ON k.name = TRIM(p.category)
            WHERE TRIM(p.name) <> ''
            ON CONFLICT (name, city_id, category_id)
            DO UPDATE SET
                is_osm_pdf = FALSE,
                is_osm_only = FALSE,
                source_flags_synced = FALSE,
                is_active = FALSE
            """
        )

        cur.execute(
            """
            UPDATE admin_destinations d
            SET is_active = TRUE
            WHERE EXISTS (
                SELECT 1
                FROM poi_enriched p
                JOIN admin_cities c ON c.name = TRIM(p.district)
                JOIN admin_categories k ON k.name = TRIM(p.category)
                WHERE d.name = TRIM(p.name)
                  AND d.city_id = c.id
                  AND d.category_id = k.id
                  AND p.source_id ~ '^PDF_[0-9]{3}$'
                  AND REPLACE(p.source_id, 'PDF_', '')::int BETWEEN 1 AND %s
            )
            """,
            (PDF_BATCH,),
        )
        cur.execute("SELECT COUNT(*) AS c FROM poi_enriched")
        poi_total = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM admin_destinations WHERE is_active = TRUE")
        active_admin = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM admin_destinations WHERE is_active = FALSE")
        inactive_admin = int(cur.fetchone()["c"])

        _sync_destination_source_flags(cur)
        _enforce_source_status_rules(cur)

        conn.commit()

        pdf_rows = min(pdf_seq - 1, PDF_BATCH)
        print("=== Impor poi_lengkap_final (PDF_001–PDF_140) ===")
        print(f"CSV: {args.csv}")
        print(f"Baris POI berhasil insert: {inserted}")
        print(f"Baris dilewati (nama/koordinat/kota/kategori kurang): {skipped}")
        print(f"Total baris poi_enriched: {poi_total}")
        print(f"Source_id PDF_* terisi: PDF_001 … PDF_{pdf_rows:03d} (target {PDF_BATCH})")
        print(f"admin_destinations aktif: {active_admin}")
        print(f"admin_destinations inactive: {inactive_admin}")
        print("\nLangkah lanjutan: jalankan ulang embedding bila dipakai search/cluster, contoh:")
        print("  python data_preprocessing/generate_embeddings.py")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
