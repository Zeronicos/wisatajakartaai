import argparse
import csv
from pathlib import Path
from typing import Iterable

from database import get_connection


def normalize_coordinate(raw: str, is_lat: bool) -> float | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in {"nan", "none", "null", "-"}:
        return None

    s = s.replace(",", ".")
    sign = ""
    if s[0] in "+-":
        sign = s[0]
        s = s[1:]

    parts = s.split(".")
    if len(parts) > 2:
        s = f"{parts[0]}.{''.join(parts[1:])}"

    s = sign + s

    try:
        value = float(s)
    except ValueError:
        return None

    if is_lat and abs(value) > 90:
        # Kasus seperti -628.977 -> -6.28977
        if abs(value) <= 900:
            value = value / 100
    if not is_lat and abs(value) > 180:
        # Kasus langka lon salah skala
        if abs(value) <= 1800:
            value = value / 10

    if is_lat and abs(value) > 90:
        return None
    if not is_lat and abs(value) > 180:
        return None
    return value


def first_nonempty(row: dict, aliases: Iterable[str], default: str = "") -> str:
    for key in aliases:
        if key in row and row[key] is not None:
            val = str(row[key]).strip()
            if val and val.lower() not in {"nan", "none", "null"}:
                return val
    return default


def detect_delimiter(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as f:
        sample = f.read(2048)
    if ";" in sample and sample.count(";") > sample.count(","):
        return ";"
    return ","


def load_poi(cur, file_path: Path, source_value: str = "csv+osm") -> tuple[int, int]:
    inserted = 0
    skipped = 0
    delimiter = detect_delimiter(file_path)

    with file_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            name = first_nonempty(row, ["name", "nama", "nama_id", "nama_en"])
            category = first_nonempty(row, ["category", "kategori"])
            subcategory = first_nonempty(row, ["subcategory", "sub_kategori"])
            description = first_nonempty(row, ["description", "deskripsi", "teks_gabungan"])
            phone = first_nonempty(row, ["phone", "telepon"])
            website = first_nonempty(row, ["website"])
            district = first_nonempty(row, ["district", "kota", "kabupaten"])
            source_id = first_nonempty(row, ["id_poi", "osm_id", "id"])

            lat = normalize_coordinate(first_nonempty(row, ["latitude", "lat"]), is_lat=True)
            lon = normalize_coordinate(first_nonempty(row, ["longitude", "lon", "lng"]), is_lat=False)
            if not name or lat is None or lon is None:
                skipped += 1
                continue

            cur.execute(
                """
                INSERT INTO poi_enriched
                (source_id, name, category, subcategory, latitude, longitude,
                 description, phone, website, district, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    source_id,
                    name,
                    category,
                    subcategory,
                    lat,
                    lon,
                    description,
                    phone,
                    website,
                    district,
                    source_value,
                ),
            )
            inserted += 1

    return inserted, skipped


def load_facility(cur, file_path: Path, table_name: str) -> tuple[int, int]:
    inserted = 0
    skipped = 0
    delimiter = detect_delimiter(file_path)

    with file_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            source_id = first_nonempty(row, ["osm_id", "id"])
            name = first_nonempty(row, ["name", "nama"], default=f"{table_name}_{inserted + 1}")
            category = first_nonempty(row, ["category", "kategori"])
            subcategory = first_nonempty(row, ["subcategory", "sub_kategori"])
            cuisine = first_nonempty(row, ["cuisine"])
            brand = first_nonempty(row, ["brand"])
            facility_type = first_nonempty(row, ["tipe_fasilitas", "facility_type"])
            lat = normalize_coordinate(first_nonempty(row, ["latitude", "lat"]), is_lat=True)
            lon = normalize_coordinate(first_nonempty(row, ["longitude", "lon", "lng"]), is_lat=False)
            if lat is None or lon is None:
                skipped += 1
                continue

            cur.execute(
                f"""
                INSERT INTO {table_name}
                    (source_id, name, latitude, longitude, category, subcategory, cuisine, brand, facility_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (source_id, name, lat, lon, category, subcategory, cuisine, brand, facility_type),
            )
            inserted += 1

    return inserted, skipped


def load_stops(cur, stops_path: Path) -> tuple[int, int]:
    inserted = 0
    skipped = 0
    delimiter = detect_delimiter(stops_path)

    with stops_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            stop_id = first_nonempty(row, ["stop_id"])
            stop_name = first_nonempty(row, ["stop_name"], default="unknown_stop")
            lat = normalize_coordinate(first_nonempty(row, ["stop_lat", "latitude"]), is_lat=True)
            lon = normalize_coordinate(first_nonempty(row, ["stop_lon", "longitude"]), is_lat=False)
            if not stop_id or lat is None or lon is None:
                skipped += 1
                continue

            cur.execute(
                """
                INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (stop_id) DO UPDATE
                SET stop_name = EXCLUDED.stop_name,
                    stop_lat = EXCLUDED.stop_lat,
                    stop_lon = EXCLUDED.stop_lon
                """,
                (stop_id, stop_name, lat, lon),
            )
            inserted += 1

    return inserted, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Load thesis datasets into PostgreSQL.")
    parser.add_argument("--poi", required=True, help="Path ke poi_lengkap_final.csv")
    parser.add_argument("--restaurants", required=True, help="Path ke restoran_jakarta.csv")
    parser.add_argument("--minimarkets", required=True, help="Path ke minimarket_jakarta.csv")
    parser.add_argument("--stops", required=True, help="Path ke GTFS stops.txt")
    parser.add_argument("--truncate", action="store_true", help="Kosongkan tabel sebelum load data.")
    args = parser.parse_args()

    poi_path = Path(args.poi)
    restaurants_path = Path(args.restaurants)
    minimarkets_path = Path(args.minimarkets)
    stops_path = Path(args.stops)

    conn = get_connection()
    cur = conn.cursor()

    if args.truncate:
        cur.execute("TRUNCATE TABLE poi_enriched RESTART IDENTITY")
        cur.execute("TRUNCATE TABLE restaurants RESTART IDENTITY")
        cur.execute("TRUNCATE TABLE minimarkets RESTART IDENTITY")
        cur.execute("TRUNCATE TABLE stops")

    poi_ok, poi_skip = load_poi(cur, poi_path)
    rst_ok, rst_skip = load_facility(cur, restaurants_path, "restaurants")
    mini_ok, mini_skip = load_facility(cur, minimarkets_path, "minimarkets")
    stops_ok, stops_skip = load_stops(cur, stops_path)

    conn.commit()
    cur.close()
    conn.close()

    print("Load completed.")
    print(f"POI          inserted={poi_ok} skipped={poi_skip}")
    print(f"Restaurants  inserted={rst_ok} skipped={rst_skip}")
    print(f"Minimarkets  inserted={mini_ok} skipped={mini_skip}")
    print(f"Stops        inserted={stops_ok} skipped={stops_skip}")


if __name__ == "__main__":
    main()
