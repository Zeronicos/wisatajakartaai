"""Terapkan koordinat manual Google Maps (hasil riset) ke pdf140_google_coords.json."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
COORDS_PATH = BACKEND / "data" / "pdf140_google_coords.json"
RESEARCH_PATH = BACKEND / "data" / "pdf140_manual_google_research.json"

# Override subagent yang jelas salah / nama PDF ambigu
KEEP_CURRENT: set[str] = {
    "PDF_036",  # Taman Cattleya Cibubur (bukan Taman Cattleya Barat)
    "PDF_037",  # Taman Benyamin Sueb Kemayoran
    "PDF_041",  # Makam Pangeran Jayakarta Menteng
    "PDF_044",  # Sin Tek Bio Glodok
    "PDF_045",  # Pecenongan
    "PDF_058",  # Taman Proklamasi (bukan Pegangsaan timur)
    "PDF_090",  # GPIB Sion Sawah Besar
}

EXTRA_FIXES: dict[str, dict] = {
    "PDF_108": {"lat": -6.175020, "lon": 106.790000, "district": "Jakarta Barat", "subdistrict": "Grogol Petamburan", "postcode": "11470"},
    "PDF_116": {"lat": -6.240500, "lon": 106.806500, "district": "Jakarta Selatan", "subdistrict": "Kebayoran Baru", "postcode": "12180"},
}


def main() -> int:
    coords = json.loads(COORDS_PATH.read_text(encoding="utf-8"))
    research = json.loads(RESEARCH_PATH.read_text(encoding="utf-8"))
    updated = 0
    for key, patch in research.items():
        if key not in coords:
            print(f"Lewati {key}: tidak ada")
            continue
        if key in KEEP_CURRENT:
            print(f"[KEEP] {key} | {coords[key]['name']}")
            continue
        lat = round(float(patch["lat"]), 6)
        lon = round(float(patch["lon"]), 6)
        old = (coords[key]["lat"], coords[key]["lon"])
        coords[key]["lat"] = lat
        coords[key]["lon"] = lon
        coords[key]["source"] = "google_maps_manual"
        if patch.get("source_note"):
            coords[key]["source_note"] = patch["source_note"]
        if old != (lat, lon):
            updated += 1
            print(f"[UPD] {key} | {coords[key]['name']} | {old} -> ({lat}, {lon})")
    for key, patch in EXTRA_FIXES.items():
        coords[key].update(patch)
        coords[key]["source"] = "google_maps_manual"
        print(f"[FIX] {key} | {coords[key]['name']} -> {patch['lat']}, {patch['lon']}")
        updated += 1
    COORDS_PATH.write_text(json.dumps(coords, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nTotal diperbarui: {updated}")
    subprocess.run([sys.executable, str(BACKEND / "scripts" / "apply_pdf140_google_coords.py")], check=False)
    subprocess.run([sys.executable, str(BACKEND / "scripts" / "check_pdf140_dup_coords.py")], check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
