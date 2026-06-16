"""Perbaiki koordinat destinasi wisata aktif #21-40 (urutan alfabet UI)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
COORDS_PATH = BACKEND / "data" / "pdf140_google_coords.json"

# Koordinat Google Maps / OSM / Wikipedia terverifikasi
FIXES: dict[str, dict] = {
    # 21 Cibubur Bee Park (Taman Wisata Lebah / Wiladatika)
    "PDF_034": {
        "lat": -6.371638,
        "lon": 106.893134,
        "district": "Jakarta Timur",
        "subdistrict": "Cipayung",
        "postcode": "13720",
        "source_note": "Google/OSM Taman Wisata Lebah, Komplek Wiladatika Buperta",
    },
    # 22 Cibubur Scout Camping Ground (Buperta utama)
    "PDF_029": {
        "lat": -6.368794,
        "lon": 106.897513,
        "district": "Jakarta Timur",
        "subdistrict": "Cipayung",
        "postcode": "13870",
        "source_note": "Google Maps Buperta Jl. Buperta No.1 (Bumi Perkemahan Pramuka)",
    },
    # 23 Cijantung City Forest
    "PDF_030": {
        "lat": -6.332411,
        "lon": 106.876523,
        "district": "Jakarta Timur",
        "subdistrict": "Cijantung",
        "postcode": "13770",
        "source_note": "Google Maps Hutan Kota Cijantung Jl. RA Fadillah",
    },
    # 24 Cijantung Skate Park
    "PDF_031": {
        "lat": -6.307620,
        "lon": 106.864400,
        "district": "Jakarta Timur",
        "subdistrict": "Ciracas",
        "postcode": "13750",
        "source_note": "Google Maps Skate Park Jl. TB Simatupang No.18",
    },
    # 25 Ciputra Artpreneur (sudah benar, pastikan presisi)
    "PDF_126": {
        "lat": -6.223656,
        "lon": 106.823375,
        "district": "Jakarta Selatan",
        "subdistrict": "Setiabudi",
        "postcode": "12940",
        "source_note": "Wikipedia Ciputra Artpreneur Ciputra World",
    },
    # 26 Coffee Street Cipete Raya
    "PDF_110": {
        "lat": -6.281400,
        "lon": 106.797100,
        "district": "Jakarta Selatan",
        "subdistrict": "Cilandak",
        "postcode": "12410",
        "source_note": "Google Maps kawasan kafe Jl. Cipete Raya",
    },
    # 27/28 Dunia Fantasi
    "PDF_003": {
        "lat": -6.124212,
        "lon": 106.832156,
        "district": "Jakarta Utara",
        "subdistrict": "Pademangan",
        "postcode": "14430",
        "source_note": "Google/OSM pintu masuk Dunia Fantasi Ancol",
    },
    # 29 Ereveld Menteng Pulo
    "PDF_127": {
        "lat": -6.222631,
        "lon": 106.839288,
        "district": "Jakarta Selatan",
        "subdistrict": "Tebet",
        "postcode": "12810",
        "source_note": "Google/OSM Ereveld Menteng Pulo",
    },
    # 30 Fine Arts and Ceramics Museum
    "PDF_088": {
        "lat": -6.133890,
        "lon": 106.814170,
        "district": "Jakarta Barat",
        "subdistrict": "Taman Sari",
        "postcode": "11110",
        "source_note": "Wikipedia Museum Seni Rupa dan Keramik Fatahillah",
    },
    # 31 Gedung Kesenian Jakarta
    "PDF_048": {
        "lat": -6.166540,
        "lon": 106.834417,
        "district": "Jakarta Pusat",
        "subdistrict": "Sawah Besar",
        "postcode": "10710",
        "source_note": "Wikipedia Gedung Kesenian Jakarta",
    },
    # 32 Gelora Bung Karno City Forest
    "PDF_071": {
        "lat": -6.222300,
        "lon": 106.806846,
        "district": "Jakarta Pusat",
        "subdistrict": "Tanah Abang",
        "postcode": "10270",
        "source_note": "Google/OSM Hutan Kota GBK",
    },
    # 33 Gelora Bung Karno Main Stadium
    "PDF_069": {
        "lat": -6.218612,
        "lon": 106.802554,
        "district": "Jakarta Pusat",
        "subdistrict": "Tanah Abang",
        "postcode": "10270",
        "source_note": "Google/OSM Stadion Utama GBK",
    },
    # 34 Glodok Chinatown
    "PDF_095": {
        "lat": -6.135983,
        "lon": 106.813430,
        "district": "Jakarta Barat",
        "subdistrict": "Taman Sari",
        "postcode": "11120",
        "source_note": "Google Maps pusat Glodok Chinatown",
    },
    # 35 GPIB Sion Jakarta Church
    "PDF_090": {
        "lat": -6.163611,
        "lon": 106.819722,
        "district": "Jakarta Pusat",
        "subdistrict": "Sawah Besar",
        "postcode": "10710",
        "source_note": "Google Maps GPIB Sion Jl. Walet",
    },
    # 36 Graha Bakti Antara Museum
    "PDF_049": {
        "lat": -6.165734,
        "lon": 106.834212,
        "district": "Jakarta Pusat",
        "subdistrict": "Sawah Besar",
        "postcode": "10710",
        "source_note": "Google Maps Museum Antara Jl. Antara",
    },
    # 37 Harapan Island
    "PDF_077": {
        "lat": -5.653307,
        "lon": 106.578128,
        "district": "Kepulauan Seribu",
        "subdistrict": "Kepulauan Seribu Utara",
        "postcode": "14540",
        "source_note": "Google/OSM Pulau Harapan Kepulauan Seribu",
    },
    # 38 Harry Darsono Museum
    "PDF_111": {
        "lat": -6.289216,
        "lon": 106.801886,
        "district": "Jakarta Selatan",
        "subdistrict": "Cilandak",
        "postcode": "12710",
        "source_note": "Google/OSM Museum Harry Darsono",
    },
    # 39 Istana Susu Cibubur Garden Dairy (Cibugary)
    "PDF_033": {
        "lat": -6.354722,
        "lon": 106.910833,
        "district": "Jakarta Timur",
        "subdistrict": "Cipayung",
        "postcode": "13860",
        "source_note": "Google Maps Cibugary Jl. Peternakan Raya Blok C No.12 Pondok Ranggon",
    },
    # 40 Istiqlal Mosque
    "PDF_051": {
        "lat": -6.170240,
        "lon": 106.831006,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "postcode": "10110",
        "source_note": "Google/OSM Masjid Istiqlal",
    },
}


def main() -> int:
    coords = json.loads(COORDS_PATH.read_text(encoding="utf-8"))
    changed = 0
    for key, patch in FIXES.items():
        if key not in coords:
            continue
        entry = coords[key]
        old = (round(float(entry["lat"]), 6), round(float(entry["lon"]), 6))
        entry.update(patch)
        entry["source"] = "google_maps_manual_v3"
        new = (round(float(entry["lat"]), 6), round(float(entry["lon"]), 6))
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
