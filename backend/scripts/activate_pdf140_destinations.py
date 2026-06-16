"""
Aktifkan hanya destinasi PDF_001–PDF_140; nonaktifkan sisanya.

Tidak menghapus data POI — hanya mengatur admin_destinations.is_active
sesuai source_id panduan wisata di poi_enriched.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection
from routers.admin_master import (
    _enforce_source_status_rules,
    _ensure_master_tables,
    _sync_destination_source_flags,
)

PDF_BATCH = 140


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = get_connection()
    cur = conn.cursor()
    try:
        _ensure_master_tables(cur)

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
            JOIN admin_cities c ON LOWER(TRIM(c.name)) = LOWER(TRIM(p.district))
            JOIN admin_categories k ON LOWER(TRIM(k.name)) = LOWER(TRIM(p.category))
            WHERE TRIM(p.name) <> ''
              AND p.source_id ~ '^PDF_[0-9]{3}$'
              AND REPLACE(p.source_id, 'PDF_', '')::int BETWEEN 1 AND %s
            ON CONFLICT (name, city_id, category_id)
            DO UPDATE SET source_flags_synced = FALSE
            """,
            (PDF_BATCH,),
        )

        if not args.dry_run:
            cur.execute("UPDATE admin_destinations SET is_active = FALSE")

            cur.execute(
                """
                UPDATE admin_destinations d
                SET is_active = TRUE
                WHERE EXISTS (
                    SELECT 1
                    FROM poi_enriched p
                    JOIN admin_cities c ON LOWER(TRIM(c.name)) = LOWER(TRIM(p.district))
                    JOIN admin_categories k ON LOWER(TRIM(k.name)) = LOWER(TRIM(p.category))
                    WHERE LOWER(TRIM(d.name)) = LOWER(TRIM(p.name))
                      AND d.city_id = c.id
                      AND d.category_id = k.id
                      AND p.source_id ~ '^PDF_[0-9]{3}$'
                      AND REPLACE(p.source_id, 'PDF_', '')::int BETWEEN 1 AND %s
                )
                """,
                (PDF_BATCH,),
            )

            _sync_destination_source_flags(cur)
            _enforce_source_status_rules(cur)

        cur.execute("SELECT COUNT(*) AS c FROM admin_destinations WHERE is_active = TRUE")
        active = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM admin_destinations WHERE is_active = FALSE")
        inactive = int(cur.fetchone()["c"])
        cur.execute(
            """
            SELECT COUNT(*) AS c
            FROM poi_enriched
            WHERE source_id ~ '^PDF_[0-9]{3}$'
              AND REPLACE(source_id, 'PDF_', '')::int BETWEEN 1 AND %s
            """,
            (PDF_BATCH,),
        )
        pdf_poi = int(cur.fetchone()["c"])

        if args.dry_run:
            conn.rollback()
            print("[DRY-RUN] Tidak ada perubahan disimpan.")
        else:
            conn.commit()
            print("Perubahan disimpan.")

        print("=== Aktivasi PDF_001–PDF_140 ===")
        print(f"POI panduan (source_id PDF_001–140): {pdf_poi}")
        print(f"admin_destinations aktif: {active}")
        print(f"admin_destinations nonaktif: {inactive}")
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
