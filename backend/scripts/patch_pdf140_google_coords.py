"""Patch koordinat salah di pdf140_google_coords.json (titik Google Maps)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = BACKEND_ROOT / "data" / "pdf140_google_coords.json"

# Titik Google Maps / verifikasi manual
PATCHES: dict[str, dict] = {
    "PDF_030": {"lat": -6.332300, "lon": 106.876200, "district": "Jakarta Timur", "subdistrict": "Cijantung", "postcode": "13770"},
    "PDF_032": {"lat": -6.196111, "lon": 106.838889, "district": "Jakarta Pusat", "subdistrict": "Menteng", "postcode": "10330"},
    "PDF_033": {"lat": -6.344752, "lon": 106.911741, "district": "Jakarta Timur", "subdistrict": "Cibubur", "postcode": "13720"},
    "PDF_034": {"lat": -6.340833, "lon": 106.905833, "district": "Jakarta Timur", "subdistrict": "Cibubur", "postcode": "13720"},
    "PDF_036": {"lat": -6.351700, "lon": 106.917800, "district": "Jakarta Timur", "subdistrict": "Cibubur", "postcode": "13720"},
    "PDF_039": {"lat": -6.200833, "lon": 106.905000, "district": "Jakarta Timur", "subdistrict": "Pulo Gadung", "postcode": "13220"},
    "PDF_044": {"lat": -6.137222, "lon": 106.814444, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11120"},
    "PDF_045": {"lat": -6.177500, "lon": 106.834722, "district": "Jakarta Pusat", "subdistrict": "Menteng", "postcode": "10140"},
    "PDF_057": {"lat": -6.190833, "lon": 106.838889, "district": "Jakarta Pusat", "subdistrict": "Menteng", "postcode": "10310"},
    "PDF_058": {"lat": -6.185972, "lon": 106.822583, "district": "Jakarta Pusat", "subdistrict": "Gambir", "postcode": "10110"},
    "PDF_059": {"lat": -6.200436, "lon": 106.831084, "district": "Jakarta Pusat", "subdistrict": "Gambir", "postcode": "10110"},
    "PDF_064": {"lat": -6.208333, "lon": 106.833889, "district": "Jakarta Pusat", "subdistrict": "Gambir", "postcode": "10110"},
    "PDF_075": {"lat": -6.196400, "lon": 106.834700, "district": "Jakarta Pusat", "subdistrict": "Menteng", "postcode": "10350"},
    "PDF_086": {"lat": -6.135101, "lon": 106.813430, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11110"},
    "PDF_087": {"lat": -6.134444, "lon": 106.812500, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11110"},
    "PDF_004": {"lat": -6.127039, "lon": 106.843987, "district": "Jakarta Utara", "subdistrict": "Pademangan", "postcode": "14430"},
    "PDF_007": {"lat": -6.124389, "lon": 106.839667, "district": "Jakarta Utara", "subdistrict": "Pademangan", "postcode": "14430"},
    "PDF_011": {"lat": -6.107106, "lon": 106.779358, "district": "Jakarta Utara", "subdistrict": "Penjaringan", "postcode": "14440"},
    "PDF_012": {"lat": -6.112306, "lon": 106.737847, "district": "Jakarta Utara", "subdistrict": "Penjaringan", "postcode": "14470"},
    "PDF_090": {"lat": -6.163611, "lon": 106.819722, "district": "Jakarta Pusat", "subdistrict": "Sawah Besar", "postcode": "10710"},
    "PDF_091": {"lat": -6.131246, "lon": 106.810559, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11110"},
    "PDF_096": {"lat": -6.137222, "lon": 106.814167, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11120"},
    "PDF_098": {"lat": -6.175833, "lon": 106.834722, "district": "Jakarta Pusat", "subdistrict": "Gambir", "postcode": "10110"},
    "PDF_101": {"lat": -6.142800, "lon": 106.829500, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11120"},
    "PDF_106": {"lat": -6.182156, "lon": 106.794291, "district": "Jakarta Barat", "subdistrict": "Grogol Petamburan", "postcode": "11470"},
    "PDF_114": {"lat": -6.229167, "lon": 106.809722, "district": "Jakarta Selatan", "subdistrict": "Kebayoran Baru", "postcode": "12190"},
    "PDF_116": {"lat": -6.239743, "lon": 106.851701, "district": "Jakarta Selatan", "subdistrict": "Kebayoran Baru", "postcode": "12180"},
    "PDF_119": {"lat": -6.244266, "lon": 106.801451, "district": "Jakarta Selatan", "subdistrict": "Kebayoran Baru", "postcode": "12180"},
    "PDF_120": {"lat": -6.283869, "lon": 106.804830, "district": "Jakarta Selatan", "subdistrict": "Pasar Minggu", "postcode": "12560"},
    "PDF_121": {"lat": -6.244722, "lon": 106.799722, "district": "Jakarta Selatan", "subdistrict": "Kebayoran Baru", "postcode": "12160"},
    "PDF_126": {"lat": -6.224753, "lon": 106.832156, "district": "Jakarta Selatan", "subdistrict": "Kebayoran Baru", "postcode": "12940"},
    "PDF_132": {"lat": -6.218333, "lon": 106.826667, "district": "Jakarta Pusat", "subdistrict": "Menteng", "postcode": "10310"},
    "PDF_139": {"lat": -6.308333, "lon": 106.816667, "district": "Jakarta Selatan", "subdistrict": "Pasar Minggu", "postcode": "12550"},
}


def main() -> int:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    for key, patch in PATCHES.items():
        if key not in data:
            print(f"Lewati {key}: tidak ada")
            continue
        data[key].update(patch)
        print(f"Patched {key} | {data[key]['name']} -> {patch['lat']}, {patch['lon']}")
    JSON_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
