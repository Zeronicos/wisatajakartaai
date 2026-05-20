"""
Backfill nearest_stop_name pada poi_enriched berdasarkan tabel stops.

Pemakaian (dari root project):
  .\\backend\\venv\\Scripts\\python.exe .\\backend\\scripts\\backfill_nearest_stop_name.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection  # noqa: E402


def main() -> int:
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            ALTER TABLE poi_enriched
            ADD COLUMN IF NOT EXISTS nearest_stop_name VARCHAR
            """
        )

        cur.execute("SELECT COUNT(*) AS c FROM stops")
        stop_count = int(cur.fetchone()["c"])
        if stop_count == 0:
            print("Tabel stops kosong. Backfill dilewati.")
            conn.commit()
            return 0

        cur.execute(
            """
            UPDATE poi_enriched p
            SET nearest_stop_name = COALESCE(ns.stop_name, '-')
            FROM LATERAL (
                SELECT s.stop_name
                FROM stops s
                WHERE s.stop_lat IS NOT NULL
                  AND s.stop_lon IS NOT NULL
                ORDER BY
                    ((p.latitude - s.stop_lat) * (p.latitude - s.stop_lat)) +
                    ((p.longitude - s.stop_lon) * (p.longitude - s.stop_lon))
                LIMIT 1
            ) ns
            WHERE p.latitude IS NOT NULL
              AND p.longitude IS NOT NULL
              AND COALESCE(p.nearest_stop_name, '') <> COALESCE(ns.stop_name, '-')
            """
        )
        updated = cur.rowcount
        conn.commit()
        print(f"Backfill selesai. nearest_stop_name terupdate: {updated} baris.")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Backfill gagal: {exc}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
