"""Verifikasi EDA selaras dengan admin_destinations aktif."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection
from poi_visibility_sql import SQL_FOR_EDA
from routers.eda import JAKARTA_BOUNDS


def main() -> int:
    b = JAKARTA_BOUNDS
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS c FROM admin_destinations WHERE is_active = TRUE")
    admin_active = int(cur.fetchone()["c"])

    cur.execute(
        f"""
        SELECT COUNT(*) AS c
        FROM poi_enriched p
        WHERE latitude BETWEEN %s AND %s
          AND longitude BETWEEN %s AND %s
        {SQL_FOR_EDA}
        """,
        (b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"]),
    )
    eda_visible = int(cur.fetchone()["c"])

    cur.execute(
        f"""
        SELECT COUNT(*) AS c
        FROM (
            SELECT LOWER(TRIM(p.name)) AS key_name
            FROM poi_enriched p
            WHERE latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            {SQL_FOR_EDA}
            GROUP BY LOWER(TRIM(p.name))
            HAVING COUNT(*) > 1
        ) dup
        """,
        (b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"]),
    )
    dup_names = int(cur.fetchone()["c"])

    cur.execute(
        """
        SELECT p.source_id, p.name, p.district, p.category
        FROM poi_enriched p
        WHERE p.source_id ~ '^PDF_[0-9]{3}$'
          AND (REPLACE(p.source_id, 'PDF_', ''))::int BETWEEN 1 AND 140
          AND NOT EXISTS (
            SELECT 1
            FROM admin_destinations d
            JOIN admin_cities c ON c.id = d.city_id
            JOIN admin_categories k ON k.id = d.category_id
            WHERE d.is_active = TRUE
              AND LOWER(TRIM(p.name)) = LOWER(TRIM(d.name))
              AND LOWER(TRIM(p.district)) = LOWER(TRIM(c.name))
              AND LOWER(TRIM(p.category)) = LOWER(TRIM(k.name))
          )
        ORDER BY p.source_id
        """
    )
    missing = cur.fetchall()

    cur.close()
    conn.close()

    print(f"admin_destinations aktif: {admin_active}")
    print(f"POI visible EDA (bounds): {eda_visible}")
    print(f"Nama duplikat EDA: {dup_names}")
    if missing:
        print(f"PDF aktif tanpa match admin/EDA: {len(missing)}")
        for row in missing[:10]:
            print(f"  {row['source_id']} | {row['name']} | {row['district']} | {row['category']}")

    ok = dup_names == 0 and eda_visible >= admin_active - 5
    print("OK" if ok else "PERLU PERBAIKAN")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
