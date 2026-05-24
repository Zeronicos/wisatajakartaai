from math import ceil
import csv
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from database import get_connection

router = APIRouter()

GTFS_DIR = Path(
    os.getenv(
        "GTFS_DIR",
        str(Path(__file__).resolve().parents[2] / "mdb-1909-202602150020"),
    )
)
APP_ROOT = Path(__file__).resolve().parents[2]
RESTAURANT_CSV_PATH = Path(
    os.getenv("RESTAURANT_CSV_PATH", str(APP_ROOT / "restoran_jakarta.csv"))
)
MINIMARKET_CSV_PATH = Path(
    os.getenv("MINIMARKET_CSV_PATH", str(APP_ROOT / "minimarket_jakarta.csv"))
)

TRANSJAKARTA_FILES = [
    "stops.txt",
    "routes.txt",
    "trips.txt",
    "stop_times.txt",
    "shapes.txt",
    "calendar.txt",
    "calendar_dates.txt",
    "frequencies.txt",
    "transfers.txt",
]


class TransjakartaImportPayload(BaseModel):
    truncate_before_import: bool = True


class FacilityImportPayload(BaseModel):
    truncate_before_import: bool = True


class FacilityMutationPayload(BaseModel):
    name: str
    category: str | None = None
    subcategory: str | None = None
    cuisine: str | None = None
    brand: str | None = None
    facility_type: str | None = None


class NamePayload(BaseModel):
    name: str


class DestinationPayload(BaseModel):
    name: str
    city_id: int
    category_id: int


class DestinationStatusPayload(BaseModel):
    is_active: bool


class TransjakartaRouteStatusPayload(BaseModel):
    route_id: str
    is_active: bool


class DestinationDescriptionPayload(BaseModel):
    description: str | None = None


class DestinationBulkStatusPayload(BaseModel):
    is_active: bool
    category_id: int | None = None


def _safe_int(value: str | None, default: int | None = None) -> int | None:
    try:
        if value is None or str(value).strip() == "":
            return default
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _safe_float(value: str | None, default: float | None = None) -> float | None:
    try:
        if value is None or str(value).strip() == "":
            return default
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def _invalidate_search_index_cache_safe() -> None:
    try:
        from routers.search import invalidate_poi_search_index_cache

        invalidate_poi_search_index_cache()
    except Exception:
        pass


def _ensure_master_tables(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_cities (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_categories (
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_destinations (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            city_id INTEGER NOT NULL REFERENCES admin_cities(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES admin_categories(id) ON DELETE CASCADE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_osm_pdf BOOLEAN NOT NULL DEFAULT FALSE,
            is_osm_only BOOLEAN NOT NULL DEFAULT FALSE,
            source_flags_synced BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (name, city_id, category_id)
        )
        """
    )
    cur.execute("ALTER TABLE admin_destinations ADD COLUMN IF NOT EXISTS is_osm_pdf BOOLEAN NOT NULL DEFAULT FALSE")
    cur.execute("ALTER TABLE admin_destinations ADD COLUMN IF NOT EXISTS is_osm_only BOOLEAN NOT NULL DEFAULT FALSE")
    cur.execute("ALTER TABLE admin_destinations ADD COLUMN IF NOT EXISTS source_flags_synced BOOLEAN NOT NULL DEFAULT FALSE")


def _ensure_facility_columns(cur):
    cur.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS category TEXT")
    cur.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subcategory TEXT")
    cur.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine TEXT")
    cur.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS brand TEXT")
    cur.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS facility_type TEXT")
    cur.execute("ALTER TABLE minimarkets ADD COLUMN IF NOT EXISTS category TEXT")
    cur.execute("ALTER TABLE minimarkets ADD COLUMN IF NOT EXISTS subcategory TEXT")
    cur.execute("ALTER TABLE minimarkets ADD COLUMN IF NOT EXISTS cuisine TEXT")
    cur.execute("ALTER TABLE minimarkets ADD COLUMN IF NOT EXISTS brand TEXT")
    cur.execute("ALTER TABLE minimarkets ADD COLUMN IF NOT EXISTS facility_type TEXT")


def _ensure_gtfs_tables(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS gtfs_routes (
            route_id TEXT PRIMARY KEY,
            agency_id TEXT,
            route_short_name TEXT,
            route_long_name TEXT,
            route_desc TEXT,
            route_type INTEGER,
            route_url TEXT,
            route_color TEXT,
            route_text_color TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE
        )
        """
    )
    cur.execute("ALTER TABLE gtfs_routes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
    cur.execute(
        """
        UPDATE gtfs_routes
        SET is_active = TRUE
        WHERE is_active IS NULL
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS gtfs_trips (
            trip_id TEXT PRIMARY KEY,
            route_id TEXT,
            service_id TEXT,
            trip_headsign TEXT,
            direction_id INTEGER,
            shape_id TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS gtfs_shapes (
            shape_id TEXT NOT NULL,
            shape_pt_sequence INTEGER NOT NULL,
            shape_pt_lat DOUBLE PRECISION,
            shape_pt_lon DOUBLE PRECISION,
            shape_dist_traveled DOUBLE PRECISION,
            PRIMARY KEY (shape_id, shape_pt_sequence)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS gtfs_stop_times (
            trip_id TEXT NOT NULL,
            stop_sequence INTEGER NOT NULL,
            arrival_time TEXT,
            departure_time TEXT,
            stop_id TEXT,
            PRIMARY KEY (trip_id, stop_sequence)
        )
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gtfs_trips_route_id ON gtfs_trips(route_id)
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gtfs_trips_shape_id ON gtfs_trips(shape_id)
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gtfs_shapes_shape_id ON gtfs_shapes(shape_id)
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times_trip_id ON gtfs_stop_times(trip_id)
        """
    )


def _seed_master_tables(cur):
    cur.execute("SELECT COUNT(*) AS count FROM admin_destinations")
    total_destinations = int(cur.fetchone()["count"])
    if total_destinations > 0:
        return

    cur.execute(
        """
        SELECT DISTINCT TRIM(district) AS district_name
        FROM poi_enriched
        WHERE district IS NOT NULL AND TRIM(district) <> ''
        ORDER BY district_name
        """
    )
    city_rows = cur.fetchall()
    for row in city_rows:
        cur.execute(
            """
            INSERT INTO admin_cities(name)
            VALUES (%s)
            ON CONFLICT (name) DO NOTHING
            """,
            (row["district_name"],),
        )

    cur.execute(
        """
        SELECT DISTINCT TRIM(category) AS category_name
        FROM poi_enriched
        WHERE category IS NOT NULL AND TRIM(category) <> ''
        ORDER BY category_name
        """
    )
    category_rows = cur.fetchall()
    for row in category_rows:
        cur.execute(
            """
            INSERT INTO admin_categories(name)
            VALUES (%s)
            ON CONFLICT (name) DO NOTHING
            """,
            (row["category_name"],),
        )

    cur.execute(
        """
        INSERT INTO admin_destinations(name, city_id, category_id, is_active)
        SELECT DISTINCT
            p.name,
            c.id AS city_id,
            k.id AS category_id,
            TRUE AS is_active
        FROM poi_enriched p
        JOIN admin_cities c ON c.name = p.district
        JOIN admin_categories k ON k.name = p.category
        WHERE p.name IS NOT NULL
          AND TRIM(p.name) <> ''
          AND p.district IS NOT NULL
          AND TRIM(p.district) <> ''
          AND p.category IS NOT NULL
          AND TRIM(p.category) <> ''
        ON CONFLICT (name, city_id, category_id) DO NOTHING
        """
    )


def _normalize_name(value: str) -> str:
    return value.strip()


def _pagination_meta(page: int, page_size: int, total: int):
    total_pages = ceil(total / page_size) if page_size > 0 else 1
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": max(total_pages, 1),
    }


def _sync_destination_source_flags(cur, destination_ids: list[int] | None = None):
    filter_sql = ""
    params: tuple[Any, ...] = ()
    if destination_ids:
        filter_sql = "WHERE d.id = ANY(%s)"
        params = (destination_ids,)
    else:
        filter_sql = "WHERE d.source_flags_synced = FALSE"

    cur.execute(
        f"""
        WITH target AS (
            SELECT
                d.id,
                LOWER(TRIM(COALESCE(d.name, ''))) AS key_name,
                LOWER(TRIM(COALESCE(c.name, ''))) AS key_district,
                LOWER(TRIM(COALESCE(k.name, ''))) AS key_category
            FROM admin_destinations d
            JOIN admin_cities c ON c.id = d.city_id
            JOIN admin_categories k ON k.id = d.category_id
            {filter_sql}
        ),
        src AS (
            SELECT
                t.id,
                COALESCE(
                    BOOL_OR(
                        LOWER(REGEXP_REPLACE(TRIM(COALESCE(p.source, '')), '[\\s+_-]', '', 'g')) IN ('osmpdf', 'csvosm', 'pdfosm')
                    ),
                    FALSE
                ) AS is_osm_pdf,
                COALESCE(
                    BOOL_OR(
                        LOWER(REGEXP_REPLACE(TRIM(COALESCE(p.source, '')), '[\\s+_-]', '', 'g')) IN ('osmonly', 'osm')
                    ),
                    FALSE
                ) AS is_osm_only
            FROM target t
            LEFT JOIN poi_enriched p
              ON LOWER(TRIM(COALESCE(p.name, ''))) = t.key_name
             AND LOWER(TRIM(COALESCE(p.district, ''))) = t.key_district
             AND LOWER(TRIM(COALESCE(p.category, ''))) = t.key_category
            GROUP BY t.id
        )
        UPDATE admin_destinations d
        SET
            is_osm_pdf = src.is_osm_pdf,
            is_osm_only = src.is_osm_only,
            source_flags_synced = TRUE
        FROM src
        WHERE d.id = src.id
        """,
        params,
    )


def _enforce_source_status_rules(cur, destination_ids: list[int] | None = None):
    if destination_ids:
        cur.execute(
            """
            UPDATE admin_destinations d
            SET is_active = TRUE
            WHERE d.id = ANY(%s)
              AND d.is_osm_pdf = TRUE
              AND d.is_active = FALSE
            """,
            (destination_ids,),
        )
        cur.execute(
            """
            UPDATE admin_destinations d
            SET is_active = FALSE
            WHERE d.id = ANY(%s)
              AND d.is_osm_only = TRUE
              AND d.is_osm_pdf = FALSE
              AND d.is_active = TRUE
            """,
            (destination_ids,),
        )
        return

    cur.execute(
        """
        UPDATE admin_destinations
        SET is_active = TRUE
        WHERE is_osm_pdf = TRUE
          AND is_active = FALSE
        """
    )
    cur.execute(
        """
        UPDATE admin_destinations
        SET is_active = FALSE
        WHERE is_osm_only = TRUE
          AND is_osm_pdf = FALSE
          AND is_active = TRUE
        """
    )


def _load_master_data(cur):
    cur.execute("SELECT id, name FROM admin_cities ORDER BY name ASC")
    cities = [dict(row) for row in cur.fetchall()]
    cur.execute("SELECT id, name FROM admin_categories ORDER BY name ASC")
    categories = [dict(row) for row in cur.fetchall()]
    cur.execute(
        """
        SELECT
            d.id,
            d.name,
            d.city_id,
            c.name AS city_name,
            d.category_id,
            k.name AS category_name,
            d.is_active
        FROM admin_destinations d
        JOIN admin_cities c ON c.id = d.city_id
        JOIN admin_categories k ON k.id = d.category_id
        ORDER BY d.name ASC
        """
    )
    destinations = [dict(row) for row in cur.fetchall()]
    return cities, categories, destinations


def _bootstrap(cur):
    _ensure_master_tables(cur)
    _seed_master_tables(cur)
    _sync_destination_source_flags(cur)
    _enforce_source_status_rules(cur)


def _count_csv_rows(path: Path) -> tuple[int, int]:
    if not path.exists():
        return 0, 0
    with path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.reader(file)
        header = next(reader, None)
        if header is None:
            return 0, 0
        row_count = 0
        for _ in reader:
            row_count += 1
    return row_count, len(header)


def _import_transjakarta_to_db(cur, truncate_before_import: bool) -> dict:
    _ensure_gtfs_tables(cur)
    files = {name: GTFS_DIR / name for name in TRANSJAKARTA_FILES}
    required_files = ["stops.txt", "routes.txt", "trips.txt", "shapes.txt", "stop_times.txt"]
    missing_required = [name for name in required_files if not files[name].exists()]
    if missing_required:
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error",
                "message": f"File wajib GTFS tidak ditemukan: {', '.join(missing_required)}",
            },
        )

    if truncate_before_import:
        cur.execute("TRUNCATE TABLE gtfs_stop_times")
        cur.execute("TRUNCATE TABLE gtfs_shapes")
        cur.execute("TRUNCATE TABLE gtfs_trips")
        cur.execute("TRUNCATE TABLE gtfs_routes")
        cur.execute("TRUNCATE TABLE stops")

    imported = {
        "stops": 0,
        "routes": 0,
        "trips": 0,
        "shapes": 0,
        "stop_times": 0,
    }

    with files["stops.txt"].open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            stop_id = (row.get("stop_id") or "").strip()
            stop_name = (row.get("stop_name") or "").strip() or "unknown_stop"
            stop_lat = _safe_float(row.get("stop_lat"))
            stop_lon = _safe_float(row.get("stop_lon"))
            if not stop_id or stop_lat is None or stop_lon is None:
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
                (stop_id, stop_name, stop_lat, stop_lon),
            )
            imported["stops"] += 1

    with files["routes.txt"].open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            if not route_id:
                continue
            cur.execute(
                """
                INSERT INTO gtfs_routes (
                    route_id, agency_id, route_short_name, route_long_name, route_desc,
                    route_type, route_url, route_color, route_text_color, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                ON CONFLICT (route_id) DO UPDATE
                SET agency_id = EXCLUDED.agency_id,
                    route_short_name = EXCLUDED.route_short_name,
                    route_long_name = EXCLUDED.route_long_name,
                    route_desc = EXCLUDED.route_desc,
                    route_type = EXCLUDED.route_type,
                    route_url = EXCLUDED.route_url,
                    route_color = EXCLUDED.route_color,
                    route_text_color = EXCLUDED.route_text_color,
                    is_active = COALESCE(gtfs_routes.is_active, TRUE)
                """,
                (
                    route_id,
                    (row.get("agency_id") or "").strip() or None,
                    (row.get("route_short_name") or "").strip() or None,
                    (row.get("route_long_name") or "").strip() or None,
                    (row.get("route_desc") or "").strip() or None,
                    _safe_int(row.get("route_type")),
                    (row.get("route_url") or "").strip() or None,
                    (row.get("route_color") or "").strip() or None,
                    (row.get("route_text_color") or "").strip() or None,
                ),
            )
            imported["routes"] += 1

    with files["trips.txt"].open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            trip_id = (row.get("trip_id") or "").strip()
            if not trip_id:
                continue
            cur.execute(
                """
                INSERT INTO gtfs_trips (trip_id, route_id, service_id, trip_headsign, direction_id, shape_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (trip_id) DO UPDATE
                SET route_id = EXCLUDED.route_id,
                    service_id = EXCLUDED.service_id,
                    trip_headsign = EXCLUDED.trip_headsign,
                    direction_id = EXCLUDED.direction_id,
                    shape_id = EXCLUDED.shape_id
                """,
                (
                    trip_id,
                    (row.get("route_id") or "").strip() or None,
                    (row.get("service_id") or "").strip() or None,
                    (row.get("trip_headsign") or "").strip() or None,
                    _safe_int(row.get("direction_id")),
                    (row.get("shape_id") or "").strip() or None,
                ),
            )
            imported["trips"] += 1

    with files["shapes.txt"].open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            shape_id = (row.get("shape_id") or "").strip()
            shape_pt_sequence = _safe_int(row.get("shape_pt_sequence"))
            shape_pt_lat = _safe_float(row.get("shape_pt_lat"))
            shape_pt_lon = _safe_float(row.get("shape_pt_lon"))
            if not shape_id or shape_pt_sequence is None or shape_pt_lat is None or shape_pt_lon is None:
                continue
            cur.execute(
                """
                INSERT INTO gtfs_shapes (
                    shape_id, shape_pt_sequence, shape_pt_lat, shape_pt_lon, shape_dist_traveled
                )
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (shape_id, shape_pt_sequence) DO UPDATE
                SET shape_pt_lat = EXCLUDED.shape_pt_lat,
                    shape_pt_lon = EXCLUDED.shape_pt_lon,
                    shape_dist_traveled = EXCLUDED.shape_dist_traveled
                """,
                (
                    shape_id,
                    shape_pt_sequence,
                    shape_pt_lat,
                    shape_pt_lon,
                    _safe_float(row.get("shape_dist_traveled")),
                ),
            )
            imported["shapes"] += 1

    with files["stop_times.txt"].open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            trip_id = (row.get("trip_id") or "").strip()
            stop_sequence = _safe_int(row.get("stop_sequence"))
            if not trip_id or stop_sequence is None:
                continue
            cur.execute(
                """
                INSERT INTO gtfs_stop_times (trip_id, stop_sequence, arrival_time, departure_time, stop_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (trip_id, stop_sequence) DO UPDATE
                SET arrival_time = EXCLUDED.arrival_time,
                    departure_time = EXCLUDED.departure_time,
                    stop_id = EXCLUDED.stop_id
                """,
                (
                    trip_id,
                    stop_sequence,
                    (row.get("arrival_time") or "").strip() or None,
                    (row.get("departure_time") or "").strip() or None,
                    (row.get("stop_id") or "").strip() or None,
                ),
            )
            imported["stop_times"] += 1

    return imported


def _import_facility_csv_to_db(
    cur,
    *,
    csv_path: Path,
    table_name: str,
    truncate_before_import: bool,
) -> dict:
    if not csv_path.exists():
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error",
                "message": f"File CSV tidak ditemukan: {csv_path}",
            },
        )
    _ensure_facility_columns(cur)
    if truncate_before_import:
        cur.execute(f"TRUNCATE TABLE {table_name} RESTART IDENTITY")

    inserted = 0
    skipped = 0
    with csv_path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            source_id = (row.get("osm_id") or row.get("id") or "").strip()
            name = (row.get("name") or "").strip() or f"{table_name}_{inserted + 1}"
            latitude = _safe_float(row.get("latitude"))
            longitude = _safe_float(row.get("longitude"))
            if latitude is None or longitude is None:
                skipped += 1
                continue
            cur.execute(
                f"""
                INSERT INTO {table_name}
                    (source_id, name, latitude, longitude, category, subcategory, cuisine, brand, facility_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    source_id or None,
                    name,
                    latitude,
                    longitude,
                    (row.get("category") or "").strip() or None,
                    (row.get("subcategory") or "").strip() or None,
                    (row.get("cuisine") or "").strip() or None,
                    (row.get("brand") or "").strip() or None,
                    (row.get("tipe_fasilitas") or "").strip() or None,
                ),
            )
            inserted += 1
    return {"inserted": inserted, "skipped": skipped, "path": str(csv_path)}


def _get_transjakarta_db_summary(cur) -> dict:
    _ensure_gtfs_tables(cur)
    cur.execute("SELECT COUNT(*) AS count FROM stops")
    total_stops = int(cur.fetchone()["count"])
    cur.execute("SELECT COUNT(*) AS count FROM gtfs_routes")
    total_routes = int(cur.fetchone()["count"])
    cur.execute("SELECT COUNT(*) AS count FROM gtfs_trips")
    total_trips = int(cur.fetchone()["count"])
    cur.execute("SELECT COUNT(*) AS count FROM gtfs_shapes")
    total_shapes = int(cur.fetchone()["count"])
    cur.execute("SELECT COUNT(*) AS count FROM gtfs_stop_times")
    total_stop_times = int(cur.fetchone()["count"])
    cur.execute(
        """
        SELECT COALESCE(route_type, -1) AS route_type, COUNT(*) AS count
        FROM gtfs_routes
        GROUP BY COALESCE(route_type, -1)
        ORDER BY route_type ASC
        """
    )
    route_type_summary = [dict(row) for row in cur.fetchall()]
    return {
        "total_stops": total_stops,
        "total_routes": total_routes,
        "total_trips": total_trips,
        "total_shapes": total_shapes,
        "total_stop_times": total_stop_times,
        "route_type_summary": route_type_summary,
    }


def _list_transjakarta_records(
    cur,
    *,
    dataset: str,
    q: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    config_map = {
        "stops": {
            "table": "stops",
            "columns": "stop_id, stop_name, stop_lat, stop_lon",
            "search_sql": "COALESCE(stop_id,'') ILIKE %s OR COALESCE(stop_name,'') ILIKE %s",
            "order_by": "stop_name ASC, stop_id ASC",
        },
        "routes": {
            "table": "gtfs_routes",
            "columns": (
                "route_id, route_short_name, route_long_name, route_type, route_color, "
                "COALESCE(is_active, TRUE) AS is_active"
            ),
            "search_sql": "COALESCE(route_id,'') ILIKE %s OR COALESCE(route_short_name,'') ILIKE %s OR COALESCE(route_long_name,'') ILIKE %s",
            "order_by": "route_short_name ASC NULLS LAST, route_id ASC",
        },
        "trips": {
            "table": "gtfs_trips",
            "columns": "trip_id, route_id, service_id, direction_id, shape_id",
            "search_sql": "COALESCE(trip_id,'') ILIKE %s OR COALESCE(route_id,'') ILIKE %s OR COALESCE(shape_id,'') ILIKE %s",
            "order_by": "trip_id ASC",
        },
        "shapes": {
            "table": "gtfs_shapes",
            "columns": "shape_id, shape_pt_sequence, shape_pt_lat, shape_pt_lon",
            "search_sql": "COALESCE(shape_id,'') ILIKE %s",
            "order_by": "shape_id ASC, shape_pt_sequence ASC",
        },
        "stop_times": {
            "table": "gtfs_stop_times",
            "columns": "trip_id, stop_sequence, stop_id, arrival_time, departure_time",
            "search_sql": "COALESCE(trip_id,'') ILIKE %s OR COALESCE(stop_id,'') ILIKE %s",
            "order_by": "trip_id ASC, stop_sequence ASC",
        },
    }
    if dataset not in config_map:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Dataset tidak valid."})

    cfg = config_map[dataset]
    keyword = f"%{q.strip()}%"
    search_params: tuple[Any, ...]
    if dataset in {"routes", "trips"}:
        search_params = (keyword, keyword, keyword)
    elif dataset in {"stops", "stop_times"}:
        search_params = (keyword, keyword)
    else:
        search_params = (keyword,)

    cur.execute(
        f"""
        SELECT COUNT(*) AS count
        FROM {cfg['table']}
        WHERE {cfg['search_sql']}
        """,
        search_params,
    )
    total = int(cur.fetchone()["count"])
    offset = (page - 1) * page_size
    cur.execute(
        f"""
        SELECT {cfg['columns']}
        FROM {cfg['table']}
        WHERE {cfg['search_sql']}
        ORDER BY {cfg['order_by']}
        LIMIT %s OFFSET %s
        """,
        (*search_params, page_size, offset),
    )
    items = [_normalize_transjakarta_record(dict(row), dataset) for row in cur.fetchall()]
    return {"items": items, "meta": _pagination_meta(page, page_size, total)}


def _coerce_db_bool(value: Any, *, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "t", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "f", "no", "n", "off"}:
        return False
    return default


def _normalize_transjakarta_record(row: dict[str, Any], dataset: str) -> dict[str, Any]:
    if dataset != "routes":
        return row
    normalized = dict(row)
    normalized["is_active"] = _coerce_db_bool(normalized.get("is_active"), default=True)
    return normalized


def _list_facility_records(
    cur,
    *,
    facility: str,
    q: str,
    category: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    if facility not in {"restaurants", "minimarkets"}:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Facility tidak valid."})
    _ensure_facility_columns(cur)
    keyword = f"%{q.strip()}%"
    category_exact = category.strip() or None
    cur.execute(
        f"""
        SELECT COUNT(*) AS count
        FROM {facility}
        WHERE (
              COALESCE(name, '') ILIKE %s
           OR COALESCE(category, '') ILIKE %s
           OR COALESCE(subcategory, '') ILIKE %s
           OR COALESCE(brand, '') ILIKE %s
        )
          AND (%s::TEXT IS NULL OR COALESCE(subcategory, category, 'unknown') = %s::TEXT)
        """,
        (keyword, keyword, keyword, keyword, category_exact, category_exact),
    )
    total = int(cur.fetchone()["count"])
    offset = (page - 1) * page_size
    cur.execute(
        f"""
        SELECT
            id, source_id, name, category, subcategory, cuisine, brand, facility_type, latitude, longitude
        FROM {facility}
        WHERE (
              COALESCE(name, '') ILIKE %s
           OR COALESCE(category, '') ILIKE %s
           OR COALESCE(subcategory, '') ILIKE %s
           OR COALESCE(brand, '') ILIKE %s
        )
          AND (%s::TEXT IS NULL OR COALESCE(subcategory, category, 'unknown') = %s::TEXT)
        ORDER BY id DESC
        LIMIT %s OFFSET %s
        """,
        (keyword, keyword, keyword, keyword, category_exact, category_exact, page_size, offset),
    )
    items = [dict(row) for row in cur.fetchall()]
    return {"items": items, "meta": _pagination_meta(page, page_size, total)}


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


def _update_facility_record(
    cur,
    *,
    facility: str,
    row_id: int,
    payload: FacilityMutationPayload,
) -> dict[str, Any]:
    if facility not in {"restaurants", "minimarkets"}:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Facility tidak valid."})
    _ensure_facility_columns(cur)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama wajib diisi."})
    cur.execute(
        f"""
        UPDATE {facility}
        SET
            name = %s,
            category = %s,
            subcategory = %s,
            cuisine = %s,
            brand = %s,
            facility_type = %s
        WHERE id = %s
        RETURNING id, source_id, name, category, subcategory, cuisine, brand, facility_type, latitude, longitude
        """,
        (
            name,
            _normalize_optional_text(payload.category),
            _normalize_optional_text(payload.subcategory),
            _normalize_optional_text(payload.cuisine),
            _normalize_optional_text(payload.brand),
            _normalize_optional_text(payload.facility_type),
            row_id,
        ),
    )
    updated = cur.fetchone()
    if not updated:
        raise HTTPException(status_code=404, detail={"status": "error", "message": "Data tidak ditemukan."})
    return dict(updated)


def _delete_facility_record(cur, *, facility: str, row_id: int) -> int:
    if facility not in {"restaurants", "minimarkets"}:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Facility tidak valid."})
    cur.execute(f"DELETE FROM {facility} WHERE id = %s RETURNING id", (row_id,))
    deleted = cur.fetchone()
    if not deleted:
        raise HTTPException(status_code=404, detail={"status": "error", "message": "Data tidak ditemukan."})
    return int(deleted["id"])


def _get_facility_category_summary(cur) -> dict:
    _ensure_facility_columns(cur)
    cur.execute("SELECT COUNT(*) AS count FROM restaurants")
    total_restaurants = int(cur.fetchone()["count"])
    cur.execute("SELECT COUNT(*) AS count FROM minimarkets")
    total_minimarkets = int(cur.fetchone()["count"])

    cur.execute(
        """
        SELECT COALESCE(subcategory, category, 'unknown') AS category_name, COUNT(*) AS count
        FROM restaurants
        GROUP BY COALESCE(subcategory, category, 'unknown')
        ORDER BY count DESC, category_name ASC
        LIMIT 30
        """
    )
    restaurant_categories = [dict(row) for row in cur.fetchall()]

    cur.execute(
        """
        SELECT COALESCE(subcategory, category, 'unknown') AS category_name, COUNT(*) AS count
        FROM minimarkets
        GROUP BY COALESCE(subcategory, category, 'unknown')
        ORDER BY count DESC, category_name ASC
        LIMIT 30
        """
    )
    minimarket_categories = [dict(row) for row in cur.fetchall()]

    cur.execute(
        """
        SELECT COALESCE(brand, 'unbranded') AS brand_name, COUNT(*) AS count
        FROM restaurants
        GROUP BY COALESCE(brand, 'unbranded')
        ORDER BY count DESC, brand_name ASC
        LIMIT 20
        """
    )
    restaurant_brands = [dict(row) for row in cur.fetchall()]

    cur.execute(
        """
        SELECT COALESCE(brand, 'unbranded') AS brand_name, COUNT(*) AS count
        FROM minimarkets
        GROUP BY COALESCE(brand, 'unbranded')
        ORDER BY count DESC, brand_name ASC
        LIMIT 20
        """
    )
    minimarket_brands = [dict(row) for row in cur.fetchall()]

    return {
        "total_restaurants": total_restaurants,
        "total_minimarkets": total_minimarkets,
        "restaurant_categories": restaurant_categories,
        "minimarket_categories": minimarket_categories,
        "restaurant_brands": restaurant_brands,
        "minimarket_brands": minimarket_brands,
        "restaurant_csv_path": str(RESTAURANT_CSV_PATH),
        "minimarket_csv_path": str(MINIMARKET_CSV_PATH),
    }


@router.get("/admin/master-data")
async def get_admin_master_data():
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _bootstrap(cur)
        conn.commit()

        cities, categories, destinations = _load_master_data(cur)
        return {
            "status": "success",
            "cities": cities,
            "categories": categories,
            "destinations": destinations,
        }
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/transjakarta-files")
async def get_transjakarta_files():
    try:
        files = []
        for file_name in TRANSJAKARTA_FILES:
            path = GTFS_DIR / file_name
            row_count, column_count = _count_csv_rows(path)
            files.append(
                {
                    "file_name": file_name,
                    "exists": path.exists(),
                    "row_count": row_count,
                    "column_count": column_count,
                    "path": str(path),
                }
            )
        return {"status": "success", "folder": str(GTFS_DIR), "files": files}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})


@router.get("/admin/transjakarta-db-summary")
async def get_transjakarta_db_summary():
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        summary = _get_transjakarta_db_summary(cur)
        return {"status": "success", "summary": summary}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/transjakarta-records")
async def list_transjakarta_records(
    dataset: str = Query(default="stops"),
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _ensure_gtfs_tables(cur)
        payload = _list_transjakarta_records(
            cur, dataset=dataset, q=q, page=page, page_size=page_size
        )
        return {"status": "success", "dataset": dataset, **payload}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/admin/transjakarta-import")
async def import_transjakarta_data(payload: TransjakartaImportPayload):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        imported = _import_transjakarta_to_db(
            cur, truncate_before_import=payload.truncate_before_import
        )
        conn.commit()
        summary = _get_transjakarta_db_summary(cur)
        return {"status": "success", "imported": imported, "summary": summary}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/facilities/summary")
async def get_facilities_summary():
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        summary = _get_facility_category_summary(cur)
        return {"status": "success", "summary": summary}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/facilities/records")
async def list_facility_records(
    facility: str = Query(default="restaurants"),
    q: str = Query(default="", max_length=120),
    category: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        payload = _list_facility_records(
            cur,
            facility=facility,
            q=q,
            category=category,
            page=page,
            page_size=page_size,
        )
        return {"status": "success", "facility": facility, **payload}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/admin/facilities/import")
async def import_facilities_data(payload: FacilityImportPayload):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        restaurant_result = _import_facility_csv_to_db(
            cur,
            csv_path=RESTAURANT_CSV_PATH,
            table_name="restaurants",
            truncate_before_import=payload.truncate_before_import,
        )
        minimarket_result = _import_facility_csv_to_db(
            cur,
            csv_path=MINIMARKET_CSV_PATH,
            table_name="minimarkets",
            truncate_before_import=payload.truncate_before_import,
        )
        conn.commit()
        summary = _get_facility_category_summary(cur)
        return {
            "status": "success",
            "imported": {
                "restaurants": restaurant_result,
                "minimarkets": minimarket_result,
            },
            "summary": summary,
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.put("/admin/facilities/{facility}/{row_id}")
async def update_facility_record(
    facility: str,
    row_id: int,
    payload: FacilityMutationPayload,
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        item = _update_facility_record(cur, facility=facility, row_id=row_id, payload=payload)
        conn.commit()
        return {"status": "success", "item": item}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.delete("/admin/facilities/{facility}/{row_id}")
async def delete_facility_record(facility: str, row_id: int):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        deleted_id = _delete_facility_record(cur, facility=facility, row_id=row_id)
        conn.commit()
        return {"status": "success", "deleted_id": deleted_id}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/cities")
async def list_cities(
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _bootstrap(cur)
        conn.commit()

        keyword = f"%{q.strip()}%"
        cur.execute(
            """
            SELECT COUNT(*) AS count
            FROM admin_cities
            WHERE name ILIKE %s
            """,
            (keyword,),
        )
        total = int(cur.fetchone()["count"])

        offset = (page - 1) * page_size
        cur.execute(
            """
            SELECT id, name
            FROM admin_cities
            WHERE name ILIKE %s
            ORDER BY name ASC
            LIMIT %s OFFSET %s
            """,
            (keyword, page_size, offset),
        )
        rows = [dict(row) for row in cur.fetchall()]
        return {"status": "success", "items": rows, "meta": _pagination_meta(page, page_size, total)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/admin/cities")
async def create_city(payload: NamePayload):
    conn = None
    cur = None
    try:
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama city wajib diisi."})

        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        cur.execute(
            """
            INSERT INTO admin_cities(name)
            VALUES (%s)
            RETURNING id, name
            """,
            (name,),
        )
        created = dict(cur.fetchone())
        conn.commit()
        return {"status": "success", "item": created}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.put("/admin/cities/{city_id}")
async def update_city(city_id: int, payload: NamePayload):
    conn = None
    cur = None
    try:
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama city wajib diisi."})

        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        cur.execute(
            """
            UPDATE admin_cities
            SET name = %s
            WHERE id = %s
            RETURNING id, name
            """,
            (name, city_id),
        )
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            raise HTTPException(status_code=404, detail={"status": "error", "message": "City tidak ditemukan."})
        conn.commit()
        return {"status": "success", "item": dict(updated)}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.delete("/admin/cities/{city_id}")
async def delete_city(city_id: int):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)

        cur.execute("SELECT COUNT(*) AS count FROM admin_destinations WHERE city_id = %s", (city_id,))
        usage = int(cur.fetchone()["count"])
        if usage > 0:
            raise HTTPException(
                status_code=409,
                detail={"status": "error", "message": "City masih dipakai destinasi, hapus destinasi dulu."},
            )

        cur.execute("DELETE FROM admin_cities WHERE id = %s RETURNING id", (city_id,))
        deleted = cur.fetchone()
        if not deleted:
            conn.rollback()
            raise HTTPException(status_code=404, detail={"status": "error", "message": "City tidak ditemukan."})
        conn.commit()
        return {"status": "success", "deleted_id": city_id}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/categories")
async def list_categories(
    q: str = Query(default="", max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _bootstrap(cur)
        conn.commit()

        keyword = f"%{q.strip()}%"
        cur.execute(
            """
            SELECT COUNT(*) AS count
            FROM admin_categories
            WHERE name ILIKE %s
            """,
            (keyword,),
        )
        total = int(cur.fetchone()["count"])

        offset = (page - 1) * page_size
        cur.execute(
            """
            SELECT id, name
            FROM admin_categories
            WHERE name ILIKE %s
            ORDER BY name ASC
            LIMIT %s OFFSET %s
            """,
            (keyword, page_size, offset),
        )
        rows = [dict(row) for row in cur.fetchall()]
        return {"status": "success", "items": rows, "meta": _pagination_meta(page, page_size, total)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/admin/categories")
async def create_category(payload: NamePayload):
    conn = None
    cur = None
    try:
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama category wajib diisi."})

        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        cur.execute(
            """
            INSERT INTO admin_categories(name)
            VALUES (%s)
            RETURNING id, name
            """,
            (name,),
        )
        created = dict(cur.fetchone())
        conn.commit()
        return {"status": "success", "item": created}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.put("/admin/categories/{category_id}")
async def update_category(category_id: int, payload: NamePayload):
    conn = None
    cur = None
    try:
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama category wajib diisi."})

        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        cur.execute(
            """
            UPDATE admin_categories
            SET name = %s
            WHERE id = %s
            RETURNING id, name
            """,
            (name, category_id),
        )
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Category tidak ditemukan."})
        conn.commit()
        return {"status": "success", "item": dict(updated)}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.delete("/admin/categories/{category_id}")
async def delete_category(category_id: int):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)

        cur.execute("SELECT COUNT(*) AS count FROM admin_destinations WHERE category_id = %s", (category_id,))
        usage = int(cur.fetchone()["count"])
        if usage > 0:
            raise HTTPException(
                status_code=409,
                detail={"status": "error", "message": "Category masih dipakai destinasi, hapus destinasi dulu."},
            )

        cur.execute("DELETE FROM admin_categories WHERE id = %s RETURNING id", (category_id,))
        deleted = cur.fetchone()
        if not deleted:
            conn.rollback()
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Category tidak ditemukan."})
        conn.commit()
        return {"status": "success", "deleted_id": category_id}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/destinations")
async def list_destinations(
    q: str = Query(default="", max_length=120),
    city_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    status: str = Query(default="all"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _bootstrap(cur)
        conn.commit()

        keyword = f"%{q.strip()}%"
        active_filter = None
        if status == "active":
            active_filter = True
        elif status == "inactive":
            active_filter = False

        count_sql = """
            SELECT COUNT(*) AS count
            FROM admin_destinations d
            JOIN admin_cities c ON c.id = d.city_id
            JOIN admin_categories k ON k.id = d.category_id
            WHERE d.name ILIKE %s
              AND (%s::INT IS NULL OR d.city_id = %s::INT)
              AND (%s::INT IS NULL OR d.category_id = %s::INT)
              AND (%s::BOOLEAN IS NULL OR d.is_active = %s::BOOLEAN)
        """
        count_params = (
            keyword,
            city_id,
            city_id,
            category_id,
            category_id,
            active_filter,
            active_filter,
        )
        cur.execute(count_sql, count_params)
        total = int(cur.fetchone()["count"])

        offset = (page - 1) * page_size
        cur.execute(
            """
            SELECT
                d.id,
                d.name,
                d.city_id,
                c.name AS city_name,
                d.category_id,
                k.name AS category_name,
                d.is_active,
                d.is_osm_pdf,
                d.is_osm_only,
                ep.id AS poi_id,
                ep.description AS poi_description,
                ep.subcategory AS poi_subcategory,
                ep.latitude AS poi_latitude,
                ep.longitude AS poi_longitude,
                ep.phone AS poi_phone,
                ep.website AS poi_website,
                ep.district AS poi_district,
                ep.category AS poi_category_raw,
                ep.source AS poi_source,
                ep.source_id AS poi_source_id
            FROM admin_destinations d
            JOIN admin_cities c ON c.id = d.city_id
            JOIN admin_categories k ON k.id = d.category_id
            LEFT JOIN LATERAL (
                SELECT
                    p.id,
                    p.description,
                    p.subcategory,
                    p.latitude,
                    p.longitude,
                    p.phone,
                    p.website,
                    p.district,
                    p.category,
                    p.source,
                    p.source_id
                FROM poi_enriched p
                WHERE LOWER(TRIM(COALESCE(p.name, ''))) = LOWER(TRIM(COALESCE(d.name, '')))
                  AND LOWER(TRIM(COALESCE(p.district, ''))) = LOWER(TRIM(COALESCE(c.name, '')))
                  AND LOWER(TRIM(COALESCE(p.category, ''))) = LOWER(TRIM(COALESCE(k.name, '')))
                ORDER BY p.id ASC
                LIMIT 1
            ) ep ON TRUE
            WHERE d.name ILIKE %s
              AND (%s::INT IS NULL OR d.city_id = %s::INT)
              AND (%s::INT IS NULL OR d.category_id = %s::INT)
              AND (%s::BOOLEAN IS NULL OR d.is_active = %s::BOOLEAN)
            ORDER BY d.name ASC
            LIMIT %s OFFSET %s
            """,
            (
                keyword,
                city_id,
                city_id,
                category_id,
                category_id,
                active_filter,
                active_filter,
                page_size,
                offset,
            ),
        )
        rows = [dict(row) for row in cur.fetchall()]
        for row in rows:
            row["is_protected"] = bool(row.get("is_osm_pdf"))
        return {"status": "success", "items": rows, "meta": _pagination_meta(page, page_size, total)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/admin/destinations")
async def create_destination(payload: DestinationPayload):
    conn = None
    cur = None
    try:
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama destinasi wajib diisi."})

        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        cur.execute(
            """
            INSERT INTO admin_destinations(name, city_id, category_id, is_active)
            VALUES (%s, %s, %s, TRUE)
            RETURNING id, name, city_id, category_id, is_active
            """,
            (name, payload.city_id, payload.category_id),
        )
        created = dict(cur.fetchone())
        _sync_destination_source_flags(cur, [created["id"]])
        _enforce_source_status_rules(cur, [created["id"]])
        cur.execute(
            """
            SELECT id, name, city_id, category_id, is_active, is_osm_pdf, is_osm_only
            FROM admin_destinations
            WHERE id = %s
            """,
            (created["id"],),
        )
        created = dict(cur.fetchone())
        conn.commit()
        _invalidate_search_index_cache_safe()
        return {"status": "success", "item": created}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.put("/admin/destinations/{destination_id}")
async def update_destination(destination_id: int, payload: DestinationPayload):
    conn = None
    cur = None
    try:
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama destinasi wajib diisi."})

        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        cur.execute(
            """
            UPDATE admin_destinations
            SET name = %s, city_id = %s, category_id = %s
            WHERE id = %s
            RETURNING id, name, city_id, category_id, is_active
            """,
            (name, payload.city_id, payload.category_id, destination_id),
        )
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Destinasi tidak ditemukan."})
        _sync_destination_source_flags(cur, [destination_id])
        _enforce_source_status_rules(cur, [destination_id])
        cur.execute(
            """
            SELECT id, name, city_id, category_id, is_active, is_osm_pdf, is_osm_only
            FROM admin_destinations
            WHERE id = %s
            """,
            (destination_id,),
        )
        updated = cur.fetchone()
        conn.commit()
        _invalidate_search_index_cache_safe()
        return {"status": "success", "item": dict(updated)}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.delete("/admin/destinations/{destination_id}")
async def delete_destination(destination_id: int):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        cur.execute("DELETE FROM admin_destinations WHERE id = %s RETURNING id", (destination_id,))
        deleted = cur.fetchone()
        if not deleted:
            conn.rollback()
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Destinasi tidak ditemukan."})
        conn.commit()
        _invalidate_search_index_cache_safe()
        return {"status": "success", "deleted_id": destination_id}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.patch("/admin/destinations/{destination_id}/status")
async def update_destination_status(destination_id: int, payload: DestinationStatusPayload):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)

        cur.execute(
            """
            SELECT
                is_osm_pdf,
                is_osm_only
            FROM admin_destinations
            WHERE id = %s
            """,
            (destination_id,),
        )
        source_flags = cur.fetchone()
        if source_flags and payload.is_active is False and bool(source_flags["is_osm_pdf"]):
            raise HTTPException(
                status_code=409,
                detail={
                    "status": "error",
                    "message": "Destinasi sumber OSM+PDF wajib aktif dan tidak boleh dinonaktifkan.",
                },
            )
        if source_flags and payload.is_active is True and bool(source_flags["is_osm_only"]):
            raise HTTPException(
                status_code=409,
                detail={
                    "status": "error",
                    "message": "Destinasi sumber OSM Only wajib inactive dan tidak boleh diaktifkan.",
                },
            )

        cur.execute(
            """
            UPDATE admin_destinations
            SET is_active = %s
            WHERE id = %s
            RETURNING id, name, city_id, category_id, is_active
            """,
            (payload.is_active, destination_id),
        )
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            raise HTTPException(
                status_code=404,
                detail={"status": "error", "message": "Destinasi tidak ditemukan."},
            )

        conn.commit()
        _invalidate_search_index_cache_safe()
        return {"status": "success", "destination": dict(updated)}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.patch("/admin/destinations/{destination_id}/description")
async def update_destination_description(destination_id: int, payload: DestinationDescriptionPayload):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)
        normalized_description = (payload.description or "").strip()
        normalized_description_or_none = normalized_description or None

        cur.execute(
            """
            SELECT
                d.id,
                d.name,
                c.name AS city_name,
                k.name AS category_name
            FROM admin_destinations d
            JOIN admin_cities c ON c.id = d.city_id
            JOIN admin_categories k ON k.id = d.category_id
            WHERE d.id = %s
            """,
            (destination_id,),
        )
        destination = cur.fetchone()
        if not destination:
            conn.rollback()
            raise HTTPException(
                status_code=404,
                detail={"status": "error", "message": "Destinasi tidak ditemukan."},
            )

        cur.execute(
            """
            UPDATE poi_enriched p
            SET description = %s
            WHERE LOWER(TRIM(COALESCE(p.name, ''))) = LOWER(TRIM(COALESCE(%s, '')))
              AND LOWER(TRIM(COALESCE(p.district, ''))) = LOWER(TRIM(COALESCE(%s, '')))
              AND LOWER(TRIM(COALESCE(p.category, ''))) = LOWER(TRIM(COALESCE(%s, '')))
            RETURNING p.id
            """,
            (
                normalized_description_or_none,
                destination["name"],
                destination["city_name"],
                destination["category_name"],
            ),
        )
        updated_rows = cur.fetchall()
        if not updated_rows:
            conn.rollback()
            raise HTTPException(
                status_code=404,
                detail={
                    "status": "error",
                    "message": "Baris deskripsi di poi_enriched tidak ditemukan untuk destinasi ini.",
                },
            )

        conn.commit()
        _invalidate_search_index_cache_safe()
        return {
            "status": "success",
            "destination_id": destination_id,
            "updated_poi_count": len(updated_rows),
            "description": normalized_description_or_none,
        }
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.patch("/admin/transjakarta-routes/status")
@router.post("/admin/transjakarta-routes/status")
async def update_transjakarta_route_status(payload: TransjakartaRouteStatusPayload):
    return _update_transjakarta_route_status(payload.route_id, payload.is_active)


@router.patch("/admin/transjakarta-routes/{route_id}/status")
async def update_transjakarta_route_status_by_path(route_id: str, payload: DestinationStatusPayload):
    return _update_transjakarta_route_status(route_id, payload.is_active)


def _update_transjakarta_route_status(route_id: str, is_active: bool):
    conn = None
    cur = None
    try:
        normalized_route_id = route_id.strip()
        if not normalized_route_id:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "route_id wajib diisi."})
        conn = get_connection()
        cur = conn.cursor()
        _ensure_gtfs_tables(cur)
        cur.execute(
            """
            UPDATE gtfs_routes
            SET is_active = %s
            WHERE route_id = %s
            RETURNING route_id, route_short_name, route_long_name, is_active
            """,
            (is_active, normalized_route_id),
        )
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Route tidak ditemukan."})
        conn.commit()
        route = dict(updated)
        route["is_active"] = _coerce_db_bool(route.get("is_active"), default=True)
        return {"status": "success", "route": route}
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.patch("/admin/destinations/bulk-status")
async def update_destination_bulk_status(payload: DestinationBulkStatusPayload):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        _ensure_master_tables(cur)

        cur.execute(
            """
            SELECT COUNT(*) AS count
            FROM admin_destinations d
            WHERE (%s::INT IS NULL OR d.category_id = %s::INT)
            """,
            (payload.category_id, payload.category_id),
        )
        matched_count = int(cur.fetchone()["count"])

        skipped_protected = 0
        skipped_locked = 0
        skipped_osm_only = 0
        if payload.is_active is False:
            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM admin_destinations d
                WHERE (%s::INT IS NULL OR d.category_id = %s::INT)
                  AND d.is_osm_pdf = TRUE
                """,
                (payload.category_id, payload.category_id),
            )
            skipped_protected = int(cur.fetchone()["count"])
            skipped_locked = skipped_protected
        if payload.is_active is True:
            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM admin_destinations d
                WHERE (%s::INT IS NULL OR d.category_id = %s::INT)
                  AND d.is_osm_only = TRUE
                  AND d.is_osm_pdf = FALSE
                """,
                (payload.category_id, payload.category_id),
            )
            skipped_osm_only = int(cur.fetchone()["count"])
            skipped_locked = skipped_osm_only

        update_sql = """
            UPDATE admin_destinations d
            SET is_active = %s
            WHERE (%s::INT IS NULL OR d.category_id = %s::INT)
              AND d.is_active IS DISTINCT FROM %s
        """
        params: list[Any] = [payload.is_active, payload.category_id, payload.category_id, payload.is_active]
        if payload.is_active is False:
            update_sql += " AND d.is_osm_pdf = FALSE"
        if payload.is_active is True:
            update_sql += " AND (d.is_osm_only = FALSE OR d.is_osm_pdf = TRUE)"
        update_sql += " RETURNING id"

        cur.execute(update_sql, tuple(params))
        updated_count = len(cur.fetchall())
        conn.commit()

        _invalidate_search_index_cache_safe()

        return {
            "status": "success",
            "updated_count": updated_count,
            "matched_count": matched_count,
            "skipped_protected_count": skipped_protected,
            "skipped_osm_only_count": skipped_osm_only,
            "skipped_locked_count": skipped_locked,
            "is_active": payload.is_active,
            "category_id": payload.category_id,
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
