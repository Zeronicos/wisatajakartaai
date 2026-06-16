"""Buat template CSV + link pencarian Google Maps untuk 140 destinasi PDF."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from urllib.parse import quote

BACKEND = Path(__file__).resolve().parents[1]
COORDS = BACKEND / "data" / "pdf140_google_coords.json"
OUT = BACKEND / "data" / "pdf140_manual_import_template.csv"


def main() -> int:
    data = json.loads(COORDS.read_text(encoding="utf-8"))
    rows = []
    for key in sorted(data.keys()):
        name = data[key]["name"]
        lat = data[key]["lat"]
        lon = data[key]["lon"]
        search = f"https://www.google.com/maps/search/?api=1&query={quote(name + ', DKI Jakarta, Indonesia')}"
        rows.append(
            {
                "pdf_key": key,
                "name": name,
                "current_lat": lat,
                "current_lon": lon,
                "google_search_url": search,
                "google_maps_url_or_coords": "",
                "notes": "Paste link share Google Maps atau lat,lon setelah verifikasi",
            }
        )
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "pdf_key",
                "name",
                "current_lat",
                "current_lon",
                "google_search_url",
                "google_maps_url_or_coords",
                "notes",
            ],
            delimiter=";",
            lineterminator="\n",
        )
        w.writeheader()
        w.writerows(rows)
    print(f"Template: {OUT} ({len(rows)} baris)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
