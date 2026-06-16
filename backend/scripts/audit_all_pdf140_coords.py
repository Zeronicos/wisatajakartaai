"""
Audit & perbaiki koordinat PDF_001-140.
Hanya ubah jika selisih > ~200m dari referensi kanon atau distrik salah.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
COORDS_PATH = BACKEND / "data" / "pdf140_google_coords.json"
REPORT_PATH = BACKEND / "scripts" / "pdf140_audit_report.json"

# Referensi kanon: Google Maps / Wikipedia / OSM / perbaikan manual sebelumnya
CANONICAL: dict[str, dict] = {
    # Kepulauan Seribu (Wikipedia Thousand Islands)
    "PDF_076": {"lat": -5.968972, "lon": 106.743333, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Utara", "postcode": "14520", "note": "Pulau Onrust"},
    "PDF_077": {"lat": -5.653307, "lon": 106.578128, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Utara", "postcode": "14540", "note": "Pulau Harapan"},
    "PDF_078": {"lat": -5.745886, "lon": 106.614065, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Utara", "postcode": "14530", "note": "Pulau Pramuka"},
    "PDF_079": {"lat": -5.821110, "lon": 106.552220, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Selatan", "postcode": "14520", "note": "Pulau Tidung"},
    "PDF_080": {"lat": -5.977488, "lon": 106.706941, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Utara", "postcode": "14530", "note": "Pulau Untung Jawa"},
    "PDF_081": {"lat": -5.592830, "lon": 106.566653, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Selatan", "postcode": "14520", "note": "Pulau Putri"},
    "PDF_082": {"lat": -5.948611, "lon": 106.784722, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Utara", "postcode": "14520", "note": "Pulau Bidadari"},
    "PDF_083": {"lat": -5.598869, "lon": 106.547121, "district": "Kepulauan Seribu", "subdistrict": "Kepulauan Seribu Utara", "postcode": "14520", "note": "Pulau Macan"},
    # Buperta / Cibubur (perbaikan v3)
    "PDF_029": {"lat": -6.368794, "lon": 106.897513, "district": "Jakarta Timur", "subdistrict": "Cipayung", "postcode": "13870", "note": "Buperta"},
    "PDF_034": {"lat": -6.366584, "lon": 106.895810, "district": "Jakarta Timur", "subdistrict": "Cipayung", "postcode": "13720", "note": "Cibubur Bee Park Google Maps user verified"},
    "PDF_030": {"lat": -6.321991, "lon": 106.858571, "district": "Jakarta Timur", "subdistrict": "Pasar Rebo", "postcode": "13770", "note": "Hutan Kota Cijantung Google Maps"},
    "PDF_031": {"lat": -6.307620, "lon": 106.864400, "district": "Jakarta Timur", "subdistrict": "Ciracas", "postcode": "13750", "note": "Skate Park Cijantung"},
    "PDF_033": {"lat": -6.354722, "lon": 106.910833, "district": "Jakarta Timur", "subdistrict": "Cipayung", "postcode": "13860", "note": "Istana Susu Cibugary"},
    "PDF_036": {"lat": -6.351700, "lon": 106.917800, "district": "Jakarta Timur", "subdistrict": "Cibubur", "postcode": "13720", "note": "Taman Cattleya Cibubur"},
    # Landmark & museum
    "PDF_003": {"lat": -6.124212, "lon": 106.832156, "district": "Jakarta Utara", "subdistrict": "Pademangan", "postcode": "14430", "note": "Dufan"},
    "PDF_051": {"lat": -6.170240, "lon": 106.831006, "district": "Jakarta Pusat", "subdistrict": "Gambir", "postcode": "10110", "note": "Istiqlal"},
    "PDF_088": {"lat": -6.133890, "lon": 106.814170, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11110", "note": "Museum Seni Rupa"},
    "PDF_093": {"lat": -6.137185, "lon": 106.812948, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11110", "note": "Museum BI"},
    "PDF_098": {"lat": -6.153056, "lon": 106.814444, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11110", "note": "Arsip Nasional"},
    "PDF_108": {"lat": -6.175020, "lon": 106.790000, "district": "Jakarta Barat", "subdistrict": "Grogol Petamburan", "postcode": "11470", "note": "Jakarta Aquarium Neo Soho"},
    "PDF_119": {"lat": -6.236093, "lon": 106.815092, "district": "Jakarta Selatan", "subdistrict": "Kebayoran Baru", "postcode": "12160", "note": "Blok S Kuliner"},
    "PDF_126": {"lat": -6.223656, "lon": 106.823375, "district": "Jakarta Selatan", "subdistrict": "Setiabudi", "postcode": "12940", "note": "Ciputra Artpreneur"},
    "PDF_058": {"lat": -6.185972, "lon": 106.822583, "district": "Jakarta Pusat", "subdistrict": "Gambir", "postcode": "10110", "note": "Taman Proklamasi"},
    "PDF_045": {"lat": -6.177500, "lon": 106.834722, "district": "Jakarta Pusat", "subdistrict": "Menteng", "postcode": "10140", "note": "Pecenongan"},
    "PDF_044": {"lat": -6.137222, "lon": 106.814444, "district": "Jakarta Barat", "subdistrict": "Taman Sari", "postcode": "11120", "note": "Sin Tek Bio"},
    "PDF_090": {"lat": -6.163611, "lon": 106.819722, "district": "Jakarta Pusat", "subdistrict": "Sawah Besar", "postcode": "10710", "note": "GPIB Sion"},
    # GBK cluster
    "PDF_069": {"lat": -6.218612, "lon": 106.802554, "district": "Jakarta Pusat", "subdistrict": "Tanah Abang", "postcode": "10270", "note": "GBK Stadium"},
    "PDF_071": {"lat": -6.222300, "lon": 106.806846, "district": "Jakarta Pusat", "subdistrict": "Tanah Abang", "postcode": "10270", "note": "Hutan Kota GBK"},
    "PDF_075": {"lat": -6.207202, "lon": 106.798797, "district": "Jakarta Pusat", "subdistrict": "Tanah Abang", "postcode": "10270", "note": "Museum Kehutanan"},
    # Ragunan cluster
    "PDF_133": {"lat": -6.311588, "lon": 106.819918, "district": "Jakarta Selatan", "subdistrict": "Pasar Minggu", "postcode": "12550", "note": "Kebun Binatang Ragunan"},
    "PDF_135": {"lat": -6.304479, "lon": 106.824172, "district": "Jakarta Selatan", "subdistrict": "Pasar Minggu", "postcode": "12550", "note": "Taman Anggrek Ragunan"},
    "PDF_136": {"lat": -6.303500, "lon": 106.820500, "district": "Jakarta Selatan", "subdistrict": "Pasar Minggu", "postcode": "12550", "note": "Agro Edutourism"},
    "PDF_140": {"lat": -6.296503, "lon": 106.820062, "district": "Jakarta Selatan", "subdistrict": "Pasar Minggu", "postcode": "12550", "note": "Camping Ground Ragunan"},
    "PDF_139": {"lat": -6.322500, "lon": 106.823611, "district": "Jakarta Selatan", "subdistrict": "Pasar Minggu", "postcode": "12550", "note": "Spathodea Park"},
}


def meters(lat1, lon1, lat2, lon2) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main() -> int:
    coords = json.loads(COORDS_PATH.read_text(encoding="utf-8"))
    report: dict = {"fixed": [], "ok": [], "metadata_only": []}
    changed = 0

    for key in sorted(coords.keys()):
        entry = coords[key]
        cur_lat, cur_lon = float(entry["lat"]), float(entry["lon"])
        canon = CANONICAL.get(key)
        if not canon:
            report["ok"].append({"key": key, "name": entry["name"], "status": "no_canonical_override"})
            continue
        c_lat, c_lon = float(canon["lat"]), float(canon["lon"])
        dist = meters(cur_lat, cur_lon, c_lat, c_lon)
        meta_changed = (
            entry.get("district") != canon.get("district")
            or entry.get("subdistrict") != canon.get("subdistrict")
            or entry.get("postcode") != canon.get("postcode")
        )
        if dist > 200 or meta_changed:
            old = (cur_lat, cur_lon, entry.get("district"), entry.get("subdistrict"))
            entry["lat"] = c_lat
            entry["lon"] = c_lon
            if canon.get("district"):
                entry["district"] = canon["district"]
            if canon.get("subdistrict"):
                entry["subdistrict"] = canon["subdistrict"]
            if canon.get("postcode"):
                entry["postcode"] = canon["postcode"]
            entry["source"] = "google_maps_audit"
            entry["source_note"] = canon.get("note", "audit canonical")
            changed += 1
            item = {
                "key": key,
                "name": entry["name"],
                "old_lat": cur_lat,
                "old_lon": cur_lon,
                "new_lat": c_lat,
                "new_lon": c_lon,
                "distance_m": round(dist, 1),
            }
            if dist > 200:
                report["fixed"].append(item)
                print(f"[FIX] {key} | {entry['name']} | {dist:.0f}m")
            else:
                report["metadata_only"].append(item)
                print(f"[META] {key} | {entry['name']}")
        else:
            report["ok"].append({"key": key, "name": entry["name"], "lat": cur_lat, "lon": cur_lon})

    if changed:
        COORDS_PATH.write_text(json.dumps(coords, indent=2, ensure_ascii=False), encoding="utf-8")
        subprocess.run([sys.executable, str(BACKEND / "scripts" / "apply_pdf140_google_coords.py")], check=False)
        subprocess.run([sys.executable, str(BACKEND / "scripts" / "check_pdf140_dup_coords.py")], check=False)

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDiperbaiki: {len(report['fixed'])} | Metadata: {len(report['metadata_only'])} | OK: {len(report['ok'])}")
    print(f"Laporan: {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
