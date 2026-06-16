import csv
import math
import os
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

from fastapi import APIRouter, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from database import get_connection
from geo_urls import build_google_maps_url
from poi_visibility_sql import SQL_FOR_EDA
from services.gtfs_stops_service import count_stops_for_active_routes, load_stop_locations_for_active_routes

router = APIRouter()

GTFS_DIR = Path(
    os.getenv(
        "GTFS_DIR",
        str(Path(__file__).resolve().parents[2] / "mdb-1909-202602150020"),
    )
)

ROUTE_TYPE_LABELS = {
    0: "Tram/LRT",
    1: "Subway/Metro",
    2: "Rail",
    3: "Bus",
    4: "Ferry",
    5: "Cable Tram",
    6: "Aerial Lift",
    7: "Funicular",
    11: "Trolleybus",
    12: "Monorail",
}

JAKARTA_BOUNDS = {
    "min_lat": -6.45,
    "max_lat": -5.35,
    "min_lon": 106.45,
    "max_lon": 107.05,
}


def _is_in_jakarta(lat: float, lon: float) -> bool:
    return (
        JAKARTA_BOUNDS["min_lat"] <= lat <= JAKARTA_BOUNDS["max_lat"]
        and JAKARTA_BOUNDS["min_lon"] <= lon <= JAKARTA_BOUNDS["max_lon"]
    )


def _safe_int(value: str | None, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _safe_float(value: str | None, default: float = 0.0) -> float:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def _sample_route_points(points: List[List[float]], max_points: int = 180) -> List[List[float]]:
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    sampled = points[::step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def _filter_locations_in_jakarta(rows: List[dict], lat_key: str, lon_key: str) -> List[dict]:
    filtered: List[dict] = []
    for row in rows:
        lat = float(row[lat_key])
        lon = float(row[lon_key])
        if _is_in_jakarta(lat, lon):
            filtered.append(row)
    return filtered


def _filter_route_lines_in_jakarta(route_lines: List[dict]) -> List[dict]:
    filtered_lines: List[dict] = []
    for line in route_lines:
        points = [
            point
            for point in line.get("points", [])
            if len(point) >= 2 and _is_in_jakarta(float(point[0]), float(point[1]))
        ]
        if len(points) < 2:
            continue
        next_line = dict(line)
        next_line["points"] = _sample_route_points(points)
        filtered_lines.append(next_line)
    return filtered_lines


def _load_bus_route_lines_from_db(cur) -> tuple[List[dict], List[dict]]:
    cur.execute(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('gtfs_routes', 'gtfs_trips', 'gtfs_shapes')
        """
    )
    if int(cur.fetchone()["count"]) < 3:
        return [], []

    cur.execute("ALTER TABLE gtfs_routes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")

    cur.execute(
        """
        SELECT route_id, route_short_name, route_long_name, route_type, route_color, is_active
        FROM gtfs_routes
        """
    )
    routes_meta: Dict[str, dict] = {}
    for row in cur.fetchall():
        route_id = (row.get("route_id") or "").strip()
        if not route_id:
            continue
        route_type = _safe_int(str(row.get("route_type")), 3)
        is_active = bool(row.get("is_active", True))
        if not is_active:
            continue
        routes_meta[route_id] = {
            "route_id": route_id,
            "route_short_name": (row.get("route_short_name") or "").strip(),
            "route_long_name": (row.get("route_long_name") or "").strip(),
            "route_type": route_type,
            "route_type_label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
            "route_color": (row.get("route_color") or "").strip(),
        }

    cur.execute(
        """
        SELECT route_id, shape_id
        FROM gtfs_trips
        WHERE route_id IS NOT NULL AND shape_id IS NOT NULL
        ORDER BY trip_id
        """
    )
    route_shape_map: Dict[str, str] = {}
    for row in cur.fetchall():
        route_id = (row.get("route_id") or "").strip()
        shape_id = (row.get("shape_id") or "").strip()
        if route_id and shape_id and route_id not in route_shape_map:
            route_shape_map[route_id] = shape_id

    cur.execute(
        """
        SELECT shape_id, shape_pt_sequence, shape_pt_lat, shape_pt_lon
        FROM gtfs_shapes
        WHERE shape_id IS NOT NULL
          AND shape_pt_sequence IS NOT NULL
          AND shape_pt_lat IS NOT NULL
          AND shape_pt_lon IS NOT NULL
        ORDER BY shape_id, shape_pt_sequence
        """
    )
    shape_points: Dict[str, List[Tuple[int, List[float]]]] = defaultdict(list)
    for row in cur.fetchall():
        shape_id = (row.get("shape_id") or "").strip()
        if not shape_id:
            continue
        lat = _safe_float(str(row.get("shape_pt_lat")))
        lon = _safe_float(str(row.get("shape_pt_lon")))
        sequence = _safe_int(str(row.get("shape_pt_sequence")), 0)
        if abs(lat) > 90 or abs(lon) > 180:
            continue
        shape_points[shape_id].append((sequence, [lat, lon]))

    route_lines: List[dict] = []
    for route_id, shape_id in route_shape_map.items():
        route_meta = routes_meta.get(route_id)
        if not route_meta:
            continue
        points_with_seq = shape_points.get(shape_id, [])
        if len(points_with_seq) < 2:
            continue
        points_with_seq.sort(key=lambda item: item[0])
        ordered_points = [item[1] for item in points_with_seq]
        route_name = (
            route_meta["route_short_name"]
            or route_meta["route_long_name"]
            or f"Route {route_id}"
        )
        route_lines.append(
            {
                "route_id": route_id,
                "route_name": route_name,
                "route_short_name": route_meta["route_short_name"],
                "route_long_name": route_meta["route_long_name"],
                "route_type": route_meta["route_type"],
                "route_type_label": route_meta["route_type_label"],
                "line_color": (
                    f"#{route_meta['route_color']}"
                    if route_meta["route_color"] and len(route_meta["route_color"]) == 6
                    else None
                ),
                "shape_id": shape_id,
                "points": _sample_route_points(ordered_points),
            }
        )

    route_lines.sort(key=lambda item: (item["route_type"], item["route_name"]))

    route_type_counts: Dict[int, int] = defaultdict(int)
    for line in route_lines:
        route_type_counts[int(line["route_type"])] += 1
    route_type_summary = [
        {
            "route_type": route_type,
            "label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
            "count": count,
        }
        for route_type, count in sorted(route_type_counts.items(), key=lambda item: item[0])
    ]
    return route_lines, route_type_summary


def _load_bus_route_lines_from_gtfs() -> tuple[List[dict], List[dict]]:
    routes_file = GTFS_DIR / "routes.txt"
    trips_file = GTFS_DIR / "trips.txt"
    shapes_file = GTFS_DIR / "shapes.txt"
    if not routes_file.exists() or not trips_file.exists() or not shapes_file.exists():
        return [], []

    routes_meta: Dict[str, dict] = {}
    with routes_file.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            if not route_id:
                continue
            route_type = _safe_int(row.get("route_type"), 3)
            routes_meta[route_id] = {
                "route_id": route_id,
                "route_short_name": (row.get("route_short_name") or "").strip(),
                "route_long_name": (row.get("route_long_name") or "").strip(),
                "route_type": route_type,
                "route_type_label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
                "route_color": (row.get("route_color") or "").strip(),
            }

    route_shape_map: Dict[str, str] = {}
    with trips_file.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            shape_id = (row.get("shape_id") or "").strip()
            if not route_id or not shape_id:
                continue
            if route_id not in route_shape_map:
                route_shape_map[route_id] = shape_id

    shape_points: Dict[str, List[Tuple[int, List[float]]]] = defaultdict(list)
    with shapes_file.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            shape_id = (row.get("shape_id") or "").strip()
            if not shape_id:
                continue
            lat = _safe_float(row.get("shape_pt_lat"))
            lon = _safe_float(row.get("shape_pt_lon"))
            if abs(lat) > 90 or abs(lon) > 180:
                continue
            sequence = _safe_int(row.get("shape_pt_sequence"), 0)
            shape_points[shape_id].append((sequence, [lat, lon]))

    route_lines: List[dict] = []
    for route_id, shape_id in route_shape_map.items():
        route_meta = routes_meta.get(route_id)
        if not route_meta:
            continue
        points_with_seq = shape_points.get(shape_id, [])
        if len(points_with_seq) < 2:
            continue
        points_with_seq.sort(key=lambda item: item[0])
        ordered_points = [item[1] for item in points_with_seq]

        route_name = (
            route_meta["route_short_name"]
            or route_meta["route_long_name"]
            or f"Route {route_id}"
        )
        route_lines.append(
            {
                "route_id": route_id,
                "route_name": route_name,
                "route_short_name": route_meta["route_short_name"],
                "route_long_name": route_meta["route_long_name"],
                "route_type": route_meta["route_type"],
                "route_type_label": route_meta["route_type_label"],
                "line_color": (
                    f"#{route_meta['route_color']}"
                    if route_meta["route_color"] and len(route_meta["route_color"]) == 6
                    else None
                ),
                "shape_id": shape_id,
                "points": _sample_route_points(ordered_points),
            }
        )

    route_lines.sort(key=lambda item: (item["route_type"], item["route_name"]))

    route_type_counts: Dict[int, int] = defaultdict(int)
    for line in route_lines:
        route_type_counts[int(line["route_type"])] += 1

    route_type_summary = [
        {
            "route_type": route_type,
            "label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
            "count": count,
        }
        for route_type, count in sorted(route_type_counts.items(), key=lambda item: item[0])
    ]

    return route_lines, route_type_summary


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_earth_m = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_earth_m * c


def _compute_coordinate_bounds(
    poi_locations: List[dict],
    stop_locations: List[dict],
    restaurant_locations: List[dict],
    minimarket_locations: List[dict],
    bus_route_lines: List[dict],
) -> dict:
    lats: List[float] = []
    lons: List[float] = []

    for poi in poi_locations:
        lats.append(float(poi["latitude"]))
        lons.append(float(poi["longitude"]))
    for stop in stop_locations:
        lats.append(float(stop["stop_lat"]))
        lons.append(float(stop["stop_lon"]))
    for resto in restaurant_locations:
        lats.append(float(resto["latitude"]))
        lons.append(float(resto["longitude"]))
    for mini in minimarket_locations:
        lats.append(float(mini["latitude"]))
        lons.append(float(mini["longitude"]))
    for route in bus_route_lines:
        for point in route.get("points", []):
            if not point or len(point) < 2:
                continue
            lats.append(float(point[0]))
            lons.append(float(point[1]))

    if not lats or not lons:
        return {
            "min_lat": -6.39,
            "max_lat": -6.09,
            "min_lon": 106.69,
            "max_lon": 106.99,
        }

    return {
        "min_lat": min(lats),
        "max_lat": max(lats),
        "min_lon": min(lons),
        "max_lon": max(lons),
    }


def _build_poi_density_grid(poi_locations: List[dict], cell_size_deg: float = 0.01) -> List[dict]:
    buckets: Dict[Tuple[int, int], int] = {}
    for poi in poi_locations:
        lat = float(poi["latitude"])
        lon = float(poi["longitude"])
        key = (math.floor(lat / cell_size_deg), math.floor(lon / cell_size_deg))
        buckets[key] = buckets.get(key, 0) + 1

    if not buckets:
        return []

    max_count = max(buckets.values())
    rows: List[dict] = []
    for (lat_idx, lon_idx), count in buckets.items():
        lat_min = lat_idx * cell_size_deg
        lon_min = lon_idx * cell_size_deg
        rows.append(
            {
                "cell_id": f"{lat_idx}:{lon_idx}",
                "lat_min": lat_min,
                "lat_max": lat_min + cell_size_deg,
                "lon_min": lon_min,
                "lon_max": lon_min + cell_size_deg,
                "center_lat": lat_min + (cell_size_deg / 2),
                "center_lon": lon_min + (cell_size_deg / 2),
                "count": count,
                "intensity": round(count / max_count, 4),
            }
        )
    rows.sort(key=lambda item: item["count"], reverse=True)
    return rows


def _build_district_details(
    poi_locations: List[dict],
    stop_locations: List[dict],
    total_poi: int,
) -> List[dict]:
    district_map: Dict[str, dict] = {}
    for poi in poi_locations:
        district = (poi.get("district") or "Tidak diketahui").strip()
        if district not in district_map:
            district_map[district] = {
                "district": district,
                "poi_count": 0,
                "sum_lat": 0.0,
                "sum_lon": 0.0,
                "nearest_stop_distance_m": None,
            }
        district_map[district]["poi_count"] += 1
        district_map[district]["sum_lat"] += float(poi["latitude"])
        district_map[district]["sum_lon"] += float(poi["longitude"])

    stop_points = [(float(stop["stop_lat"]), float(stop["stop_lon"])) for stop in stop_locations]

    district_details: List[dict] = []
    for district, item in district_map.items():
        poi_count = item["poi_count"]
        centroid_lat = item["sum_lat"] / poi_count
        centroid_lon = item["sum_lon"] / poi_count

        nearest_stop_distance_m = None
        if stop_points:
            nearest_stop_distance_m = min(
                _haversine_m(centroid_lat, centroid_lon, stop_lat, stop_lon)
                for stop_lat, stop_lon in stop_points
            )

        district_details.append(
            {
                "district": district,
                "poi_count": poi_count,
                "centroid_lat": round(centroid_lat, 6),
                "centroid_lon": round(centroid_lon, 6),
                "poi_density_index": round(poi_count / total_poi, 4) if total_poi > 0 else 0.0,
                "nearest_stop_distance_m": (
                    round(nearest_stop_distance_m, 2)
                    if nearest_stop_distance_m is not None
                    else None
                ),
            }
        )

    district_details.sort(key=lambda item: item["poi_count"], reverse=True)
    return district_details


@router.get("/eda")
async def get_eda_data():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) AS count FROM admin_destinations WHERE is_active = TRUE")
        admin_active_count = int(cur.fetchone()["count"])

        cur.execute(
            f"""
            SELECT COUNT(*) AS count
            FROM poi_enriched p
            WHERE latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            {SQL_FOR_EDA}
            """,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        total_poi = int(cur.fetchone()["count"])

        total_stops = count_stops_for_active_routes(
            cur,
            min_lat=JAKARTA_BOUNDS["min_lat"],
            max_lat=JAKARTA_BOUNDS["max_lat"],
            min_lon=JAKARTA_BOUNDS["min_lon"],
            max_lon=JAKARTA_BOUNDS["max_lon"],
        )

        cur.execute(
            """
            SELECT COUNT(*) AS count
            FROM restaurants
            WHERE latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            """,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        total_restaurants = int(cur.fetchone()["count"])

        cur.execute(
            """
            SELECT COUNT(*) AS count
            FROM minimarkets
            WHERE latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            """,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        total_minimarkets = int(cur.fetchone()["count"])

        cur.execute(
            f"""
            SELECT id, name, category, subcategory, latitude, longitude, district
            FROM poi_enriched p
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
              AND latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            {SQL_FOR_EDA}
            """
            ,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        poi_locations = [dict(row) for row in cur.fetchall()]
        for poi in poi_locations:
            poi["google_maps_url"] = build_google_maps_url(
                poi.get("latitude"),
                poi.get("longitude"),
                poi.get("name"),
            )

        cur.execute(
            f"""
            SELECT COUNT(*) AS count
            FROM poi_enriched p
            WHERE latitude IS NULL OR longitude IS NULL
            {SQL_FOR_EDA}
            """
        )
        poi_missing_coordinates = int(cur.fetchone()["count"])

        stop_locations = load_stop_locations_for_active_routes(
            cur,
            min_lat=JAKARTA_BOUNDS["min_lat"],
            max_lat=JAKARTA_BOUNDS["max_lat"],
            min_lon=JAKARTA_BOUNDS["min_lon"],
            max_lon=JAKARTA_BOUNDS["max_lon"],
            limit=None,
        )

        cur.execute(
            """
            SELECT name, latitude, longitude
            FROM restaurants
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
              AND latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            """
            ,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        restaurant_locations = [dict(row) for row in cur.fetchall()]

        cur.execute(
            """
            SELECT name, latitude, longitude
            FROM minimarkets
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
              AND latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            """
            ,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        minimarket_locations = [dict(row) for row in cur.fetchall()]

        cur.execute(
            f"""
            SELECT category, COUNT(*) AS count
            FROM poi_enriched p
            WHERE latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            {SQL_FOR_EDA}
            GROUP BY category
            ORDER BY count DESC
            """
            ,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        poi_by_category = [dict(row) for row in cur.fetchall()]

        cur.execute(
            f"""
            SELECT district, COUNT(*) AS count
            FROM poi_enriched p
            WHERE district IS NOT NULL
              AND latitude BETWEEN %s AND %s
              AND longitude BETWEEN %s AND %s
            {SQL_FOR_EDA}
            GROUP BY district
            ORDER BY count DESC
            """
            ,
            (
                JAKARTA_BOUNDS["min_lat"],
                JAKARTA_BOUNDS["max_lat"],
                JAKARTA_BOUNDS["min_lon"],
                JAKARTA_BOUNDS["max_lon"],
            ),
        )
        poi_by_district = [dict(row) for row in cur.fetchall()]

        bus_route_lines, bus_route_type_summary = _load_bus_route_lines_from_db(cur)
        if not bus_route_lines:
            bus_route_lines, bus_route_type_summary = _load_bus_route_lines_from_gtfs()
        bus_route_lines = _filter_route_lines_in_jakarta(bus_route_lines)
        route_type_counts: Dict[int, int] = defaultdict(int)
        for line in bus_route_lines:
            route_type_counts[int(line["route_type"])] += 1
        bus_route_type_summary = [
            {
                "route_type": route_type,
                "label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
                "count": count,
            }
            for route_type, count in sorted(route_type_counts.items(), key=lambda item: item[0])
        ]

        poi_locations = _filter_locations_in_jakarta(poi_locations, "latitude", "longitude")
        stop_locations = _filter_locations_in_jakarta(stop_locations, "stop_lat", "stop_lon")
        restaurant_locations = _filter_locations_in_jakarta(
            restaurant_locations, "latitude", "longitude"
        )
        minimarket_locations = _filter_locations_in_jakarta(
            minimarket_locations, "latitude", "longitude"
        )

        poi_density_grid = _build_poi_density_grid(poi_locations)
        district_details = _build_district_details(poi_locations, stop_locations, total_poi)
        coordinate_bounds = _compute_coordinate_bounds(
            poi_locations,
            stop_locations,
            restaurant_locations,
            minimarket_locations,
            bus_route_lines,
        )

        densest_district = district_details[0] if district_details else None
        sparsest_district = district_details[-1] if district_details else None
        avg_nearest_stop_distance_m = None
        distances = [
            item["nearest_stop_distance_m"]
            for item in district_details
            if item["nearest_stop_distance_m"] is not None
        ]
        if distances:
            avg_nearest_stop_distance_m = round(sum(distances) / len(distances), 2)

        coordinate_completeness_pct = (
            round((total_poi - poi_missing_coordinates) / total_poi * 100, 2)
            if total_poi > 0
            else 0.0
        )

        cur.close()
        conn.close()

        payload = {
            "status": "success",
            "stats": {
                "total_poi": total_poi,
                "admin_active_destinations": admin_active_count,
                "total_stops": total_stops,
                "total_restaurants": total_restaurants,
                "total_minimarkets": total_minimarkets,
                "total_bus_routes": len(bus_route_lines),
            },
            "poi_locations": poi_locations,
            "stop_locations": stop_locations,
            "restaurant_locations": restaurant_locations,
            "minimarket_locations": minimarket_locations,
            "poi_by_category": poi_by_category,
            "poi_by_district": poi_by_district,
            "poi_missing_coordinates": poi_missing_coordinates,
            "poi_density_grid": poi_density_grid,
            "district_details": district_details,
            "coordinate_bounds": coordinate_bounds,
            "spatial_insights": {
                "district_coverage": len(district_details),
                "coordinate_completeness_pct": coordinate_completeness_pct,
                "avg_nearest_stop_distance_m": avg_nearest_stop_distance_m,
                "densest_district": densest_district,
                "sparsest_district": sparsest_district,
            },
            "bus_route_lines": bus_route_lines,
            "bus_route_type_summary": bus_route_type_summary,
            "gtfs_source_folder": str(GTFS_DIR),
        }
        return JSONResponse(
            content=jsonable_encoder(payload),
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})
