"""Perbaiki koordinat & wilayah PDF destinasi Kepulauan Seribu (PDF_0076–PDF_0083)."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"

SERIBU_DISTRICT = "Kepulauan Seribu"

# Koordinat referensi Google Maps / OSM
SERIBU_PDF_FIXES: dict[str, dict[str, str | float]] = {
    "PDF_0076": {
        "name": "Onrust-Cipir-Kelor Islands",
        "lat": -5.968972,
        "lon": 106.743333,
        "subdistrict": "Kepulauan Seribu Utara",
        "village": "Pulau Onrust",
        "postcode": "14520",
    },
    "PDF_0077": {
        "name": "Harapan Island",
        "lat": -5.528333,
        "lon": 106.611944,
        "subdistrict": "Kepulauan Seribu Utara",
        "village": "Pulau Harapan",
        "postcode": "14540",
    },
    "PDF_0078": {
        "name": "Pramuka Island",
        "lat": -5.659722,
        "lon": 106.570833,
        "subdistrict": "Kepulauan Seribu Utara",
        "village": "Pulau Pramuka",
        "postcode": "14530",
    },
    "PDF_0079": {
        "name": "Tidung Island",
        "lat": -5.805833,
        "lon": 106.493333,
        "subdistrict": "Kepulauan Seribu Selatan",
        "village": "Pulau Tidung",
        "postcode": "14520",
    },
    "PDF_0080": {
        "name": "Untung Jawa Island",
        "lat": -5.978937,
        "lon": 106.717657,
        "subdistrict": "Kepulauan Seribu Utara",
        "village": "Pulau Untung Jawa",
        "postcode": "14530",
    },
    "PDF_0081": {
        "name": '"Pelangi, Sepa and Putri Islands"',
        "lat": -5.923056,
        "lon": 106.467778,
        "subdistrict": "Kepulauan Seribu Selatan",
        "village": "Pulau Putri",
        "postcode": "14520",
    },
    "PDF_0082": {
        "name": "Bidadari Island",
        "lat": -5.948611,
        "lon": 106.784722,
        "subdistrict": "Kepulauan Seribu Utara",
        "village": "Pulau Bidadari",
        "postcode": "14520",
    },
    "PDF_0083": {
        "name": "Macan Island",
        "lat": -5.968333,
        "lon": 106.701667,
        "subdistrict": "Kepulauan Seribu Utara",
        "village": "Pulau Macan",
        "postcode": "14520",
    },
}


def format_coord(value: float, is_lat: bool) -> str:
    sign = "-" if value < 0 else ""
    abs_v = abs(value)
    whole = int(abs_v)
    frac = abs_v - whole
    frac_str = f"{frac:.6f}".split(".")[1].rstrip("0")
    if not frac_str:
        return f"{sign}{whole}"
    if is_lat:
        return (
            f"{sign}{whole}.{frac_str[:3]}.{frac_str[3:]}"
            if len(frac_str) > 3
            else f"{sign}{whole}.{frac_str}"
        )
    return f"{whole}.{frac_str[:3]}.{frac_str[3:]}" if len(frac_str) > 3 else f"{whole}.{frac_str}"


def _row_id(row: dict) -> str:
    for key, val in row.items():
        if key.lstrip("\ufeff").strip() == "id_poi":
            return (val or "").strip()
    return (row.get("id_poi") or "").strip()


def apply_fix(row: dict, fix: dict[str, str | float]) -> bool:
    changed = False
    lat_s = format_coord(float(fix["lat"]), True)
    lon_s = format_coord(float(fix["lon"]), False)
    for key, val in [
        ("latitude", lat_s),
        ("longitude", lon_s),
        ("district", SERIBU_DISTRICT),
        ("subdistrict", fix["subdistrict"]),
        ("village", fix["village"]),
        ("postcode", fix["postcode"]),
        ("kode_pos", fix["postcode"]),
    ]:
        if val and row.get(key) != val:
            row[key] = val
            changed = True
    return changed


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    fieldnames: list[str] = []
    updated_rows: list[dict] = []
    pdf_map: dict[str, dict] = {}

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rid = _row_id(row)
            if rid in SERIBU_PDF_FIXES:
                if apply_fix(row, SERIBU_PDF_FIXES[rid]):
                    updated_rows.append(row)
                pdf_map[rid] = row

    print(f"Baris Seribu diperbaiki: {len(updated_rows)}")
    for row in updated_rows:
        print(f"  {_row_id(row)} | {row.get('nama')} | {row.get('latitude')}, {row.get('longitude')} | {row.get('district')}")

    if args.dry_run:
        return 0

    if updated_rows:
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
    db_updated = 0
    try:
        cur.execute(
            """
            INSERT INTO admin_cities(name)
            VALUES (%s)
            ON CONFLICT (name) DO NOTHING
            """,
            (SERIBU_DISTRICT,),
        )
        for pdf_id, fix in SERIBU_PDF_FIXES.items():
            source_id = f"PDF_{int(pdf_id.split('_')[1]):03d}"
            cur.execute(
                """
                UPDATE poi_enriched
                SET latitude = %s,
                    longitude = %s,
                    district = %s
                WHERE source_id = %s
                """,
                (float(fix["lat"]), float(fix["lon"]), SERIBU_DISTRICT, source_id),
            )
            db_updated += cur.rowcount
        conn.commit()
    finally:
        cur.close()
        conn.close()

    print(f"DB poi_enriched diperbarui: {db_updated} baris")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
