"""Verifikasi poi_enriched selaras dengan pdf140_google_coords.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from database import get_connection

COORDS_PATH = BACKEND_ROOT / "data" / "pdf140_google_coords.json"


def main() -> int:
    coords = json.loads(COORDS_PATH.read_text(encoding="utf-8"))
    conn = get_connection()
    cur = conn.cursor()
    mismatches: list[tuple] = []
    missing: list[str] = []

    for key, geo in sorted(coords.items()):
        cur.execute(
            "SELECT latitude, longitude, district, name FROM poi_enriched WHERE source_id = %s",
            (key,),
        )
        row = cur.fetchone()
        if not row:
            missing.append(key)
            continue
        lat = float(row["latitude"])
        lon = float(row["longitude"])
        glat = float(geo["lat"])
        glon = float(geo["lon"])
        if abs(lat - glat) > 1e-5 or abs(lon - glon) > 1e-5:
            mismatches.append((key, geo.get("name"), lat, lon, glat, glon))

    cur.close()
    conn.close()

    print(f"Entri JSON: {len(coords)}")
    print(f"Hilang di DB: {len(missing)}")
    print(f"Tidak selaras: {len(mismatches)}")
    for item in mismatches[:30]:
        print(f"  {item[0]} | {item[1]} | DB {item[2]},{item[3]} | JSON {item[4]},{item[5]}")
    for key in missing[:10]:
        print(f"  MISSING {key}")

    return 1 if missing or mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())
