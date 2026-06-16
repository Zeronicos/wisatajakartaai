"""Verifikasi EDA: 140 PDF aktif, tanpa duplikat nama."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection
from poi_visibility_sql import SQL_AND_ACTIVE_PDF140
from routers.eda import JAKARTA_BOUNDS


def main() -> int:
    b = JAKARTA_BOUNDS
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        f"""
        SELECT COUNT(*) AS c
        FROM poi_enriched p
        WHERE latitude BETWEEN %s AND %s
          AND longitude BETWEEN %s AND %s
        {SQL_AND_ACTIVE_PDF140}
        """,
        (b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"]),
    )
    total = int(cur.fetchone()["c"])

    cur.execute(
        f"""
        SELECT COUNT(*) AS c
        FROM (
            SELECT LOWER(TRIM(p.name)) AS key_name
            FROM poi_enriched p
            WHERE latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            {SQL_AND_ACTIVE_PDF140}
            GROUP BY LOWER(TRIM(p.name))
            HAVING COUNT(*) > 1
        ) dup
        """,
        (b["min_lat"], b["max_lat"], b["min_lon"], b["max_lon"]),
    )
    dup_names = int(cur.fetchone()["c"])

    cur.close()
    conn.close()

    print(f"Destinasi aktif EDA (PDF_140): {total}")
    print(f"Nama duplikat: {dup_names}")
    ok = total == 140 and dup_names == 0
    print("OK" if ok else "PERLU PERBAIKAN")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
