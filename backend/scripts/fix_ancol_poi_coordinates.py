"""
Perbaiki koordinat & wilayah POI Ancol secara terbatas (nama pasti + lon 10.x di kelurahan Ancol).

Referensi: Google Maps / OSM / ancol.com
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"

# (latitude, longitude)
ANCOL_CANONICAL: dict[str, tuple[float, float]] = {
    "Allianz Ecopark & Faunaland": (-6.125928, 106.836324),
    "Allianz Ecopark Ancol": (-6.125928, 106.836324),
    "Dunia Fantasi": (-6.123834, 106.832393),
    "SeaWorld Ancol": (-6.125843, 106.842842),
    "Sea World Ancol": (-6.125843, 106.842842),
    "Ocean Dream Samudera": (-6.125018, 106.843600),
    "Putri Duyung Resort": (-6.121768, 106.840231),
    "Putri Duyung Ancol": (-6.121823, 106.840983),
    "Putri Duyung": (-6.121768, 106.840231),
    "Atlantis Water Adventures Ancol": (-6.124500, 106.839500),
    "Ancol Lagoon Beach": (-6.127200, 106.844000),
    "Ancol Art Market": (-6.126657, 106.839134),
    "Art & Craft Market": (-6.126657, 106.839134),
    "Taman Impian Jaya Ancol": (-6.121495, 106.841477),
    "Ancol": (-6.125028, 106.841379),
    "Candi Kul Kul": (-6.121926, 106.839310),
    "Monumen Ancol": (-6.123367, 106.841092),
    "Mercure Hotel Ancol": (-6.122377, 106.836569),
    "Discovery Hotel": (-6.125758, 106.831081),
    "Grand Dafam Ancol": (-6.129613, 106.829421),
    "Gong Bende": (-6.119248, 106.855082),
    "Hemelboom": (-6.117652, 106.855601),
    "Taman Gazebo": (-6.121830, 106.842090),
    "Kawasan Ballara": (-6.124753, 106.683115),
    "Marina Batavia": (-6.120244, 106.812738),
    "Beach Food Court": (-6.120468, 106.684679),
    "Solaria": (-6.124095, 106.684184),
    "Gili Kitchen": (-6.123892, 106.684352),
    "Walking Drums": (-6.115798, 106.685843),
}

ANCOL_PDF_IDS = {f"PDF_{i:04d}" for i in range(1, 9)}

ANCOL_DISTRICT = "Jakarta Utara"
ANCOL_SUBDISTRICT = "Pademangan"
ANCOL_VILLAGE = "Ancol"
ANCOL_POSTCODE = "14430"


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


def repair_coordinates(lat: float | None, lon: float | None) -> tuple[float | None, float | None]:
    if lat is None or lon is None:
        return lat, lon

    if abs(lat) > 10 and abs(lat) <= 100:
        trial = lat / 10
        if abs(trial) <= 90:
            lat = trial

    if abs(lat) > 90 and abs(lat) <= 900:
        trial = lat / 100
        if abs(trial) <= 90:
            lat = trial

    if -6.45 <= lat <= -5.95 and 10.0 <= lon <= 11.0:
        lon = lon * 10.0

    return lat, lon


def in_ancol_village(row: dict) -> bool:
    return (row.get("village") or "").strip() == ANCOL_VILLAGE


def should_fix_row(row: dict, name: str) -> bool:
    rid = (row.get("id_poi") or "").strip()
    if name in ANCOL_CANONICAL:
        return True
    if rid in ANCOL_PDF_IDS:
        return True
    if in_ancol_village(row):
        return True
    if re.search(r"\bancol\b", name, re.I):
        return True
    return False


def apply_row_fixes(row: dict) -> bool:
    name = (row.get("nama") or "").strip()
    if not name or not should_fix_row(row, name):
        return False

    changed = False
    lat = normalize_coordinate(row.get("latitude", ""), True)
    lon = normalize_coordinate(row.get("longitude", ""), False)
    lat, lon = repair_coordinates(lat, lon)

    if name in ANCOL_CANONICAL:
        lat, lon = ANCOL_CANONICAL[name]
    elif not lat or not lon:
        if (row.get("id_poi") or "").strip() in ANCOL_PDF_IDS and "Ancol" in name:
            lat, lon = ANCOL_CANONICAL.get(name, (-6.125028, 106.841379))

    if name in ANCOL_CANONICAL or in_ancol_village(row) or (row.get("id_poi") or "").strip() in ANCOL_PDF_IDS:
        if (row.get("district") or "").strip() != ANCOL_DISTRICT:
            row["district"] = ANCOL_DISTRICT
            changed = True
        if (row.get("subdistrict") or "").strip() != ANCOL_SUBDISTRICT:
            row["subdistrict"] = ANCOL_SUBDISTRICT
            changed = True
        if in_ancol_village(row) or name in ANCOL_CANONICAL:
            if (row.get("village") or "").strip() != ANCOL_VILLAGE:
                row["village"] = ANCOL_VILLAGE
                changed = True
        if (row.get("postcode") or "").strip() in {"", "17431"}:
            row["postcode"] = ANCOL_POSTCODE
            row["kode_pos"] = ANCOL_POSTCODE
            changed = True

    if lat is not None and lon is not None:
        new_lat_s = format_coord(lat, True)
        new_lon_s = format_coord(lon, False)
        if row.get("latitude") != new_lat_s or row.get("longitude") != new_lon_s:
            row["latitude"] = new_lat_s
            row["longitude"] = new_lon_s
            changed = True

    tg = row.get("teks_gabungan") or ""
    if name in ANCOL_CANONICAL and "Jakarta Selatan" in tg:
        row["teks_gabungan"] = tg.replace("Mampang Prapatan, Jakarta Selatan", "Pademangan, Jakarta Utara")
        changed = True

    return changed


def fix_csv() -> int:
    rows: list[dict] = []
    changed_count = 0
    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = reader.fieldnames
        if not fieldnames:
            return 0
        for row in reader:
            if apply_row_fixes(row):
                changed_count += 1
            rows.append(row)

    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    return changed_count


def fix_database() -> int:
    conn = get_connection()
    cur = conn.cursor()
    updated = 0
    try:
        names = list(ANCOL_CANONICAL.keys())
        cur.execute(
            """
            SELECT id, name, latitude, longitude, district
            FROM poi_enriched
            WHERE name = ANY(%s)
               OR name ILIKE '%%ancol%%'
            """,
            (names,),
        )
        for row in cur.fetchall():
            name = (row["name"] or "").strip()
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            lat, lon = repair_coordinates(lat, lon)
            if name in ANCOL_CANONICAL:
                lat, lon = ANCOL_CANONICAL[name]

            new_district = ANCOL_DISTRICT if name in ANCOL_CANONICAL or "ancol" in name.lower() else row["district"]
            if abs(float(row["latitude"]) - lat) > 1e-6 or abs(float(row["longitude"]) - lon) > 1e-6 or new_district != row["district"]:
                cur.execute(
                    """
                    UPDATE poi_enriched
                    SET latitude = %s, longitude = %s, district = %s
                    WHERE id = %s
                    """,
                    (lat, lon, new_district, row["id"]),
                )
                updated += cur.rowcount

        conn.commit()
        return updated
    finally:
        cur.close()
        conn.close()


def main() -> int:
    csv_changes = fix_csv()
    db_changes = fix_database()
    print("=== Perbaikan POI Ancol (terbatas) ===")
    print(f"Baris CSV diperbarui: {csv_changes}")
    print(f"Baris poi_enriched diperbarui: {db_changes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
