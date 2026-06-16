"""
Nonaktifkan baris admin_destinations ganda (nama sama, beda kapitalisasi/id)
yang bukan sumber PDF_001–140.

Tidak menghapus data — hanya is_active=FALSE pada duplikat admin.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection
from routers.admin_master import _ensure_master_tables

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
            WITH ranked AS (
                SELECT
                    d.id,
                    d.is_active,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            LOWER(TRIM(d.name)),
                            d.city_id,
                            d.category_id
                        ORDER BY
                            CASE
                                WHEN EXISTS (
                                    SELECT 1
                                    FROM poi_enriched p
                                    WHERE p.source_id ~ '^PDF_[0-9]{3}$'
                                      AND (REPLACE(p.source_id, 'PDF_', ''))::int BETWEEN 1 AND %s
                                      AND LOWER(TRIM(p.name)) = LOWER(TRIM(d.name))
                                      AND LOWER(TRIM(p.district)) = LOWER(TRIM((
                                          SELECT c.name FROM admin_cities c WHERE c.id = d.city_id
                                      )))
                                      AND LOWER(TRIM(p.category)) = LOWER(TRIM((
                                          SELECT k.name FROM admin_categories k WHERE k.id = d.category_id
                                      )))
                                ) THEN 0
                                WHEN d.is_active THEN 1
                                ELSE 2
                            END,
                            d.id ASC
                    ) AS rn
                FROM admin_destinations d
            )
            SELECT id, is_active
            FROM ranked
            WHERE rn > 1 AND is_active = TRUE
            ORDER BY id
            """,
            (PDF_BATCH,),
        )
        to_deactivate = cur.fetchall()

        if not args.dry_run and to_deactivate:
            ids = [int(r["id"]) for r in to_deactivate]
            cur.execute(
                "UPDATE admin_destinations SET is_active = FALSE WHERE id = ANY(%s)",
                (ids,),
            )

        if args.dry_run:
            conn.rollback()
            print("[DRY-RUN] Tidak ada perubahan disimpan.")
        else:
            conn.commit()
            print("Perubahan disimpan.")

        print(f"Admin duplikat dinonaktifkan: {len(to_deactivate)}")
        for row in to_deactivate[:20]:
            print(f"  id={row['id']}")
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
