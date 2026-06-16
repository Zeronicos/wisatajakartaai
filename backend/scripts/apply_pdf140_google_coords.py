"""
Terapkan koordinat kanon Google Maps (pdf140_google_coords.json) ke CSV + DB.

Sumber koordinat: backend/data/pdf140_google_coords.json
Opsional refresh via Google API: --refresh-google (butuh GOOGLE_MAPS_API_KEY)

Penggunaan:
  python scripts/apply_pdf140_google_coords.py
  python scripts/apply_pdf140_google_coords.py --refresh-google
"""

from __future__ import annotations

import csv
import json
import re
import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection
from scripts.refine_pdf140_google_coords import apply_to_row, format_coord, _row_id

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"
COORDS_PATH = BACKEND_ROOT / "data" / "pdf140_google_coords.json"
QUERIES_PATH = BACKEND_ROOT / "data" / "pdf140_google_place_queries.json"
REPORT_PATH = BACKEND_ROOT / "scripts" / "pdf140_google_apply_report.json"


def load_place_queries() -> dict[str, str]:
    if QUERIES_PATH.exists():
        return json.loads(QUERIES_PATH.read_text(encoding="utf-8"))
    return {}


def place_query(key: str, name: str, queries: dict[str, str]) -> str:
    if key in queries:
        return queries[key]
    return name


def load_coords() -> dict[str, dict]:
    data = json.loads(COORDS_PATH.read_text(encoding="utf-8"))
    if len(data) != 140:
        raise ValueError(f"Harus 140 entri, ditemukan {len(data)}")
    return data


def refresh_from_google(coords: dict[str, dict]) -> int:
    from services.google_geocoding_service import find_place_google

    queries = load_place_queries()
    updated = 0
    for key, entry in coords.items():
        name = str(entry.get("name") or "").strip()
        query_name = place_query(key, name, queries)
        try:
            result = find_place_google(query_name)
        except Exception:
            result = None
        if not result:
            time.sleep(0.2)
            continue
        entry["lat"] = round(float(result["lat"]), 6)
        entry["lon"] = round(float(result["lon"]), 6)
        if result.get("district"):
            entry["district"] = result["district"]
        if result.get("subdistrict"):
            entry["subdistrict"] = result["subdistrict"]
        if result.get("postcode"):
            entry["postcode"] = result["postcode"]
        entry["google_place_id"] = result.get("place_id", "")
        entry["source"] = result.get("source", "google_api")
        updated += 1
        print(f"[Google API] {key} | {name} -> {entry['lat']}, {entry['lon']}")
        time.sleep(0.15)
    return updated


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh-google", action="store_true", help="Perbarui JSON dari Google API dulu")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not COORDS_PATH.exists():
        print(f"File tidak ada: {COORDS_PATH}", file=sys.stderr)
        return 1

    coords = load_coords()

    if args.refresh_google:
        from services.google_geocoding_service import _api_key

        if not _api_key():
            print("GOOGLE_MAPS_API_KEY belum di-set di backend/.env", file=sys.stderr)
            return 1
        n = refresh_from_google(coords)
        if not args.dry_run:
            COORDS_PATH.write_text(json.dumps(coords, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Google API refresh: {n} entri diperbarui")

    fieldnames: list[str] = []
    pdf_map: dict[str, dict] = {}
    report: list[dict] = []
    changed = 0
    unchanged = 0

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rid = _row_id(row)
            if not re.fullmatch(r"PDF_(\d{4})", rid):
                continue
            num = int(rid.split("_")[1])
            if num < 1 or num > 140:
                continue
            key = f"PDF_{num:03d}"
            geo = coords.get(key)
            if not geo:
                print(f"Lewati {rid}: tidak ada di JSON ({key})")
                continue

            old_lat = normalize_coordinate(row.get("latitude", ""), True)
            old_lon = normalize_coordinate(row.get("longitude", ""), False)
            new_lat = float(geo["lat"])
            new_lon = float(geo["lon"])

            moved = (
                old_lat is None
                or old_lon is None
                or abs(old_lat - new_lat) > 0.000001
                or abs(old_lon - new_lon) > 0.000001
                or (row.get("district") or "").strip() != str(geo.get("district") or "").strip()
            )

            if moved:
                if not args.dry_run:
                    apply_to_row(row, geo)
                changed += 1
                report.append(
                    {
                        "id": rid,
                        "key": key,
                        "name": geo.get("name"),
                        "status": "updated",
                        "old": {"lat": old_lat, "lon": old_lon, "district": row.get("district")},
                        "new": {"lat": new_lat, "lon": new_lon, "district": geo.get("district")},
                    }
                )
                print(f"[UPDATE] {key} | {geo.get('name')} | {old_lat},{old_lon} -> {new_lat},{new_lon}")
            else:
                unchanged += 1
                report.append({"id": rid, "key": key, "name": geo.get("name"), "status": "unchanged"})
            pdf_map[rid] = row

    db_updated = 0
    if not args.dry_run and changed > 0:
        all_rows: list[dict] = []
        with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                rid = _row_id(row)
                all_rows.append(pdf_map.get(rid, row))
        with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";", lineterminator="\n")
            writer.writeheader()
            writer.writerows(all_rows)

        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO admin_cities(name)
                SELECT DISTINCT TRIM(district)
                FROM poi_enriched
                WHERE district IS NOT NULL AND TRIM(district) <> ''
                ON CONFLICT (name) DO NOTHING
                """
            )
            for item in report:
                if item.get("status") != "updated":
                    continue
                key = item["key"]
                new = item["new"]
                cur.execute(
                    """
                    UPDATE poi_enriched
                    SET latitude = %s, longitude = %s, district = %s
                    WHERE source_id = %s
                    """,
                    (new["lat"], new["lon"], new["district"], key),
                )
                db_updated += cur.rowcount
            conn.commit()
        finally:
            cur.close()
            conn.close()

    if not args.dry_run:
        REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== Terapkan koordinat Google Maps ===")
    print(f"Diperbarui: {changed} | Sudah cocok: {unchanged}")
    if not args.dry_run:
        print(f"DB diperbarui: {db_updated} | Laporan: {REPORT_PATH}")
    else:
        print("[DRY-RUN] Tidak ada perubahan disimpan.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
