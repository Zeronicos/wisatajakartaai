"""Perbaiki koordinat duplikat tersisa + sinkron CSV PDF ke DB."""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection
from scripts.refine_pdf140_google_coords import apply_to_row, format_coord, _row_id

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"

# Google Maps / OSM
FINAL_FIXES: dict[str, dict] = {
    "Cijantung City Forest": {
        "lat": -6.332300,
        "lon": 106.876200,
        "district": "Jakarta Timur",
        "subdistrict": "Cijantung",
        "village": "Cijantung",
        "postcode": "13770",
    },
    "Gelora Bung Karno City Forest": {
        "lat": -6.226700,
        "lon": 106.803300,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Gelora",
        "postcode": "10270",
    },
    "Manggala Wanabakti National Forestry Museum": {
        "lat": -6.196400,
        "lon": 106.834700,
        "district": "Jakarta Pusat",
        "subdistrict": "Menteng",
        "village": "Gondangdia",
        "postcode": "10350",
    },
    "Taman Cattleya Cibubur": {
        "lat": -6.351700,
        "lon": 106.917800,
        "district": "Jakarta Timur",
        "subdistrict": "Cibubur",
        "village": "Cibubur",
        "postcode": "13720",
    },
    "Sky Rink Taman Anggrek": {
        "lat": -6.178400,
        "lon": 106.792300,
        "district": "Jakarta Barat",
        "subdistrict": "Grogol Petamburan",
        "village": "Tanjung Duren Selatan",
        "postcode": "11470",
    },
    "Vihara Amurva Bhumi Jatinegara": {
        "lat": -6.215000,
        "lon": 106.866700,
        "district": "Jakarta Timur",
        "subdistrict": "Jatinegara",
        "village": "Kampung Melayu",
        "postcode": "13320",
    },
    "Vihara Dharma Jaya Toa Se Bio": {
        "lat": -6.142800,
        "lon": 106.829500,
        "district": "Jakarta Barat",
        "subdistrict": "Taman Sari",
        "village": "Glodok",
        "postcode": "11120",
    },
    "Pniel Jakarta GPIB Church": {
        "lat": -6.163100,
        "lon": 106.816900,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Petojo Selatan",
        "postcode": "10160",
    },
    "GPIB Sion Jakarta Church": {
        "lat": -6.163611,
        "lon": 106.819722,
        "district": "Jakarta Pusat",
        "subdistrict": "Sawah Besar",
        "village": "Pasar Baru",
        "postcode": "10710",
    },
    "Jakarta International Equestrian Park": {
        "lat": -6.152894,
        "lon": 106.897103,
        "district": "Jakarta Timur",
        "subdistrict": "Pulo Gadung",
        "village": "Jati",
        "postcode": "13220",
    },
}


def main() -> int:
    fieldnames: list[str] = []
    pdf_rows: list[dict] = []
    pdf_map: dict[str, dict] = {}

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rid = _row_id(row)
            name = (row.get("nama") or "").strip()
            if rid.startswith("PDF_") and name in FINAL_FIXES:
                geo = dict(FINAL_FIXES[name])
                apply_to_row(row, geo)
                pdf_map[rid] = row
                pdf_rows.append(row)
                print(f"Fixed {rid} | {name} -> {geo['lat']}, {geo['lon']}")

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
        with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f, delimiter=";"):
                rid = _row_id(row)
                if not re.fullmatch(r"PDF_(\d{4})", rid):
                    continue
                num = int(rid.split("_")[1])
                if num < 1 or num > 140:
                    continue
                lat = normalize_coordinate(row.get("latitude", ""), True)
                lon = normalize_coordinate(row.get("longitude", ""), False)
                district = (row.get("district") or "").strip()
                if lat is None or lon is None or not district:
                    continue
                source_id = f"PDF_{num:03d}"
                cur.execute(
                    """
                    UPDATE poi_enriched
                    SET latitude = %s, longitude = %s, district = %s
                    WHERE source_id = %s
                    """,
                    (lat, lon, district, source_id),
                )
                updated += cur.rowcount
        conn.commit()
    finally:
        cur.close()
        conn.close()

    print(f"DB updated: {updated} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
