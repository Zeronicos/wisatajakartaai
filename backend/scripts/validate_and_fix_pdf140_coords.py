"""
Validasi koordinat PDF_0001–PDF_0140: yang sudah valid dibiarkan,
hanya yang tidak valid yang diperbaiki via OSM/Nominatim/Google-verified overrides.

Penggunaan:
  cd backend
  python scripts/validate_and_fix_pdf140_coords.py
  python scripts/validate_and_fix_pdf140_coords.py --dry-run
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection
from scripts.refine_pdf140_google_coords import (
    CSV_PATH,
    apply_to_row,
    in_bounds,
    load_pdf_rows,
    repair_coordinates,
    resolve_coords,
    _row_id,
)

REPORT_PATH = BACKEND_ROOT / "scripts" / "pdf140_validate_report.json"
COORD_PRECISION = 4


def parsed_coords(row: dict) -> tuple[float | None, float | None]:
    lat = normalize_coordinate(row.get("latitude", ""), True)
    lon = normalize_coordinate(row.get("longitude", ""), False)
    return lat, lon


def validation_reason(row: dict, rid: str, duplicate_keys: set[tuple[float, float]]) -> str | None:
    lat, lon = parsed_coords(row)
    if lat is None or lon is None:
        return "koordinat_kosong"
    if lat == 0.0 and lon == 0.0:
        return "koordinat_nol"

    raw_lat, raw_lon = lat, lon
    fixed_lat, fixed_lon = repair_coordinates(lat, lon)
    if fixed_lat is None or fixed_lon is None:
        return "koordinat_rusak"
    if (fixed_lat, fixed_lon) != (raw_lat, raw_lon):
        return "koordinat_perlu_perbaikan"

    if not in_bounds(fixed_lat, fixed_lon):
        return "di_luar_wilayah_jakarta"

    district = (row.get("district") or "").strip()
    if not district or district in {"-", "nan"}:
        return "wilayah_kosong"

    key = (round(fixed_lat, COORD_PRECISION), round(fixed_lon, COORD_PRECISION))
    if key in duplicate_keys:
        return "titik_duplikat"

    return None


def find_duplicate_keys(rows: list[dict]) -> set[tuple[float, float]]:
    buckets: dict[tuple[float, float], list[str]] = {}
    for row in rows:
        rid = _row_id(row)
        lat, lon = parsed_coords(row)
        if lat is None or lon is None:
            continue
        lat, lon = repair_coordinates(lat, lon)
        if lat is None or lon is None:
            continue
        key = (round(lat, COORD_PRECISION), round(lon, COORD_PRECISION))
        buckets.setdefault(key, []).append(rid)

    dupes: set[tuple[float, float]] = set()
    for key, ids in buckets.items():
        if len(ids) > 1:
            dupes.add(key)
    return dupes


def sync_db(rows: list[dict], changed_ids: set[str]) -> int:
    if not changed_ids:
        return 0

    conn = get_connection()
    cur = conn.cursor()
    updated = 0
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
        for row in rows:
            rid = _row_id(row)
            if rid not in changed_ids:
                continue
            num = int(rid.split("_")[1])
            lat, lon = parsed_coords(row)
            district = (row.get("district") or "").strip()
            if lat is None or lon is None or not district:
                continue
            cur.execute(
                """
                UPDATE poi_enriched
                SET latitude = %s, longitude = %s, district = %s
                WHERE source_id = %s
                """,
                (lat, lon, district, f"PDF_{num:03d}"),
            )
            updated += cur.rowcount
        conn.commit()
        return updated
    finally:
        cur.close()
        conn.close()


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    fieldnames, pdf_rows, shared_osm = load_pdf_rows()
    if not pdf_rows:
        print("Tidak ada baris PDF_0001–PDF_0140.")
        return 1

    duplicate_keys = find_duplicate_keys(pdf_rows)
    report: list[dict] = []
    kept = 0
    fixed = 0
    failed = 0
    changed_ids: set[str] = set()

    for row in pdf_rows:
        rid = _row_id(row)
        name = (row.get("nama") or "").strip()
        lat, lon = parsed_coords(row)
        reason = validation_reason(row, rid, duplicate_keys)

        if reason is None:
            kept += 1
            report.append(
                {
                    "id": rid,
                    "name": name,
                    "status": "kept",
                    "lat": lat,
                    "lon": lon,
                    "district": row.get("district"),
                }
            )
            print(f"[OK] {rid} | {name}")
            continue

        print(f"[FIX] {rid} | {name} | {reason}")
        geo = resolve_coords(row, rid, shared_osm)
        if not geo:
            failed += 1
            report.append({"id": rid, "name": name, "status": "failed", "reason": reason})
            continue

        new_lat = float(geo["lat"])
        new_lon = float(geo["lon"])
        if not in_bounds(new_lat, new_lon):
            failed += 1
            report.append({"id": rid, "name": name, "status": "failed", "reason": "geocode_out_of_bounds"})
            continue

        old = {"lat": lat, "lon": lon, "district": row.get("district")}
        if not args.dry_run:
            if apply_to_row(row, geo):
                changed_ids.add(rid)
        fixed += 1
        report.append(
            {
                "id": rid,
                "name": name,
                "status": "fixed",
                "reason": reason,
                "source": geo.get("source"),
                "old": old,
                "new": {"lat": new_lat, "lon": new_lon, "district": geo.get("district")},
            }
        )

    db_updated = 0
    if not args.dry_run and changed_ids:
        pdf_map = {_row_id(r): r for r in pdf_rows}
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
        db_updated = sync_db(pdf_rows, changed_ids)

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n=== Validasi PDF_001–PDF_140 ===")
    print(f"Dibiarkan (valid): {kept}")
    print(f"Diperbaiki: {fixed}")
    print(f"Gagal: {failed}")
    if not args.dry_run:
        print(f"CSV diubah: {len(changed_ids)} | DB diubah: {db_updated}")
    else:
        print("[DRY-RUN] Tidak ada perubahan disimpan.")
    print(f"Laporan: {REPORT_PATH}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
