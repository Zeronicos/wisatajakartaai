"""Perbaiki koordinat & wilayah Allianz Ecopark & Faunaland (salah geocode ke Kuningan)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection

TARGET_NAME = "Allianz Ecopark & Faunaland"
NEW_LAT = -6.125928
NEW_LON = 106.836324
NEW_DISTRICT = "Jakarta Utara"


def main() -> int:
    conn = get_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT id, name, latitude, longitude, district
            FROM poi_enriched
            WHERE name = %s
            """,
            (TARGET_NAME,),
        )
        rows = cur.fetchall()
        if not rows:
            print(f"Tidak ada baris dengan nama: {TARGET_NAME}")
            return 0

        for row in rows:
            print(
                f"id={row['id']} | {row['name']} | "
                f"({row['latitude']}, {row['longitude']}) | {row['district']}"
            )

        cur.execute(
            """
            UPDATE poi_enriched
            SET latitude = %s,
                longitude = %s,
                district = %s
            WHERE name = %s
            """,
            (NEW_LAT, NEW_LON, NEW_DISTRICT, TARGET_NAME),
        )
        conn.commit()
        print(f"Diperbarui {cur.rowcount} baris -> Ancol ({NEW_LAT}, {NEW_LON}), {NEW_DISTRICT}")
        return 0
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
