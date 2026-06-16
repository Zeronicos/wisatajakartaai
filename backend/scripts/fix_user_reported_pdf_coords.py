"""Perbaiki koordinat destinasi yang dilaporkan user + scan titik mencurigakan."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
COORDS_PATH = BACKEND / "data" / "pdf140_google_coords.json"

# Titik Google Maps / OSM / Wikipedia terverifikasi
FIXES: dict[str, dict] = {
    # --- dilaporkan user ---
    "PDF_004": {
        "lat": -6.120853,
        "lon": 106.847888,
        "district": "Jakarta Utara",
        "subdistrict": "Pademangan",
        "postcode": "14430",
        "source_note": "Google/OSM Beach Pool Ancol (Pantai Lagoon)",
    },
    "PDF_029": {
        "lat": -6.340898,
        "lon": 106.890662,
        "district": "Jakarta Timur",
        "subdistrict": "Cipayung",
        "postcode": "13870",
        "source_note": "Google Maps Buperta Jl. Jambore (Scout Camping Ground)",
    },
    "PDF_030": {
        "lat": -6.332280,
        "lon": 106.876190,
        "district": "Jakarta Timur",
        "subdistrict": "Cijantung",
        "postcode": "13770",
        "source_note": "Google Maps Hutan Kota Cijantung Jl. RA Fadillah",
    },
    "PDF_034": {
        "lat": -6.340667,
        "lon": 106.905900,
        "district": "Jakarta Timur",
        "subdistrict": "Cibubur",
        "postcode": "13720",
        "source_note": "Google Maps Cibubur Bee Park Kompleks Buperta",
    },
    "PDF_093": {
        "lat": -6.137185,
        "lon": 106.812948,
        "district": "Jakarta Barat",
        "subdistrict": "Taman Sari",
        "postcode": "11110",
        "source_note": "Google/OSM Museum Bank Indonesia Jl. Pintu Besar Utara",
    },
    "PDF_106": {
        "lat": -6.182156,
        "lon": 106.794291,
        "district": "Jakarta Barat",
        "subdistrict": "Palmerah",
        "postcode": "11470",
        "source_note": "Google/OSM Taman Cattleya Kemanggisan (Cattleya City Park)",
    },
    "PDF_119": {
        "lat": -6.236093,
        "lon": 106.815092,
        "district": "Jakarta Selatan",
        "subdistrict": "Kebayoran Baru",
        "postcode": "12160",
        "source_note": "Google Maps Kawasan Kuliner Blok S",
    },
    "PDF_126": {
        "lat": -6.223656,
        "lon": 106.823375,
        "district": "Jakarta Selatan",
        "subdistrict": "Setiabudi",
        "postcode": "12940",
        "source_note": "Wikipedia/Google Ciputra Artpreneur Ciputra World Kuningan",
    },
    "PDF_138": {
        "lat": -6.299390,
        "lon": 106.804644,
        "district": "Jakarta Selatan",
        "subdistrict": "Cilandak",
        "postcode": "12430",
        "source_note": "Google/OSM Masjid Babah Alun Desari Cilandak Barat",
    },
    # --- titik lain yang kemungkinan salah dari batch sebelumnya ---
    "PDF_032": {
        "lat": -6.339200,
        "lon": 106.903800,
        "district": "Jakarta Timur",
        "subdistrict": "Cipayung",
        "postcode": "13720",
        "source_note": "Google Maps Kampoeng Maen area Buperta Cibubur",
    },
    "PDF_035": {
        "lat": -6.369378,
        "lon": 106.894242,
        "district": "Jakarta Timur",
        "subdistrict": "Cipayung",
        "postcode": "13720",
        "source_note": "Google Maps Teras Rimbun Jl. Jambore Cibubur",
    },
    "PDF_039": {
        "lat": -6.216094,
        "lon": 106.869782,
        "district": "Jakarta Timur",
        "subdistrict": "Jatinegara",
        "postcode": "13330",
        "source_note": "Google/OSM Jakarta Gems Center Pasar Gems Jatinegara",
    },
    "PDF_048": {
        "lat": -6.166540,
        "lon": 106.834417,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "postcode": "10710",
        "source_note": "Wikipedia Gedung Kesenian Jakarta",
    },
    "PDF_049": {
        "lat": -6.165734,
        "lon": 106.834212,
        "district": "Jakarta Pusat",
        "subdistrict": "Sawah Besar",
        "postcode": "10710",
        "source_note": "Google Maps Museum Antara Jl. Antara",
    },
    "PDF_064": {
        "lat": -6.181405,
        "lon": 106.828409,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "postcode": "10110",
        "source_note": "Wikipedia Balai Kota DKI",
    },
    "PDF_075": {
        "lat": -6.207202,
        "lon": 106.798797,
        "district": "Jakarta Pusat",
        "subdistrict": "Tanah Abang",
        "postcode": "10270",
        "source_note": "Google Maps Museum Kehutanan Manggala Wanabakti GBK",
    },
    "PDF_098": {
        "lat": -6.153056,
        "lon": 106.814444,
        "district": "Jakarta Barat",
        "subdistrict": "Taman Sari",
        "postcode": "11110",
        "source_note": "Wikipedia Arsip Nasional Jl. Gajah Mada",
    },
    "PDF_114": {
        "lat": -6.229319,
        "lon": 106.802815,
        "district": "Jakarta Selatan",
        "subdistrict": "Kebayoran Baru",
        "postcode": "12190",
        "source_note": "Google/OSM Jalan Senopati",
    },
    "PDF_116": {
        "lat": -6.229500,
        "lon": 106.803200,
        "district": "Jakarta Selatan",
        "subdistrict": "Kebayoran Baru",
        "postcode": "12190",
        "source_note": "Google Maps Korea Town Jl. Senopati",
    },
    "PDF_135": {
        "lat": -6.304479,
        "lon": 106.824172,
        "district": "Jakarta Selatan",
        "subdistrict": "Pasar Minggu",
        "postcode": "12550",
        "source_note": "Google/OSM Taman Anggrek Ragunan",
    },
}


def main() -> int:
    coords = json.loads(COORDS_PATH.read_text(encoding="utf-8"))
    changed = 0
    for key, patch in FIXES.items():
        if key not in coords:
            print(f"Lewati {key}")
            continue
        entry = coords[key]
        old = (entry["lat"], entry["lon"])
        entry.update(patch)
        entry["source"] = "google_maps_manual_v2"
        new = (entry["lat"], entry["lon"])
        if old != new or patch.get("subdistrict") != entry.get("subdistrict"):
            changed += 1
            print(f"[FIX] {key} | {entry['name']}")
            print(f"      {old} -> {new}")
    COORDS_PATH.write_text(json.dumps(coords, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDiperbarui: {changed} entri")
    subprocess.run([sys.executable, str(BACKEND / "scripts" / "apply_pdf140_google_coords.py")], check=False)
    subprocess.run([sys.executable, str(BACKEND / "scripts" / "check_pdf140_dup_coords.py")], check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
